-- Answering sessions: automatically in, or saying yes yourself (piece A, 2026-10-01).
--
-- Each player chooses (people.rsvp_mode, only they can change it, coaches can
-- read it): 'auto' (default, as before) counts no answer as "in", so they only
-- say when they cannot come; 'manual' counts no answer as open, and they say
-- "in" or "out" for every session (an explicit 'in' availability row).
--
-- - The coach overview push (2 h before) counts no answer as "in" for 'auto'
--   players and as "no answer" only for 'manual' ones (before, everyone
--   without an answer was "no answer").
-- - remind_open_players(session): a coach who sees attendance sends one
--   "Are you in?" to the players still open for that session (once each).

alter table public.people add column rsvp_mode text not null default 'auto' check (rsvp_mode in ('auto', 'manual'));
grant update (rsvp_mode) on public.people to authenticated;

create or replace function app.push_enqueue_due(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Are you in? (no answer yet, not away, from 24 h before, not later than 2 h before)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'reminder', s.id, 'reminder:' || s.id || ':' || r.user_id,
         'Are you in?',
         t.name || ' · ' || s.title || ', ' || app.push_when(s.starts_at) || '. Tap to answer.',
         '/athlete/home',
         app.push_quiet_shift(p_now),
         'push.reminder',
         jsonb_build_object('team', t.name, 'title', s.title, 'at', s.starts_at)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.starts_at > p_now + interval '2 hours' and s.starts_at <= p_now + interval '24 hours'
    and app.push_quiet_shift(p_now) <= s.starts_at - interval '1 hour'
    and not exists (select 1 from public.availability a where a.session_id = s.id and a.person_id = r.person_id)
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
  on conflict (dedupe_key) do nothing;

  -- Coach overview, 2 h before (to coaches who may see attendance)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select c.user_id, 'summary', s.id, 'summary:' || s.id || ':' || c.user_id,
         t.name || ' · ' || s.title || ' at ' || to_char(s.starts_at at time zone 'Europe/Berlin', 'HH24:MI'),
         concat_ws(' · ',
           counts.present || ' in',
           case when counts.late > 0 then counts.late || ' late' end,
           counts.absent || ' out',
           counts.open || ' no answer'),
         '/coach/today',
         app.push_quiet_shift(p_now),
         'push.summary',
         jsonb_build_object('team', t.name, 'title', s.title, 'at', s.starts_at,
           'in', counts.present, 'late', counts.late, 'out', counts.absent, 'open', counts.open)
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
    select count(*) filter (where a.status = 'in' or (a.status is null and not away and ap.rsvp_mode = 'auto')) as present,
           count(*) filter (where a.status = 'late') as late,
           count(*) filter (where a.status in ('out', 'missed') or (a.status is null and away)) as absent,
           count(*) filter (where a.status is null and not away and ap.rsvp_mode = 'manual') as open
    from public.memberships m
    join public.people ap on ap.id = m.person_id
    left join public.availability a on a.session_id = s.id and a.person_id = m.person_id
    cross join lateral (select app.absent_for_session(m.person_id, s.id) as away) x
    where m.team_id = s.team_id and m.role = 'athlete'
      and (cardinality(s.group_ids) = 0 or exists (
        select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (s.group_ids)
      ))
      and app.squad_status(m.person_id, s.id) is distinct from 'not_selected'
  ) counts
  where s.starts_at > p_now + interval '30 minutes' and s.starts_at <= p_now + interval '2 hours'
    and app.push_quiet_shift(p_now) < s.starts_at
  on conflict (dedupe_key) do nothing;

  -- How hard was it? Right after the end, also in quiet hours (it has priority).
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'rate', s.id, 'rate:' || s.id || ':' || r.user_id,
         'How hard was it?',
         s.title || ' (' || t.name || ') is over. Rate it in a few seconds.',
         '/athlete/home',
         p_now,
         'push.rate',
         jsonb_build_object('team', t.name, 'title', s.title)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null and 'load' = any (t.features)
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.ends_at <= p_now and s.ends_at > p_now - interval '12 hours'
    and r.joined_at <= s.ends_at
    and not exists (
      select 1 from public.availability a
      where a.session_id = s.id and a.person_id = r.person_id and a.status in ('out', 'missed')
    )
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
    and not exists (select 1 from public.load_entries le where le.session_id = s.id and le.person_id = r.person_id)
  on conflict (dedupe_key) do nothing;
end $$;

-- "Remind the open ones": once per player and session, only coaches who see
-- attendance, only future sessions. Returns how many were reminded.
create or replace function public.remind_open_players(p_session uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
  v_count integer;
begin
  select s.team_id into v_team from public.sessions s where s.id = p_session and s.starts_at > now();
  if v_team is null then
    raise exception 'This session has already started.' using errcode = 'check_violation';
  end if;
  if not app.has_perm(v_team, 'viewAttendance') then
    raise exception 'Your role may not see attendance for this team.' using errcode = 'insufficient_privilege';
  end if;
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'reminder', s.id, 'reminder-open:' || s.id || ':' || r.user_id,
         'Are you in?',
         t.name || ' · ' || s.title || ', ' || app.push_when(s.starts_at) || '. Tap to answer.',
         '/athlete/home',
         app.push_quiet_shift(now()),
         'push.reminder',
         jsonb_build_object('team', t.name, 'title', s.title, 'at', s.starts_at)
  from public.sessions s
  join public.teams t on t.id = s.team_id
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  join public.people p on p.id = r.person_id and p.rsvp_mode = 'manual'
  where s.id = p_session
    and not exists (select 1 from public.availability a where a.session_id = s.id and a.person_id = r.person_id)
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.remind_open_players(uuid) from public, anon;
grant execute on function public.remind_open_players(uuid) to authenticated;
