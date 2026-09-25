-- Push hardening (piece 7), after the Supabase security advisor:
-- - The sender (Edge Function) calls push_take_due / push_report with the
--   service role, so nobody else needs to call them at all (the dispatch
--   secret stays as a second guard).
-- - pg_net lives in the `extensions` schema, not in `public` (its functions
--   stay in `net`, so app.push_tick() is unchanged).

revoke execute on function public.push_take_due(text), public.push_report(text, jsonb) from anon, authenticated;
grant execute on function public.push_take_due(text), public.push_report(text, jsonb) to service_role;

do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
