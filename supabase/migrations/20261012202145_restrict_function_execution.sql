begin;
-- Supabase can grant EXECUTE directly to API roles through default privileges.
-- Revoking PUBLIC alone does not remove those role-specific grants.
revoke all on function public.consume_usage(text), public.get_account(),
  public.apply_subscription(text,bigint,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_usage(text), public.get_account() to authenticated;
grant execute on function public.apply_subscription(text,bigint,text,text,text,text,timestamptz) to service_role;
alter function public.plan_limit(text,text) set search_path='';
commit;
