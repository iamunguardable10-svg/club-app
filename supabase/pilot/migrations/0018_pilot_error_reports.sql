-- Piece 13: seeing errors, and "Report a problem" (decided 2026-09-25: own
-- solution in the database, no third-party service).
--
-- - The app reports crashes, errors and refused saves by itself; people can
--   write a problem report from the account menu. Both land in
--   app.error_reports, which no app user can read.
-- - Nothing personal beyond the account id: page (path only), role, demo or
--   server, app version, a short device name. Messages are cleaned here as
--   well as in the app: database errors can quote the refused row ("Failing
--   row contains (…)"), which may hold health data.
-- - The same error counts up instead of adding rows; new rows are capped per
--   hour, problem reports per account per day.
-- - Operators (app.operators, set by SQL) read the list in the app (/reports),
--   mark entries as resolved, get a push for each problem report and one
--   summary each morning when errors came in.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table app.operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table app.error_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crash', 'error', 'rejected', 'push', 'server', 'problem')),
  fingerprint text not null,
  message text not null check (length(message) between 1 and 500),
  detail text check (length(detail) <= 4000),
  page text check (length(page) <= 200),
  role text check (role in ('coach', 'athlete', 'club')),
  mode text check (mode in ('server', 'demo')),
  app_version text check (length(app_version) <= 40),
  device text check (length(device) <= 120),
  user_id uuid references auth.users (id) on delete set null,
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  resolved_at timestamptz
);
-- One open row per error; a resolved error that comes back opens a new one.
create unique index error_reports_open on app.error_reports (fingerprint) where resolved_at is null;
create index error_reports_recent on app.error_reports (last_seen desc);
create index error_reports_user on app.error_reports (user_id);

revoke all on app.operators, app.error_reports from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.operators o where o.user_id = auth.uid())
$$;

-- Drops what a database error quotes from the data, and caps the length.
create or replace function app.clean_error_text(p_text text, p_max integer) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
    'Failing row contains \(.*?\)\.?', 'Failing row contains (…).', 'g'),
    'Key \(([^)]*)\)=\([^)]*\)', 'Key (\1)=(…)', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '(email)', 'g')), p_max), '')
$$;

-- The same error with other ids or numbers is still the same error.
create or replace function app.error_fingerprint(p_kind text, p_message text, p_page text) returns text
language sql immutable set search_path = '' as $$
  select md5(p_kind || '|' || regexp_replace(regexp_replace(lower(p_message),
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'g'), '[0-9]+', '<n>', 'g')
    || '|' || regexp_replace(coalesce(p_page, ''), '[0-9a-f]{8}-[0-9a-f-]{27}', '<id>', 'g'))
$$;

-- Push to every operator with a device (quiet hours apply when sending).
create or replace function app.push_operators(p_kind text, p_key text, p_title text, p_body text) returns void
language sql security definer set search_path = '' as $$
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after)
  select o.user_id, p_kind, p_key || ':' || o.user_id, p_title, left(p_body, 300), '/reports', now()
  from app.operators o
  where exists (select 1 from public.push_subscriptions s where s.user_id = o.user_id)
  on conflict (dedupe_key) do nothing
$$;

alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check
  check (kind in ('changed', 'cancelled', 'reminder', 'summary', 'rate', 'review', 'report', 'digest'));

-- ---------------------------------------------------------------------------
-- Reporting (the app, signed in or not; the Edge Functions)
-- ---------------------------------------------------------------------------

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

-- "Report a problem": free text from a person. Up to 10 a day per account;
-- without an account (demo club) up to 30 an hour in total.
create or replace function public.report_problem(
  p_text text, p_page text default null, p_role text default null, p_mode text default null,
  p_version text default null, p_device text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_text text := nullif(left(btrim(coalesce(p_text, '')), 4000), '');
  v_id uuid := gen_random_uuid();
  v_name text;
begin
  if v_text is null or length(v_text) < 3 then
    raise exception 'Please describe the problem in a few words.' using errcode = 'check_violation';
  end if;
  if auth.uid() is not null then
    if (select count(*) from app.error_reports where kind = 'problem' and user_id = auth.uid() and first_seen > now() - interval '1 day') >= 10 then
      raise exception 'You sent many reports today. Please try again tomorrow.' using errcode = 'check_violation';
    end if;
  elsif (select count(*) from app.error_reports where kind = 'problem' and user_id is null and first_seen > now() - interval '1 hour') >= 30 then
    raise exception 'Too many reports right now. Please try again later.' using errcode = 'check_violation';
  end if;

  insert into app.error_reports (id, kind, fingerprint, message, detail, page, role, mode, app_version, device, user_id)
  values (
    v_id, 'problem', 'problem:' || v_id, left(regexp_replace(v_text, '\s+', ' ', 'g'), 500), v_text,
    nullif(left(split_part(coalesce(p_page, ''), '?', 1), 200), ''),
    case when p_role in ('coach', 'athlete', 'club') then p_role end,
    case when p_mode in ('server', 'demo') then p_mode end,
    left(p_version, 40), left(p_device, 120), auth.uid()
  );

  select p.first_name || ' ' || p.last_name into v_name
  from public.people p where p.user_id = auth.uid() order by p.created_at limit 1;
  perform app.push_operators('report', 'report:' || v_id,
    'Problem reported' || coalesce(' by ' || v_name, ''),
    left(regexp_replace(v_text, '\s+', ' ', 'g'), 200));
end $$;

-- ---------------------------------------------------------------------------
-- Operators (the /reports page)
-- ---------------------------------------------------------------------------

create or replace function public.am_i_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_operator()
$$;

create or replace function public.list_error_reports(p_include_resolved boolean default false)
returns table (
  id uuid, kind text, message text, detail text, page text, role text, mode text, app_version text,
  device text, reporter text, count integer, first_seen timestamptz, last_seen timestamptz, resolved_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_operator() then
    raise exception 'Only operators can see reports.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select r.id, r.kind, r.message, r.detail, r.page, r.role, r.mode, r.app_version, r.device,
         (select p.first_name || ' ' || p.last_name from public.people p where p.user_id = r.user_id order by p.created_at limit 1),
         r.count, r.first_seen, r.last_seen, r.resolved_at
  from app.error_reports r
  where p_include_resolved or r.resolved_at is null
  order by (r.kind = 'problem' and r.resolved_at is null) desc, r.last_seen desc
  limit 200;
end $$;

create or replace function public.resolve_error_report(p_id uuid, p_resolved boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_operator() then
    raise exception 'Only operators can change reports.' using errcode = 'insufficient_privilege';
  end if;
  -- Reopening fails quietly if the same error is open again already.
  update app.error_reports r set resolved_at = case when p_resolved then now() end
  where r.id = p_id
    and (p_resolved or not exists (
      select 1 from app.error_reports o where o.fingerprint = r.fingerprint and o.resolved_at is null and o.id <> r.id));
end $$;

-- ---------------------------------------------------------------------------
-- Morning summary
-- ---------------------------------------------------------------------------

-- Errors (not problem reports, those were pushed right away) seen in the last
-- 24 hours and still open; nothing is sent on a quiet day.
create or replace function app.error_digest(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_errors integer;
  v_times integer;
  v_top text;
begin
  select count(*), coalesce(sum(r.count), 0) into v_errors, v_times
  from app.error_reports r
  where r.kind <> 'problem' and r.resolved_at is null and r.last_seen > p_now - interval '24 hours';
  if v_errors = 0 then
    return;
  end if;
  select string_agg(left(t.message, 80) || ' (' || t.count || '×)', ' · ') into v_top
  from (
    select r.message, r.count from app.error_reports r
    where r.kind <> 'problem' and r.resolved_at is null and r.last_seen > p_now - interval '24 hours'
    order by r.count desc, r.last_seen desc limit 3
  ) t;
  perform app.push_operators('digest', 'digest:' || to_char(p_now at time zone 'Europe/Berlin', 'YYYY-MM-DD'),
    'Club OS: ' || v_errors || case when v_errors = 1 then ' error' else ' errors' end || ' in the last 24 h',
    v_times || '× in total. ' || coalesce(v_top, ''));
end $$;

revoke all on function
  app.is_operator(), app.clean_error_text(text, integer), app.error_fingerprint(text, text, text),
  app.push_operators(text, text, text, text), app.error_digest(timestamptz),
  public.report_error(text, text, text, text, text, text, text, text),
  public.report_problem(text, text, text, text, text, text),
  public.am_i_operator(), public.list_error_reports(boolean), public.resolve_error_report(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.report_error(text, text, text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.report_problem(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.am_i_operator(), public.list_error_reports(boolean), public.resolve_error_report(uuid, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 05:30 UTC: 07:30 in summer, 06:30 in winter (club time).
    perform cron.schedule('club-os-error-digest', '30 5 * * *', 'select app.error_digest()');
  end if;
end $$;
