begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- Keep authenticated, owner-checked privileged operations outside the Data API.
alter function public.consume_usage(text) set schema private;
alter function public.get_account() set schema private;
revoke all on function private.consume_usage(text), private.get_account()
  from public, anon, authenticated;
grant execute on function private.consume_usage(text), private.get_account() to authenticated;

create function public.consume_usage(requested_action text) returns jsonb
language sql security invoker set search_path='' as $$
  select private.consume_usage(requested_action);
$$;
create function public.get_account() returns jsonb
language sql security invoker set search_path='' as $$
  select private.get_account();
$$;
revoke all on function public.consume_usage(text), public.get_account()
  from public, anon, authenticated;
grant execute on function public.consume_usage(text), public.get_account() to authenticated;

-- The webhook already uses service_role, which has the required table access.
alter function public.apply_subscription(text,bigint,text,text,text,text,timestamptz) security invoker;
commit;
