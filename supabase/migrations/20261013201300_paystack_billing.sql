begin;
alter table public.accounts
  add column paystack_customer_code text unique,
  add column paystack_subscription_code text unique,
  add column paystack_plan_code text,
  add column paystack_status text,
  add column paystack_paid_at timestamptz,
  add column billing_interval text check (billing_interval in ('monthly','yearly'));
create table public.paystack_checkouts (
  reference text primary key,
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  plan text not null check (plan in ('starter','growth','agency')),
  billing_interval text not null check (billing_interval in ('monthly','yearly')),
  plan_code text not null, email text not null,
  authorization_url text,
  state text not null default 'pending' check (state in ('pending','paid','closed')),
  created_at timestamptz not null default now()
);
create unique index paystack_one_pending_checkout on public.paystack_checkouts(user_id) where state='pending';
create index paystack_checkouts_owner on public.paystack_checkouts(user_id);
create table public.paystack_payments (
  reference text primary key,
  user_id uuid not null references public.accounts(user_id) on delete cascade,
  amount integer not null, currency text not null check (currency='USD'),
  paid_at timestamptz not null, expires_at timestamptz not null,
  plan text not null check (plan in ('starter','growth','agency')),
  billing_interval text not null check (billing_interval in ('monthly','yearly')),
  created_at timestamptz not null default now()
);
create index paystack_payments_owner on public.paystack_payments(user_id);
alter table public.paystack_checkouts enable row level security;
alter table public.paystack_payments enable row level security;
revoke all on public.paystack_checkouts,public.paystack_payments from public,anon,authenticated;
grant all on public.paystack_checkouts,public.paystack_payments to service_role;

-- Service-only reservation, serialized on the account. No client can choose its owner.
create function public.reserve_paystack_checkout(account_id uuid,new_reference text,provider_plan text,new_plan text,new_interval text,customer_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.accounts; c public.paystack_checkouts;
begin
  select * into strict a from public.accounts where user_id=account_id for update;
  if a.paystack_plan_code is not null or (a.subscription_status in ('active','trialing') and a.subscription_expires_at>now()) then
    return jsonb_build_object('error','You already have a subscription. Use Manage billing to cancel or update payment details. Contact support to change plans.');
  end if;
  select * into c from public.paystack_checkouts where user_id=account_id and state='pending';
  if found then return to_jsonb(c)||jsonb_build_object('fresh',false); end if;
  insert into public.paystack_checkouts(reference,user_id,plan,billing_interval,plan_code,email)
    values(new_reference,account_id,new_plan,new_interval,provider_plan,customer_email) returning * into c;
  return to_jsonb(c)||jsonb_build_object('fresh',true);
end;
$$;

-- Exact prices are checked here as well as against Paystack. Replayed events cannot extend access.
create function public.apply_paystack_payment(payment_reference text,account_id uuid,customer_code text,provider_plan text,new_plan text,new_interval text,paid_amount integer,paid_currency text,paid_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.accounts; c public.paystack_checkouts; expected integer; expiry timestamptz;
begin
  if new_interval not in ('monthly','yearly') or new_plan not in ('starter','growth','agency') then raise exception 'Invalid plan'; end if;
  expected:=case new_plan when 'starter' then case new_interval when 'monthly' then 3000 else 20000 end
    when 'growth' then case new_interval when 'monthly' then 20000 else 79900 end
    when 'agency' then case new_interval when 'monthly' then 50000 else 119900 end end;
  if paid_currency is distinct from 'USD' or paid_amount is distinct from expected or paid_at is null or paid_at>now()+interval '5 minutes' then raise exception 'Invalid payment'; end if;
  select * into strict a from public.accounts where user_id=account_id for update;
  if a.paystack_customer_code is not null and a.paystack_customer_code<>customer_code then raise exception 'Customer mismatch'; end if;
  select * into c from public.paystack_checkouts where reference=payment_reference;
  if found then
    if c.user_id<>account_id or c.plan_code<>provider_plan or c.plan<>new_plan or c.billing_interval<>new_interval then raise exception 'Checkout mismatch'; end if;
  elsif a.paystack_customer_code is distinct from customer_code or a.paystack_plan_code is distinct from provider_plan or a.paystack_subscription_code is null then
    raise exception 'Unknown renewal';
  end if;
  expiry:=((paid_at at time zone 'UTC') + case new_interval when 'yearly' then interval '1 year' else interval '1 month' end) at time zone 'UTC';
  insert into public.paystack_payments(reference,user_id,amount,currency,paid_at,expires_at,plan,billing_interval)
    values(payment_reference,account_id,paid_amount,paid_currency,paid_at,expiry,new_plan,new_interval) on conflict do nothing;
  if not found then return; end if;
  update public.paystack_checkouts set state='paid' where reference=payment_reference;
  update public.accounts set plan=new_plan,billing_interval=new_interval,paystack_customer_code=customer_code,paystack_plan_code=provider_plan,
    paystack_paid_at=paid_at,subscription_status='active',subscription_expires_at=expiry
    where user_id=account_id and (paystack_paid_at is null or paystack_paid_at<paid_at);
end;
$$;
revoke all on function public.reserve_paystack_checkout(uuid,text,text,text,text,text),public.apply_paystack_payment(text,uuid,text,text,text,text,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_paystack_checkout(uuid,text,text,text,text,text),public.apply_paystack_payment(text,uuid,text,text,text,text,integer,text,timestamptz) to service_role;
commit;
