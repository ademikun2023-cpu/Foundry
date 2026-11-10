begin;
alter table public.audits add column follow_up_date date;
grant update(follow_up_date,outreach) on public.audits to authenticated;
create index audits_follow_up on public.audits(user_id,follow_up_date) where follow_up_date is not null and stage <> 'Closed';
create table public.agency_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Your agency' check(length(name) between 2 and 100),
  logo text not null default '' check(length(logo)<=180000),
  service text not null default 'Website improvements' check(length(service) between 2 and 160),
  tone text not null default 'friendly' check(tone in ('friendly','direct'))
);
alter table public.agency_profiles enable row level security;
create policy agency_owner on public.agency_profiles for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.agency_profiles from public,anon,authenticated;
grant select,insert,update on public.agency_profiles to authenticated;
grant all on public.agency_profiles to service_role;
create table public.report_shares (
  token text primary key check(length(token)=64),
  audit_id uuid not null unique references public.audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null check(octet_length(snapshot::text)<300000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index report_shares_owner on public.report_shares(user_id);
alter table public.report_shares enable row level security;
create policy shares_owner on public.report_shares for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.report_shares from public,anon,authenticated;
grant select on public.report_shares to authenticated;
grant all on public.report_shares to service_role;
create table public.audit_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, item_index integer not null,
  business jsonb not null check(octet_length(business::text)<4000),
  status text not null default 'queued' check(status in ('queued','running','completed','failed')),
  attempts integer not null default 0, run_token uuid,
  error text, audit_id uuid references public.audits(id) on delete set null,
  created_at timestamptz not null default now(), started_at timestamptz,
  unique(user_id,request_id,item_index)
);
create index audit_jobs_owner_created on public.audit_jobs(user_id,created_at desc);
create index audit_jobs_pending on public.audit_jobs(user_id,created_at) where status in ('queued','running');
alter table public.audit_jobs enable row level security;
create policy jobs_owner on public.audit_jobs for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.audit_jobs from public,anon,authenticated;
grant select on public.audit_jobs to authenticated;
grant all on public.audit_jobs to service_role;
create function private.enqueue_audits(request_id uuid, businesses jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing jsonb; item jsonb; result jsonb; n integer; i integer:=0;
begin
  if uid is null then raise exception 'Sign in to run an audit.'; end if;
  if jsonb_typeof(businesses) is distinct from 'array' then raise exception 'Invalid batch'; end if;
  n:=jsonb_array_length(businesses);
  if n<1 or n>5 then raise exception 'Import 1 to 5 websites per batch.'; end if;
  insert into public.accounts(user_id) values(uid) on conflict do nothing;
  perform 1 from public.accounts where user_id=uid for update;
  select jsonb_agg(id) into existing from public.audit_jobs j where j.user_id=uid and j.request_id=enqueue_audits.request_id;
  if existing is not null then return existing; end if;
  if (select count(*) from public.audit_jobs where user_id=uid and status in ('queued','running'))+n>5 then raise exception 'Wait for your current batch to finish before adding more websites.'; end if;
  for item in select value from jsonb_array_elements(businesses) loop
    if length(item->>'name') not between 2 and 180 or length(item->>'website') not between 8 and 2048 or item->>'website' !~ '^https?://' or item->>'name' is null or item->>'website' is null then raise exception 'Invalid website'; end if;
    result:=private.consume_usage('audit');
    if not (result->>'allowed')::boolean then raise exception '%', result->>'reason'; end if;
    insert into public.audit_jobs(user_id,request_id,item_index,business) values(uid,request_id,i,jsonb_build_object('name',item->>'name','website',item->>'website'));
    i:=i+1;
  end loop;
  select jsonb_agg(id) into existing from public.audit_jobs j where j.user_id=uid and j.request_id=enqueue_audits.request_id;
  return existing;
end; $$;
revoke all on function private.enqueue_audits(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.enqueue_audits(uuid,jsonb) to authenticated;
create function public.enqueue_audits(request_id uuid,businesses jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.enqueue_audits(request_id,businesses);$$;
revoke all on function public.enqueue_audits(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_audits(uuid,jsonb) to authenticated;
create function public.claim_audit_job(owner_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.audit_jobs;
begin
  update public.audit_jobs set status='failed',error='Audit interrupted repeatedly. Submit a new audit to try again.' where user_id=owner_id and status='running' and attempts>=3 and started_at<now()-interval '5 minutes';
  select * into job from public.audit_jobs where user_id=owner_id and attempts<3 and (status='queued' or (status='running' and started_at<now()-interval '5 minutes')) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.audit_jobs set status='running',run_token=gen_random_uuid(),started_at=now(),attempts=attempts+1,error=null where id=job.id returning * into job;
  return to_jsonb(job);
end; $$;
create function public.finish_audit_job(job_id uuid,lease uuid,result jsonb,failure text) returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.audit_jobs;
begin
  select * into job from public.audit_jobs where id=job_id and run_token=lease and status='running' for update;
  if not found then return false; end if;
  if result is not null then
    insert into public.audits(id,user_id,payload) values(job.id,job.user_id,result||jsonb_build_object('id',job.id)) on conflict(id) do nothing;
    update public.audit_jobs set status='completed',audit_id=job.id,error=null where id=job.id;
  else
    update public.audit_jobs set status='failed',error=left(coalesce(failure,'Audit unavailable. Please retry.'),500) where id=job.id;
  end if;
  return true;
end; $$;
revoke all on function public.claim_audit_job(uuid),public.finish_audit_job(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_audit_job(uuid),public.finish_audit_job(uuid,uuid,jsonb,text) to service_role;
create table public.billing_prices (
  plan_code text primary key, plan text not null check(plan in ('starter','growth','agency')),
  billing_interval text not null check(billing_interval in ('monthly','yearly')),
  currency text not null check(currency in ('NGN','USD')), amount integer not null check(amount>0)
);
alter table public.billing_prices enable row level security;
revoke all on public.billing_prices from public,anon,authenticated;
grant select,insert on public.billing_prices to service_role;
alter table public.paystack_payments drop constraint paystack_payments_currency_check;
alter table public.paystack_payments add constraint paystack_payments_currency_check check(currency in ('NGN','USD'));
create or replace function public.apply_paystack_payment(payment_reference text,account_id uuid,customer_code text,provider_plan text,new_plan text,new_interval text,paid_amount integer,paid_currency text,paid_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.accounts; c public.paystack_checkouts; expected integer; expiry timestamptz;
begin
  if new_interval not in ('monthly','yearly') or new_plan not in ('starter','growth','agency') then raise exception 'Invalid plan'; end if;
  expected:=case new_plan when 'starter' then case new_interval when 'monthly' then 3000 else 20000 end
    when 'growth' then case new_interval when 'monthly' then 20000 else 79900 end
    when 'agency' then case new_interval when 'monthly' then 50000 else 119900 end end;
  if paid_currency='NGN' then
    select amount into expected from public.billing_prices where plan_code=provider_plan and plan=new_plan and billing_interval=new_interval and currency=paid_currency;
  end if;
  if paid_currency not in ('NGN','USD') or paid_currency is null or expected is null or paid_amount is distinct from expected or paid_at is null or paid_at>now()+interval '5 minutes' then raise exception 'Invalid payment'; end if;
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
commit;
