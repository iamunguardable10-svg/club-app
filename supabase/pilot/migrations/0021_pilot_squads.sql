-- Piece 15: squads for games (decided 2026-09-25).
--
-- For a game the coach picks from the team: in the squad, reserve, or not
-- selected (who said they are out or is away is shown, not hidden). Nothing
-- is visible to players until the coach publishes; then each player gets a
-- push with their own status (and later only those whose status changed).
-- Players see only their own status (they cannot read teammates anyway).
-- Not selected: no "Are you in?", no "How hard was it?", not counted in the
-- coach overview, and the game does not count against their attendance.
-- Who picks: roles that may edit sessions (editSessions).

alter table public.sessions add column squad_published_at timestamptz;

create table public.squad_entries (
  session_id uuid not null references public.sessions (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  status text not null check (status in ('squad', 'reserve', 'not_selected')),
  set_by uuid references public.people (id) on delete set null,
  set_at timestamptz not null default now(),
  -- What the player was last told (server only), so a republish tells only those whose status changed.
  notified_status text check (notified_status in ('squad', 'reserve', 'not_selected')),
  primary key (session_id, person_id)
);
create index squad_entries_person on public.squad_entries (person_id);
create index squad_entries_set_by on public.squad_entries (set_by);

-- Only games, only players of the team.
create or replace function app.check_squad_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.sessions s where s.id = new.session_id and s.session_type = 'game') then
    raise exception 'A squad can only be picked for a game.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.sessions s
    join public.memberships m on m.team_id = s.team_id and m.role = 'athlete' and m.person_id = new.person_id
    where s.id = new.session_id
  ) then
    raise exception 'Only players of the team can be picked.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger squad_entries_check before insert or update on public.squad_entries
  for each row execute function app.check_squad_entry();

-- A player's status for a game, once published (null before, or if not picked).
create or replace function app.squad_status(p_person uuid, p_session uuid) returns text
language sql stable security definer set search_path = '' as $$
  select q.status from public.squad_entries q
  join public.sessions s on s.id = q.session_id and s.squad_published_at is not null
  where q.session_id = p_session and q.person_id = p_person
$$;

alter table public.squad_entries enable row level security;
revoke all on public.squad_entries from anon, authenticated;
grant select, insert, delete on public.squad_entries to authenticated;
grant update (status, set_by, set_at) on public.squad_entries to authenticated;

create policy squad_entries_read on public.squad_entries for select to authenticated
  using (
    app.has_perm(app.team_of_session(session_id), 'editSessions')
    or app.has_perm(app.team_of_session(session_id), 'viewAttendance')
    or (app.is_me(person_id) and exists (select 1 from public.sessions s where s.id = session_id and s.squad_published_at is not null))
  );
create policy squad_entries_insert on public.squad_entries for insert to authenticated
  with check (app.has_perm(app.team_of_session(session_id), 'editSessions') and (set_by is null or app.is_me(set_by)));
create policy squad_entries_update on public.squad_entries for update to authenticated
  using (app.has_perm(app.team_of_session(session_id), 'editSessions'))
  with check (app.has_perm(app.team_of_session(session_id), 'editSessions') and (set_by is null or app.is_me(set_by)));
create policy squad_entries_delete on public.squad_entries for delete to authenticated
  using (app.has_perm(app.team_of_session(session_id), 'editSessions'));

-- ---------------------------------------------------------------------------
-- Publishing: a push per player whose status is new to them
-- ---------------------------------------------------------------------------

alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check
  check (kind in ('changed', 'cancelled', 'reminder', 'summary', 'rate', 'review', 'report', 'digest', 'squad'));

create or replace function app.push_squad_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.squad_published_at is null or new.squad_published_at is not distinct from old.squad_published_at
     or new.starts_at <= now() then
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
  select p.user_id, 'squad', new.id, 'squad:' || new.id || ':' || p.user_id,
         case q.status when 'squad' then 'You''re in the squad' when 'reserve' then 'You''re a reserve' else 'Not in the squad this time' end,
         concat_ws(' · ',
           new.title || coalesce(' vs ' || new.opponent, ''),
           app.push_when(new.starts_at),
           case when q.status <> 'not_selected' then nullif(app.push_meet_text(new.starts_at, new.meet_minutes_before, new.meet_point), '') end),
         '/athlete/calendar',
         app.push_quiet_shift(now())
  from public.squad_entries q
  join public.people p on p.id = q.person_id and p.user_id is not null
  where q.session_id = new.id and q.status is distinct from q.notified_status
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  on conflict (dedupe_key) do update
    set title = excluded.title, body = excluded.body, send_after = excluded.send_after, sent_at = null, claimed_at = null, attempts = 0;
  update public.squad_entries q set notified_status = q.status
  where q.session_id = new.id and q.status is distinct from q.notified_status;
  return null;
end $$;
create trigger sessions_squad_published after update of squad_published_at on public.sessions
  for each row execute function app.push_squad_published();

-- ---------------------------------------------------------------------------
-- Push planning: as in 0020, plus "not selected"
-- ---------------------------------------------------------------------------

create or replace function app.push_enqueue_due(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Are you in? (no answer yet, not away, from 24 h before, not later than 2 h before)
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
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
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
           count(*) filter (where a.status in ('out', 'missed') or (a.status is null and away)) as absent,
           count(*) filter (where a.status is null and not away) as open
    from public.memberships m
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
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
    and not exists (select 1 from public.load_entries le where le.session_id = s.id and le.person_id = r.person_id)
  on conflict (dedupe_key) do nothing;
end $$;

-- The status helper is used in access rules and planning.
revoke all on function app.check_squad_entry(), app.push_squad_published() from public, anon, authenticated;
revoke all on function app.squad_status(uuid, uuid) from public, anon;
grant execute on function app.squad_status(uuid, uuid) to authenticated;
