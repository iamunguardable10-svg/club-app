-- Quieter error reports (2026-09-26, after the first morning summary).
--
-- - "Script error." with no detail is what a browser reports when it hides
--   the real error (a script from another origin, an extension). It tells
--   nothing, so it is no longer stored; the one stored so far is closed.
-- - The morning summary for operators comes at 09:00 in summer (08:00 in
--   winter) instead of 07:30, so it does not wake anyone on a weekend.

create or replace function public.report_error(
  p_kind text, p_message text, p_detail text default null, p_page text default null,
  p_role text default null, p_mode text default null, p_version text default null, p_device text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := case when p_kind in ('crash', 'error', 'rejected', 'push', 'server') then p_kind else 'error' end;
  v_message text := coalesce(app.clean_error_text(p_message, 500), 'Unknown error');
  v_page text := left(split_part(split_part(coalesce(p_page, ''), '?', 1), '#', 1), 200);
  v_fingerprint text := app.error_fingerprint(v_kind, v_message, v_page);
begin
  -- "Script error." without anything else: the browser hid what happened
  -- (a script from another origin or an extension). Nothing to act on.
  if btrim(coalesce(p_message, '')) in ('Script error.', 'Script error') and nullif(btrim(coalesce(p_detail, '')), '') is null then
    return;
  end if;
  update app.error_reports
  set count = count + 1, last_seen = now(),
      app_version = coalesce(left(p_version, 40), app_version)
  where fingerprint = v_fingerprint and resolved_at is null;
  if found then
    return;
  end if;
  -- New errors: at most 200 an hour; beyond that something is badly wrong
  -- and the first 200 say what.
  if (select count(*) from app.error_reports where first_seen > now() - interval '1 hour' and kind <> 'problem') >= 200 then
    return;
  end if;
  insert into app.error_reports (kind, fingerprint, message, detail, page, role, mode, app_version, device, user_id)
  values (
    v_kind, v_fingerprint, v_message, app.clean_error_text(p_detail, 4000), nullif(v_page, ''),
    case when p_role in ('coach', 'athlete', 'club') then p_role end,
    case when p_mode in ('server', 'demo') then p_mode end,
    left(p_version, 40), left(p_device, 120), auth.uid()
  )
  on conflict (fingerprint) where resolved_at is null do update set count = app.error_reports.count + 1, last_seen = now();
end $$;

update app.error_reports set resolved_at = now()
where resolved_at is null and btrim(message) in ('Script error.', 'Script error') and detail is null;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('club-os-error-digest', '0 7 * * *', 'select app.error_digest()');
  end if;
end $$;
