-- Piece 19: calendar subscription link (decided 2026-09-25).
--
-- A personal, secret link that any calendar app can subscribe to (Apple,
-- Google, Outlook): the team sessions of the account's teams with hall or
-- away address, meeting, opponent, note and (players) their squad status;
-- players also get their own training. Coaches get every session of the
-- teams they coach. Cancelled sessions are deleted, so they disappear.
--
-- The link is the only key: whoever has it can read these sessions, so it is
-- long and random, can be replaced ("New link": the old one stops at once)
-- and switched off. The Edge Function `calendar-feed` answers the calendar
-- app; it calls `calendar_feed` with the server key, the app never sees it.

create table public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique check (length(token) >= 48),
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;

-- The signed-in account's link: the existing one, or a new one (also when
-- asked to replace it).
create or replace function public.calendar_feed_token(p_new boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_token text;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;
  if not p_new then
    select token into v_token from public.calendar_feeds where user_id = v_user;
    if v_token is not null then
      return v_token;
    end if;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.calendar_feeds (user_id, token) values (v_user, v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now(), last_fetched_at = null;
  return v_token;
end $$;

-- Switches the link off.
create or replace function public.calendar_feed_stop() returns void
language sql security definer set search_path = '' as $$
  delete from public.calendar_feeds where user_id = auth.uid()
$$;

-- Whether the account has a link, without creating one.
create or replace function public.calendar_feed_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('token', f.token, 'last_fetched_at', f.last_fetched_at)
  from public.calendar_feeds f where f.user_id = auth.uid()
$$;

-- "Location" of a session: the away address, or the hall with its address.
create or replace function app.calendar_location(p_session public.sessions, p_facility public.facilities) returns text
language sql stable set search_path = '' as $$
  select case
    when p_session.home_away = 'away' then nullif(btrim(coalesce(p_session.venue_address, '')), '')
    else nullif(concat_ws(', ', p_facility.name, nullif(btrim(coalesce(p_facility.address, '')), '')), '')
  end
$$;

-- The events of the link's account (null for an unknown link): sessions from
-- 60 days back to a year ahead, own training in the same window.
create or replace function public.calendar_feed(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_events jsonb;
begin
  update public.calendar_feeds set last_fetched_at = now()
  where token = p_token and length(p_token) >= 48
  returning user_id into v_user;
  if v_user is null then
    return null;
  end if;

  with mine as (
    select p.id from public.people p where p.user_id = v_user
  ),
  seen as (
    -- Players: sessions for the whole team or their groups; their squad status once published.
    select s.id, 1 as rank, app.squad_status(m.person_id, s.id) as squad
    from public.memberships m
    join mine on mine.id = m.person_id
    join public.sessions s on s.team_id = m.team_id
    where m.role = 'athlete'
      and (cardinality(s.group_ids) = 0 or exists (
        select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (s.group_ids)
      ))
    union all
    -- Coaches: every session of their teams.
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

  return jsonb_build_object('name', 'Club OS', 'events', v_events);
end $$;

revoke all on function public.calendar_feed_token(boolean), public.calendar_feed_stop(), public.calendar_feed_status(),
  public.calendar_feed(text), app.calendar_location(public.sessions, public.facilities) from public, anon, authenticated;
grant execute on function public.calendar_feed_token(boolean), public.calendar_feed_stop(), public.calendar_feed_status() to authenticated;
-- Only the Edge Function (server key) reads a feed.
grant execute on function public.calendar_feed(text) to service_role;
