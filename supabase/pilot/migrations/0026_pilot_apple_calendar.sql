-- Piece 20: connect Apple Calendar (iCloud, CalDAV) — optional (2026-09-25).
--
-- The app works fully without it. Whoever connects gives their Apple ID and
-- an app-specific password (never the normal one; revocable at Apple any
-- time). The password goes into Supabase Vault (encrypted) and only the
-- Edge Function `apple-calendar` reads it, with the server key.
--
-- App → Apple: the function keeps a calendar "Club OS" in iCloud current
-- with the same events as the calendar link (piece 19).
-- Apple → App: the person picks which of their calendars Club OS may read
-- ("Import"; default: none). Those events are private: only the person sees
-- them (what coaches may see comes with piece 21b). Other calendars are
-- never read, and no calendar of the person's is ever changed.
--
-- Sync: every 15 minutes (pg_cron → Edge Function) and when the person asks.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The connection, with the password's Vault id; closed to the app.
create table app.calendar_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  apple_id text not null,
  secret_id uuid not null,
  home_url text not null,
  club_os_url text,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

-- What was last written to "Club OS", so only changes are sent.
create table app.calendar_pushed (
  user_id uuid not null references auth.users (id) on delete cascade,
  uid text not null,
  hash text not null,
  primary key (user_id, uid)
);

-- The person's own Apple calendars and whether Club OS may read them.
create table public.calendar_sources (
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  name text not null,
  color text,
  import boolean not null default false,
  -- What coaches will see of imported events (piece 21b); default: busy only.
  coach_sees text not null default 'busy' check (coach_sees in ('none', 'busy', 'title')),
  primary key (user_id, url)
);

-- Events read from imported calendars, 7 days back to 60 days ahead.
create table public.private_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  source_url text not null,
  key text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  primary key (user_id, source_url, key),
  foreign key (user_id, source_url) references public.calendar_sources (user_id, url) on delete cascade
);
create index private_events_user_time on public.private_events (user_id, starts_at);

alter table public.calendar_sources enable row level security;
alter table public.private_events enable row level security;
revoke all on public.calendar_sources, public.private_events from anon, authenticated;
grant select on public.calendar_sources, public.private_events to authenticated;
grant update (import, coach_sees) on public.calendar_sources to authenticated;

create policy calendar_sources_own on public.calendar_sources for select to authenticated using (user_id = auth.uid());
create policy calendar_sources_choose on public.calendar_sources for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy private_events_own on public.private_events for select to authenticated using (user_id = auth.uid());

-- Stop importing a calendar: its events go at once.
create or replace function app.calendar_source_unimported() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.import and not new.import then
    delete from public.private_events where user_id = new.user_id and source_url = new.url;
  end if;
  return null;
end $$;
create trigger calendar_sources_unimported after update of import on public.calendar_sources
  for each row execute function app.calendar_source_unimported();

-- ---------------------------------------------------------------------------
-- The events of an account (shared with the calendar link)
-- ---------------------------------------------------------------------------

create or replace function app.calendar_events_for(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_events jsonb;
begin
  with mine as (
    select p.id from public.people p where p.user_id = p_user
  ),
  seen as (
    select s.id, 1 as rank, app.squad_status(m.person_id, s.id) as squad
    from public.memberships m
    join mine on mine.id = m.person_id
    join public.sessions s on s.team_id = m.team_id
    where m.role = 'athlete'
      and (cardinality(s.group_ids) = 0 or exists (
        select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (s.group_ids)
      ))
    union all
    select s.id, 2, null
    from public.memberships m
    join mine on mine.id = m.person_id
    join public.sessions s on s.team_id = m.team_id
    where m.role = 'coach'
  ),
  picked as (
    select distinct on (id) id, squad from seen order by id, rank
  ),
  sessions as (
    select jsonb_build_object(
      'uid', 'session-' || s.id || '@club-os',
      'start', s.starts_at,
      'end', s.ends_at,
      'summary', t.name || ' · ' || s.title
        || coalesce(' vs ' || nullif(btrim(s.opponent), ''), '')
        || case s.home_away when 'home' then ' (home)' when 'away' then ' (away)' else '' end,
      'location', app.calendar_location(s, f),
      'description', nullif(concat_ws(E'\n',
        case picked.squad when 'squad' then 'You''re in the squad' when 'reserve' then 'You''re a reserve'
          when 'not_selected' then 'Not in the squad this time' end,
        case when picked.squad is distinct from 'not_selected'
          then nullif(app.push_meet_text(s.starts_at, s.meet_minutes_before, s.meet_point), '') end,
        nullif(btrim(coalesce(s.notes, '')), '')
      ), '')
    ) as event, s.starts_at as at
    from picked
    join public.sessions s on s.id = picked.id
    join public.teams t on t.id = s.team_id and t.archived_at is null
    left join public.facilities f on f.id = s.facility_id
    where s.starts_at >= now() - interval '60 days' and s.starts_at <= now() + interval '366 days'
  ),
  plans as (
    select jsonb_build_object(
      'uid', 'plan-' || a.id || '@club-os',
      'start', a.starts_at,
      'end', a.starts_at + make_interval(mins => greatest(a.expected_duration_minutes, 15)),
      'date', case when a.starts_at is null then a.date end,
      'summary', a.title,
      'description', nullif(btrim(coalesce(a.note, '')), '')
    ) as event, coalesce(a.starts_at, a.date::timestamptz) as at
    from public.athlete_plans a
    join mine on mine.id = a.person_id
    where a.date >= (now() - interval '60 days')::date and a.date <= (now() + interval '366 days')::date
  )
  select coalesce(jsonb_agg(event order by at), '[]'::jsonb) into v_events
  from (select event, at from sessions union all select event, at from plans) all_events;
  return v_events;
end $$;

-- The calendar link now uses the shared list (same result as in 0023).
create or replace function public.calendar_feed(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  update public.calendar_feeds set last_fetched_at = now()
  where token = p_token and length(p_token) >= 48
  returning user_id into v_user;
  if v_user is null then
    return null;
  end if;
  return jsonb_build_object('name', 'Club OS', 'events', app.calendar_events_for(v_user));
end $$;

-- ---------------------------------------------------------------------------
-- For the app (signed in)
-- ---------------------------------------------------------------------------

-- The connection's state, never the password.
create or replace function public.apple_calendar_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('apple_id', c.apple_id, 'status', c.status, 'last_error', c.last_error, 'last_sync_at', c.last_sync_at)
  from app.calendar_connections c where c.user_id = auth.uid()
$$;

-- Disconnect: the password, the calendar list and imported events go at
-- once. ("Club OS" stays in iCloud; the person deletes it there if wanted.)
create or replace function public.disconnect_apple_calendar() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
begin
  delete from app.calendar_connections where user_id = auth.uid() returning secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  delete from app.calendar_pushed where user_id = auth.uid();
  delete from public.calendar_sources where user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- For the Edge Function (server key only)
-- ---------------------------------------------------------------------------

create or replace function public.apple_sync_connect(p_user uuid, p_apple_id text, p_password text, p_home_url text, p_club_os_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
begin
  select secret_id into v_secret from app.calendar_connections where user_id = p_user;
  if v_secret is null then
    v_secret := vault.create_secret(p_password, 'apple-calendar-' || p_user::text, 'App-specific password for Apple Calendar');
  else
    perform vault.update_secret(v_secret, p_password);
  end if;
  insert into app.calendar_connections (user_id, apple_id, secret_id, home_url, club_os_url, status, last_error)
  values (p_user, btrim(p_apple_id), v_secret, p_home_url, p_club_os_url, 'ok', null)
  on conflict (user_id) do update set apple_id = excluded.apple_id, secret_id = excluded.secret_id, home_url = excluded.home_url,
    club_os_url = excluded.club_os_url, status = 'ok', last_error = null;
end $$;

-- Everything a sync needs for one account (null: not connected).
create or replace function public.apple_sync_load(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'apple_id', c.apple_id,
    'password', s.decrypted_secret,
    'home_url', c.home_url,
    'club_os_url', c.club_os_url,
    'events', app.calendar_events_for(p_user),
    'pushed', coalesce((select jsonb_object_agg(p.uid, p.hash) from app.calendar_pushed p where p.user_id = p_user), '{}'::jsonb),
    'imports', coalesce((select jsonb_agg(src.url) from public.calendar_sources src where src.user_id = p_user and src.import), '[]'::jsonb)
  )
  from app.calendar_connections c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.user_id = p_user
$$;

-- What a sync found and did.
create or replace function public.apple_sync_save(p_user uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_source jsonb;
begin
  if not exists (select 1 from app.calendar_connections where user_id = p_user) then
    return; -- disconnected meanwhile
  end if;
  if p_result ? 'error' then
    update app.calendar_connections set status = 'error', last_error = left(p_result ->> 'error', 300), last_sync_at = now() where user_id = p_user;
    return;
  end if;
  update app.calendar_connections
  set status = 'ok', last_error = null, last_sync_at = now(), club_os_url = coalesce(p_result ->> 'club_os_url', club_os_url)
  where user_id = p_user;

  -- The calendars as Apple lists them now (choices kept; vanished ones go).
  if p_result ? 'calendars' then
    delete from public.calendar_sources src
    where src.user_id = p_user and src.url not in (select c ->> 'url' from jsonb_array_elements(p_result -> 'calendars') c);
    insert into public.calendar_sources (user_id, url, name, color)
    select p_user, c ->> 'url', left(coalesce(nullif(c ->> 'name', ''), 'Calendar'), 120), nullif(c ->> 'color', '')
    from jsonb_array_elements(p_result -> 'calendars') c
    on conflict (user_id, url) do update set name = excluded.name, color = excluded.color;
  end if;

  -- What "Club OS" now holds.
  if p_result ? 'pushed' then
    delete from app.calendar_pushed where user_id = p_user;
    insert into app.calendar_pushed (user_id, uid, hash)
    select p_user, key, value from jsonb_each_text(p_result -> 'pushed');
  end if;

  -- Imported events, per calendar (only calendars still imported).
  for v_source in select * from jsonb_array_elements(coalesce(p_result -> 'imported', '[]'::jsonb)) loop
    if exists (select 1 from public.calendar_sources where user_id = p_user and url = v_source ->> 'url' and import) then
      delete from public.private_events where user_id = p_user and source_url = v_source ->> 'url';
      insert into public.private_events (user_id, source_url, key, title, starts_at, ends_at, all_day)
      select distinct on (e ->> 'key') p_user, v_source ->> 'url', left(e ->> 'key', 300), left(coalesce(e ->> 'title', 'Busy'), 200),
             (e ->> 'startsAt')::timestamptz, (e ->> 'endsAt')::timestamptz, coalesce((e ->> 'allDay')::boolean, false)
      from jsonb_array_elements(v_source -> 'events') e;
    end if;
  end loop;
end $$;

-- The accounts due for the 15-minute sync (guarded by the dispatch secret).
create or replace function public.apple_sync_due(p_secret text, p_limit integer default 20) returns setof uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_dispatch_secret(p_secret);
  return query
    select c.user_id from app.calendar_connections c
    where c.last_sync_at is null or c.last_sync_at < now() - interval '14 minutes'
    order by c.last_sync_at nulls first
    limit p_limit;
end $$;

create or replace function app.apple_sync_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := replace((select value from app.push_config where key = 'function_url'), '/push-dispatch', '/apple-calendar');
  v_secret text := (select value from app.push_config where key = 'dispatch_secret');
begin
  if v_url is null or v_secret is null or not exists (select 1 from app.calendar_connections) then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{"action":"tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    timeout_milliseconds := 10000
  );
end $$;

revoke all on function app.calendar_events_for(uuid), app.calendar_source_unimported(), app.apple_sync_tick(),
  public.apple_calendar_status(), public.disconnect_apple_calendar(),
  public.apple_sync_connect(uuid, text, text, text, text), public.apple_sync_load(uuid), public.apple_sync_save(uuid, jsonb),
  public.apple_sync_due(text, integer)
from public, anon, authenticated;
grant execute on function public.apple_calendar_status(), public.disconnect_apple_calendar() to authenticated;
grant execute on function public.apple_sync_connect(uuid, text, text, text, text), public.apple_sync_load(uuid),
  public.apple_sync_save(uuid, jsonb), public.apple_sync_due(text, integer) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('club-os-apple-calendar', '*/15 * * * *', 'select app.apple_sync_tick()');
  end if;
end $$;
