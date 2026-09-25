-- Push notifications (piece 7, decided 2026-09-25).
--
-- What is sent, to whom:
-- - Session changed (time or hall) or cancelled: to the players it concerns
--   (the team, or only the session's groups). Changes are bundled for two
--   minutes, so dragging a session around sends one message.
-- - "Are you in?": from 24 hours before a session, to players who have not
--   answered yet (not later than 2 hours before).
-- - Coach overview, 2 hours before: in, late, out, no answer; to coaches
--   who may see attendance.
-- - "How hard was it?": as soon as a session is over, to players of teams
--   that track load who have not rated it and did not say they were out.
--
-- Quiet hours 22:00–07:00 (Europe/Berlin): messages wait until 07:00, except
-- "How hard was it?", which goes out right away (decided: it has priority).
-- Messages only go to accounts with at least one device switched on.
--
-- How it is sent: every minute app.push_tick() queues what is due into
-- app.push_outbox and, if something is waiting, calls the Edge Function
-- `push-dispatch` (pg_net). The function takes the due messages with
-- push_take_due(secret), encrypts and sends them (Web Push, VAPID) and
-- reports back with push_report(secret, results); gone devices are removed.
-- Keys and the secret live in app.push_config, which the app cannot read.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per device that switched notifications on.
create table public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create table app.push_config (
  key text primary key,
  value text not null
);

create table app.push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('changed', 'cancelled', 'reminder', 'summary', 'rate')),
  session_id uuid,
  -- One message per session, person and kind; a later change re-arms it.
  dedupe_key text not null unique,
  title text not null,
  body text not null,
  url text not null,
  send_after timestamptz not null,
  claimed_at timestamptz,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_outbox_due on app.push_outbox (send_after) where sent_at is null;
create index push_outbox_session on app.push_outbox (session_id) where sent_at is null;

revoke all on app.push_config, app.push_outbox from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Quiet hours: a time between 22:00 and 07:00 (club time) moves to 07:00.
create or replace function app.push_quiet_shift(p_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when (p_at at time zone 'Europe/Berlin')::time >= time '22:00'
      then (((p_at at time zone 'Europe/Berlin')::date + 1) + time '07:00') at time zone 'Europe/Berlin'
    when (p_at at time zone 'Europe/Berlin')::time < time '07:00'
      then ((p_at at time zone 'Europe/Berlin')::date + time '07:00') at time zone 'Europe/Berlin'
    else p_at
  end
$$;

-- "Thu 25 Sep, 18:00" in club time.
create or replace function app.push_when(p_at timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'Europe/Berlin', 'Dy DD Mon, HH24:MI')
$$;

-- Players a session concerns (the team, or its groups) who have an account
-- with notifications switched on.
create or replace function app.push_players(p_team uuid, p_groups uuid[])
returns table (user_id uuid, person_id uuid, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (p.user_id) p.user_id, p.id, m.created_at
  from public.memberships m
  join public.people p on p.id = m.person_id and p.user_id is not null
  where m.team_id = p_team and m.role = 'athlete'
    and (cardinality(p_groups) = 0 or exists (
      select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (p_groups)
    ))
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  order by p.user_id
$$;

-- ---------------------------------------------------------------------------
-- Session changed or cancelled
-- ---------------------------------------------------------------------------

create or replace function app.push_session_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.starts_at <= now()
       or (new.starts_at = old.starts_at and new.ends_at = old.ends_at and new.facility_id is not distinct from old.facility_id) then
      return null;
    end if;
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
    select r.user_id, 'changed', new.id, 'changed:' || new.id || ':' || r.user_id,
           'Session changed: ' || t.name,
           new.title || ' · now ' || app.push_when(new.starts_at) || '–' || to_char(new.ends_at at time zone 'Europe/Berlin', 'HH24:MI')
             || coalesce(' · ' || f.name, ''),
           '/athlete/calendar',
           app.push_quiet_shift(now() + interval '2 minutes')
    from app.push_players(new.team_id, new.group_ids) r
    join public.teams t on t.id = new.team_id
    left join public.facilities f on f.id = new.facility_id
    on conflict (dedupe_key) do update
      set title = excluded.title, body = excluded.body, send_after = excluded.send_after,
          sent_at = null, claimed_at = null, attempts = 0;
  else
    -- Nothing else about a session that is gone needs saying.
    delete from app.push_outbox where session_id = old.id and sent_at is null;
    if old.starts_at <= now() then
      return null;
    end if;
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
    select r.user_id, 'cancelled', old.id, 'cancelled:' || old.id || ':' || r.user_id,
           'Session cancelled: ' || t.name,
           old.title || ' on ' || app.push_when(old.starts_at) || ' is cancelled.',
           '/athlete/calendar',
           app.push_quiet_shift(now())
    from app.push_players(old.team_id, old.group_ids) r
    join public.teams t on t.id = old.team_id
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end $$;

create trigger sessions_push_changed after update on public.sessions
  for each row execute function app.push_session_changed();
create trigger sessions_push_cancelled after delete on public.sessions
  for each row execute function app.push_session_changed();

-- ---------------------------------------------------------------------------
-- Due messages: reminders, coach overview, rating
-- ---------------------------------------------------------------------------

create or replace function app.push_enqueue_due(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Are you in? (no answer yet, from 24 h before, not later than 2 h before)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
  select r.user_id, 'reminder', s.id, 'reminder:' || s.id || ':' || r.user_id,
         'Are you in?',
         t.name || ' · ' || s.title || ', ' || app.push_when(s.starts_at) || '. Tap to answer.',
         '/athlete/home',
         app.push_quiet_shift(p_now)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.starts_at > p_now + interval '2 hours' and s.starts_at <= p_now + interval '24 hours'
    and app.push_quiet_shift(p_now) <= s.starts_at - interval '1 hour'
    and not exists (select 1 from public.availability a where a.session_id = s.id and a.person_id = r.person_id)
  on conflict (dedupe_key) do nothing;

  -- Coach overview, 2 h before (to coaches who may see attendance)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
  select c.user_id, 'summary', s.id, 'summary:' || s.id || ':' || c.user_id,
         t.name || ' · ' || s.title || ' at ' || to_char(s.starts_at at time zone 'Europe/Berlin', 'HH24:MI'),
         concat_ws(' · ',
           counts.present || ' in',
           case when counts.late > 0 then counts.late || ' late' end,
           counts.absent || ' out',
           counts.open || ' no answer'),
         '/coach/today',
         app.push_quiet_shift(p_now)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null
  cross join lateral (
    select distinct p.user_id
    from public.memberships m
    join public.people p on p.id = m.person_id and p.user_id is not null
    join public.coach_roles cr on cr.id = m.coach_role_id
    where m.team_id = s.team_id and m.role = 'coach'
      and (cr.locked or 'viewAttendance' = any (cr.permissions))
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  ) c
  cross join lateral (
    select count(*) filter (where a.status = 'in') as present,
           count(*) filter (where a.status = 'late') as late,
           count(*) filter (where a.status in ('out', 'missed')) as absent,
           count(*) filter (where a.status is null) as open
    from public.memberships m
    left join public.availability a on a.session_id = s.id and a.person_id = m.person_id
    where m.team_id = s.team_id and m.role = 'athlete'
      and (cardinality(s.group_ids) = 0 or exists (
        select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (s.group_ids)
      ))
  ) counts
  where s.starts_at > p_now + interval '30 minutes' and s.starts_at <= p_now + interval '2 hours'
    and app.push_quiet_shift(p_now) < s.starts_at
  on conflict (dedupe_key) do nothing;

  -- How hard was it? Right after the end, also in quiet hours (it has priority).
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
  select r.user_id, 'rate', s.id, 'rate:' || s.id || ':' || r.user_id,
         'How hard was it?',
         s.title || ' (' || t.name || ') is over. Rate it in a few seconds.',
         '/athlete/home',
         p_now
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null and 'load' = any (t.features)
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.ends_at <= p_now and s.ends_at > p_now - interval '12 hours'
    and r.joined_at <= s.ends_at
    and not exists (
      select 1 from public.availability a
      where a.session_id = s.id and a.person_id = r.person_id and a.status in ('out', 'missed')
    )
    and not exists (select 1 from public.load_entries le where le.session_id = s.id and le.person_id = r.person_id)
  on conflict (dedupe_key) do nothing;
end $$;

-- Every minute (pg_cron): queue what is due, then wake the sender if needed.
create or replace function app.push_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select value from app.push_config where key = 'function_url');
  v_secret text := (select value from app.push_config where key = 'dispatch_secret');
begin
  perform app.push_enqueue_due(now());
  delete from app.push_outbox where sent_at < now() - interval '30 days';
  if v_url is null or v_secret is null or not exists (
    select 1 from app.push_outbox
    where sent_at is null and send_after <= now() and (claimed_at is null or claimed_at < now() - interval '5 minutes')
  ) then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    timeout_milliseconds := 10000
  );
end $$;

-- ---------------------------------------------------------------------------
-- For the sender (Edge Function), guarded by the dispatch secret
-- ---------------------------------------------------------------------------

create or replace function app.assert_dispatch_secret(p_secret text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_secret is null or length(p_secret) < 32
     or p_secret is distinct from (select value from app.push_config where key = 'dispatch_secret') then
    raise exception 'Not allowed.' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Claims up to 100 due messages (again after 5 minutes if never reported)
-- and returns them per device, with the VAPID keys to sign them.
create or replace function public.push_take_due(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  perform app.assert_dispatch_secret(p_secret);

  -- Answered in the meantime: no reminder, no rating prompt.
  update app.push_outbox o set sent_at = now()
  where o.sent_at is null and o.send_after <= now()
    and (
      (o.kind = 'reminder' and exists (
        select 1 from public.availability a join public.people p on p.id = a.person_id
        where a.session_id = o.session_id and p.user_id = o.user_id))
      or (o.kind = 'rate' and exists (
        select 1 from public.load_entries le join public.people p on p.id = le.person_id
        where le.session_id = o.session_id and p.user_id = o.user_id))
      or (o.kind = 'rate' and exists (
        select 1 from public.availability a join public.people p on p.id = a.person_id
        where a.session_id = o.session_id and p.user_id = o.user_id and a.status in ('out', 'missed')))
      -- Switched off on every device since.
      or not exists (select 1 from public.push_subscriptions s where s.user_id = o.user_id)
    );

  with due as (
    select id from app.push_outbox
    where sent_at is null and send_after <= now() and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by send_after
    limit 100
    for update skip locked
  )
  update app.push_outbox o set claimed_at = now()
  from due where o.id = due.id;

  select array_agg(id) into v_ids from app.push_outbox where claimed_at >= now() and sent_at is null;

  return jsonb_build_object(
    'vapid', jsonb_build_object(
      'public_key', (select value from app.push_config where key = 'vapid_public_key'),
      'private_key', (select value from app.push_config where key = 'vapid_private_key'),
      'subject', (select value from app.push_config where key = 'vapid_subject')
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'outbox_id', o.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
        'payload', jsonb_build_object('title', o.title, 'body', o.body, 'url', o.url, 'tag', o.kind || ':' || coalesce(o.session_id::text, o.id::text))
      ))
      from app.push_outbox o
      join public.push_subscriptions s on s.user_id = o.user_id
      where o.id = any (coalesce(v_ids, '{}'))
    ), '[]'::jsonb)
  );
end $$;

-- Results per device: [{ "outbox_id", "endpoint", "status" }]. A message is
-- done when one device got it or all its devices are gone (404/410, and
-- those devices are removed); otherwise it is tried again, at most 3 times.
create or replace function public.push_report(p_secret text, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_dispatch_secret(p_secret);

  delete from public.push_subscriptions s
  using jsonb_to_recordset(p_results) as r (outbox_id uuid, endpoint text, status integer)
  where s.endpoint = r.endpoint and r.status in (404, 410);

  with per_message as (
    select r.outbox_id,
           bool_or(r.status between 200 and 299) as delivered,
           bool_and(r.status in (404, 410)) as all_gone
    from jsonb_to_recordset(p_results) as r (outbox_id uuid, endpoint text, status integer)
    group by r.outbox_id
  )
  update app.push_outbox o
  set attempts = o.attempts + 1,
      sent_at = case when m.delivered or m.all_gone or o.attempts + 1 >= 3 then now() end,
      claimed_at = case when m.delivered or m.all_gone or o.attempts + 1 >= 3 then o.claimed_at end
  from per_message m
  where o.id = m.outbox_id;
end $$;

-- ---------------------------------------------------------------------------
-- For the app
-- ---------------------------------------------------------------------------

-- The public VAPID key the browser needs to subscribe (not a secret).
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select value from app.push_config where key = 'vapid_public_key'
$$;

-- Switches notifications on for this device and the signed-in account. A
-- device used by someone else before now belongs to this account.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'This is not a valid push subscription.' using errcode = 'check_violation';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke all on function
  app.push_quiet_shift(timestamptz), app.push_when(timestamptz), app.push_players(uuid, uuid[]),
  app.push_session_changed(), app.push_enqueue_due(timestamptz), app.push_tick(), app.assert_dispatch_secret(text),
  public.push_take_due(text), public.push_report(text, jsonb), public.push_public_key(),
  public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
from public, anon, authenticated;
grant execute on function public.push_public_key() to anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text) to authenticated;
-- The sender (Edge Function) calls these with the project's own key; the
-- dispatch secret is the guard either way.
grant execute on function public.push_take_due(text), public.push_report(text, jsonb) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Schedule (only where pg_cron exists: the Supabase project, not local tests)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('club-os-push-tick', '* * * * *', 'select app.push_tick()');
  end if;
end $$;
