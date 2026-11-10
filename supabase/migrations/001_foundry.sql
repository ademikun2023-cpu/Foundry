begin;
create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check(plan in ('free','starter','growth','agency')),
  stripe_customer_id text unique, stripe_subscription_id text,
  subscription_status text, subscription_expires_at timestamptz,
  stripe_event_created bigint not null default 0,
  created_at timestamptz not null default now()
);
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null check (octet_length(payload::text) < 100000),
  stage text not null default 'New lead' check(stage in ('New lead','Contacted','Interested','Closed')),
  notes text not null default '' check(length(notes)<=5000), outreach jsonb,
  created_at timestamptz not null default now()
);
create index audits_owner_created on public.audits(user_id,created_at desc);
create table public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null, period text not null, used integer not null default 0,
  primary key(user_id,action,period)
);
create table public.stripe_events (id text primary key, created_at timestamptz not null default now());
alter table public.accounts enable row level security;
alter table public.audits enable row level security;
alter table public.usage_counters enable row level security;
alter table public.stripe_events enable row level security;
create policy accounts_read on public.accounts for select to authenticated using(user_id=(select auth.uid()));
create policy audits_owner on public.audits for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy usage_read on public.usage_counters for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.accounts,public.usage_counters,public.stripe_events,public.audits from anon,authenticated;
grant select on public.accounts,public.usage_counters to authenticated;
grant select,delete on public.audits to authenticated;
grant update(stage,notes) on public.audits to authenticated;
grant all on public.accounts,public.usage_counters,public.stripe_events,public.audits to service_role;

create function public.plan_limit(p text,a text) returns integer language sql immutable as $$
  select case when a='billing' then 20 else case p
    when 'starter' then case a when 'search' then 100 when 'audit' then 100 else 200 end
    when 'growth' then case a when 'search' then 500 when 'audit' then 500 else 1000 end
    when 'agency' then case a when 'search' then 2000 when 'audit' then 2000 else 4000 end
    else case a when 'search' then 20 when 'audit' then 10 else 20 end end end;
$$;

-- Locks serialize concurrent consumption per account; users cannot write counters
-- or plans directly. Periods are calendar months in UTC, independent of billing date.
create function public.consume_usage(requested_action text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); p text; cap integer; total integer; burst integer;
  monthly text:=to_char(now() at time zone 'UTC','YYYY-MM');
  minute_key text:=to_char(now() at time zone 'UTC','YYYY-MM-DD-HH24-MI');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if requested_action not in ('search','audit','outreach','billing') then raise exception 'Invalid action'; end if;
  insert into accounts(user_id) values(uid) on conflict do nothing;
  select case when plan='free' or (subscription_status in ('active','trialing') and subscription_expires_at>now()) then plan else 'free' end into p from accounts where user_id=uid for update;
  cap:=plan_limit(p,requested_action);
  select coalesce(used,0) into total from usage_counters where user_id=uid and action=requested_action and period=monthly;
  select coalesce(used,0) into burst from usage_counters where user_id=uid and action=requested_action and period=minute_key;
  if coalesce(total,0)>=cap then return jsonb_build_object('allowed',false,'reason','Monthly allowance reached. Limits reset on the first day of each month (UTC).'); end if;
  if coalesce(burst,0)>=5 then return jsonb_build_object('allowed',false,'reason','Please wait a minute before running more requests.'); end if;
  insert into usage_counters values(uid,requested_action,monthly,1) on conflict(user_id,action,period) do update set used=usage_counters.used+1;
  insert into usage_counters values(uid,requested_action,minute_key,1) on conflict(user_id,action,period) do update set used=usage_counters.used+1;
  return jsonb_build_object('allowed',true,'used',coalesce(total,0)+1,'allowance',cap);
end;
$$;
create function public.get_account() returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); p text; status text; usage jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  insert into accounts(user_id) values(uid) on conflict do nothing;
  select case when plan='free' or (subscription_status in ('active','trialing') and subscription_expires_at>now()) then plan else 'free' end,subscription_status into p,status from accounts where user_id=uid;
  select jsonb_agg(jsonb_build_object('action',a,'used',coalesce(c.used,0),'allowance',plan_limit(p,a))) into usage
  from unnest(array['search','audit','outreach']) as a left join usage_counters c on c.user_id=uid and c.action=a and c.period=to_char(now() at time zone 'UTC','YYYY-MM');
  return jsonb_build_object('plan',p,'subscriptionStatus',status,'usage',usage);
end;
$$;

create function public.apply_subscription(event_id text,event_time bigint,customer text,subscription text,new_plan text,new_status text,expires_at timestamptz) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into stripe_events(id) values(event_id) on conflict do nothing;
  if not found then return; end if;
  update accounts set plan=new_plan,stripe_subscription_id=subscription,subscription_status=new_status,subscription_expires_at=expires_at,stripe_event_created=event_time
  where stripe_customer_id=customer and stripe_event_created<=event_time;
end;
$$;
revoke all on function public.consume_usage(text),public.get_account(),public.apply_subscription(text,bigint,text,text,text,text,timestamptz) from public;
grant execute on function public.consume_usage(text),public.get_account() to authenticated;
grant execute on function public.apply_subscription(text,bigint,text,text,text,text,timestamptz) to service_role;
commit;
