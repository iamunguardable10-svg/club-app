-- Piece 16: absences over a period (decided 2026-09-25).
--
-- "Away from … to …" with a kind (injured, sick, holiday, school/work,
-- other) and an optional note. Every session of the player's teams in that
-- period counts as out, without answering each one; the player is not asked
-- "Are you in?" or "How hard was it?" for them. Saying "in" for one session
-- anyway (an explicit 'in' row) wins for that session.
--
-- Who enters it: the player, and coaches who may see attendance for them
-- (no approval step; the player sees who entered it and can shorten it).
--
-- Like availability and its reasons: the period is shared with
-- viewAttendance, the kind and note (often about health) only with
-- viewAbsenceReasons, so they live in their own table.

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date - from_date <= 366)
);
create index absences_person on public.absences (person_id, to_date);
create index absences_created_by on public.absences (created_by);

create table public.absence_reasons (
  absence_id uuid primary key references public.absences (id) on delete cascade,
  kind text not null check (kind in ('injured', 'sick', 'holiday', 'school_work', 'other')),
  note text check (length(note) <= 300)
);

create or replace function app.person_of_absence(p_absence uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.person_id from public.absences a where a.id = p_absence
$$;

-- Away for this session: an absence covers its day (club time) and the
-- player did not say "in" for it anyway.
create or replace function app.absent_for_session(p_person uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    join public.absences a on a.person_id = p_person
      and (s.starts_at at time zone 'Europe/Berlin')::date between a.from_date and a.to_date
    where s.id = p_session
  ) and not exists (
    select 1 from public.availability v where v.session_id = p_session and v.person_id = p_person and v.status = 'in'
  )
$$;

alter table public.absences enable row level security;
alter table public.absence_reasons enable row level security;
revoke all on public.absences, public.absence_reasons from anon, authenticated;
grant select, insert, update, delete on public.absences, public.absence_reasons to authenticated;

create policy absences_read on public.absences for select to authenticated
  using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewAttendance'));
create policy absences_insert on public.absences for insert to authenticated
  with check ((app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewAttendance'))
              and (created_by is null or app.is_me(created_by)));
create policy absences_update on public.absences for update to authenticated
  using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewAttendance'))
  with check (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewAttendance'));
create policy absences_delete on public.absences for delete to authenticated
  using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewAttendance'));

create policy absence_reasons_read on public.absence_reasons for select to authenticated
  using (app.is_me(app.person_of_absence(absence_id)) or app.coach_sees_athlete(app.person_of_absence(absence_id), 'viewAbsenceReasons'));
-- Writing the reason goes with writing the absence: whoever may enter the
-- period may say why (a coach who may not read reasons can still record
-- "injured" when told, but not read it back).
create policy absence_reasons_insert on public.absence_reasons for insert to authenticated
  with check (app.is_me(app.person_of_absence(absence_id)) or app.coach_sees_athlete(app.person_of_absence(absence_id), 'viewAttendance'));
create policy absence_reasons_update on public.absence_reasons for update to authenticated
  using (app.is_me(app.person_of_absence(absence_id)) or app.coach_sees_athlete(app.person_of_absence(absence_id), 'viewAbsenceReasons'))
  with check (app.is_me(app.person_of_absence(absence_id)) or app.coach_sees_athlete(app.person_of_absence(absence_id), 'viewAbsenceReasons'));
create policy absence_reasons_delete on public.absence_reasons for delete to authenticated
  using (app.is_me(app.person_of_absence(absence_id)) or app.coach_sees_athlete(app.person_of_absence(absence_id), 'viewAbsenceReasons'));

-- A new or longer absence closes what is still waiting to be sent about its
-- sessions ("Are you in?", "How hard was it?").
create or replace function app.absence_closes_pushes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.push_outbox o set sent_at = now()
  from public.people p, public.sessions s
  where p.id = new.person_id and o.user_id = p.user_id and o.sent_at is null
    and o.kind in ('reminder', 'rate') and s.id = o.session_id
    and (s.starts_at at time zone 'Europe/Berlin')::date between new.from_date and new.to_date;
  return null;
end $$;
create trigger absences_close_pushes after insert or update on public.absences
  for each row execute function app.absence_closes_pushes();

-- As in 0013, plus absences: no reminder and no rating prompt for sessions
-- someone is away for, and they count as out in the coach overview.
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
    and not exists (select 1 from public.load_entries le where le.session_id = s.id and le.person_id = r.person_id)
  on conflict (dedupe_key) do nothing;
end $$;

-- The two helpers are used inside access rules, so signed-in users run them.
revoke all on function app.person_of_absence(uuid), app.absent_for_session(uuid, uuid), app.absence_closes_pushes()
from public, anon, authenticated;
grant execute on function app.person_of_absence(uuid), app.absent_for_session(uuid, uuid) to authenticated;
