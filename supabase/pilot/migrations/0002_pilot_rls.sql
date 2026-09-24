-- Pilot access rules: row-level security for every table in 0001.
--
-- The rules mirror the coach rights of Run 7 and 8 (COACH_PERMISSIONS in
-- src/shared/data/schema.ts, coachPermissions and canManageFacility in
-- src/shared/data/repository.ts). In the local test mode those rights only
-- shape the interface; here they protect the data.
--
-- Principles:
-- - A signed-in user is linked to people rows through people.user_id.
-- - Everything is closed unless a policy below opens it; `anon` gets nothing.
-- - Athletes own their reports, load, plans. Coaches read them only as far as
--   their role on a team the athlete is in allows.
-- - The helper functions are SECURITY DEFINER so policies can look at
--   memberships and roles without recursing into their own policies.

-- ---------------------------------------------------------------------------
-- Helpers: who am I, and what may I do in a team
-- ---------------------------------------------------------------------------

create or replace function app.my_person_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.people p where p.user_id = auth.uid()
$$;

create or replace function app.is_me(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people p where p.id = p_person and p.user_id = auth.uid())
$$;

create or replace function app.my_club_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.club_id from public.people p where p.user_id = auth.uid()
$$;

create or replace function app.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.team_id = p_team and p.user_id = auth.uid()
  )
$$;

create or replace function app.is_team_coach(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.team_id = p_team and m.role = 'coach' and p.user_id = auth.uid()
  )
$$;

create or replace function app.is_club_coach(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.people p on p.id = m.person_id
    join public.teams t on t.id = m.team_id
    where t.club_id = p_club and m.role = 'coach' and p.user_id = auth.uid()
  )
$$;

-- The rights of my coach role in this team; empty without a coach membership.
create or replace function app.team_permissions(p_team uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct perm), '{}') from (
    select unnest(case when r.locked then app.all_permissions() else r.permissions end) as perm
    from public.memberships m
    join public.people p on p.id = m.person_id
    join public.coach_roles r on r.id = m.coach_role_id
    where m.team_id = p_team and m.role = 'coach' and p.user_id = auth.uid()
  ) granted
$$;

create or replace function app.has_perm(p_team uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_permission = any (app.team_permissions(p_team))
$$;

-- Whether I hold this right in some team the athlete plays in.
create or replace function app.coach_sees_athlete(p_person uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
    where a.person_id = p_person and a.role = 'athlete' and app.has_perm(a.team_id, p_permission)
  )
$$;

-- Departments I manage halls in: those of teams where I have manageFacilities.
create or replace function app.facility_manager_department_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct t.department_id
  from public.memberships m
  join public.people p on p.id = m.person_id
  join public.teams t on t.id = m.team_id
  where m.role = 'coach' and p.user_id = auth.uid() and app.has_perm(t.id, 'manageFacilities')
$$;

-- Every department using the hall must be one I manage halls in.
create or replace function app.can_manage_facility(p_facility uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.facility_manager_department_ids())
    and not exists (
      select 1 from public.department_facilities df
      where df.facility_id = p_facility
        and df.department_id not in (select app.facility_manager_department_ids())
    )
$$;

create or replace function app.team_of_group(p_group uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.team_id from public.player_groups g where g.id = p_group
$$;

create or replace function app.team_of_series(p_series uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.team_id from public.session_series s where s.id = p_series
$$;

create or replace function app.team_of_session(p_session uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.team_id from public.sessions s where s.id = p_session
$$;

create or replace function app.person_of_availability(p_availability uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.person_id from public.availability a where a.id = p_availability
$$;

-- Coach of the session's team with this right for the athlete concerned.
create or replace function app.coach_sees_availability(p_session uuid, p_person uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    join public.memberships a on a.team_id = s.team_id and a.role = 'athlete' and a.person_id = p_person
    where s.id = p_session and app.has_perm(s.team_id, p_permission)
  )
$$;

revoke all on schema app from public;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges: nothing for anon, row-level security for everyone else
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'clubs', 'departments', 'facilities', 'teams', 'department_facilities', 'people', 'coach_roles',
    'memberships', 'player_groups', 'player_group_members', 'session_series', 'sessions',
    'session_series_week_states', 'availability', 'availability_reasons', 'load_entries',
    'load_summaries', 'athlete_plans', 'acknowledged_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Structure is set up by the club (setup script, later an admin surface);
-- the app only reads it and changes what a role allows.
revoke insert, update, delete on public.clubs, public.departments from authenticated;
revoke insert, delete on public.teams from authenticated;
revoke update on public.teams from authenticated;
grant update (default_facility_id) on public.teams to authenticated;
revoke update on public.people from authenticated;
grant update (first_name, last_name) on public.people to authenticated;

-- ---------------------------------------------------------------------------
-- Club structure
-- ---------------------------------------------------------------------------

create policy clubs_read on public.clubs for select to authenticated
  using (id in (select app.my_club_ids()));

create policy departments_read on public.departments for select to authenticated
  using (club_id in (select app.my_club_ids()));

create policy teams_read on public.teams for select to authenticated
  using (club_id in (select app.my_club_ids()));

create policy teams_default_facility on public.teams for update to authenticated
  using (app.has_perm(id, 'manageFacilities'))
  with check (app.has_perm(id, 'manageFacilities'));

create policy facilities_read on public.facilities for select to authenticated
  using (club_id in (select app.my_club_ids()));

create policy facilities_create on public.facilities for insert to authenticated
  with check (club_id in (select app.my_club_ids()) and exists (select 1 from app.facility_manager_department_ids()));

create policy facilities_update on public.facilities for update to authenticated
  using (app.can_manage_facility(id)) with check (app.can_manage_facility(id));

create policy facilities_delete on public.facilities for delete to authenticated
  using (app.can_manage_facility(id));

create policy department_facilities_read on public.department_facilities for select to authenticated
  using (exists (select 1 from public.departments d where d.id = department_id and d.club_id in (select app.my_club_ids())));

create policy department_facilities_share on public.department_facilities for insert to authenticated
  with check (department_id in (select app.facility_manager_department_ids()) and app.can_manage_facility(facility_id));

create policy department_facilities_unshare on public.department_facilities for delete to authenticated
  using (department_id in (select app.facility_manager_department_ids()) and app.can_manage_facility(facility_id));

-- ---------------------------------------------------------------------------
-- People, memberships, roles
-- ---------------------------------------------------------------------------

-- Myself; staff of teams I coach or play in; athletes of teams where my role
-- may see the roster.
create policy people_read on public.people for select to authenticated
  using (
    app.is_me(id)
    or exists (
      select 1 from public.memberships m
      where m.person_id = people.id
        and (
          (m.role = 'coach' and app.is_team_member(m.team_id))
          or (m.role = 'athlete' and app.has_perm(m.team_id, 'viewRoster'))
        )
    )
  );

-- Staff are added by name before they have an account.
create policy people_add_staff on public.people for insert to authenticated
  with check (
    user_id is null
    and club_id in (select app.my_club_ids())
    and exists (
      select 1 from public.teams t
      where t.club_id = people.club_id and app.has_perm(t.id, 'manageStaff')
    )
  );

create policy people_update_self on public.people for update to authenticated
  using (app.is_me(id)) with check (app.is_me(id));

create policy memberships_read on public.memberships for select to authenticated
  using (
    app.is_me(person_id)
    or (role = 'coach' and app.is_team_member(team_id))
    or (role = 'athlete' and app.has_perm(team_id, 'viewRoster'))
  );

-- Staff changes need manageStaff; athletes join through a join code (Run 10).
create policy memberships_staff_insert on public.memberships for insert to authenticated
  with check (role = 'coach' and app.has_perm(team_id, 'manageStaff'));

create policy memberships_staff_update on public.memberships for update to authenticated
  using (role = 'coach' and app.has_perm(team_id, 'manageStaff'))
  with check (role = 'coach' and app.has_perm(team_id, 'manageStaff'));

create policy memberships_staff_delete on public.memberships for delete to authenticated
  using (role = 'coach' and app.has_perm(team_id, 'manageStaff'));

create policy coach_roles_read on public.coach_roles for select to authenticated
  using (app.is_team_coach(team_id));

create policy coach_roles_insert on public.coach_roles for insert to authenticated
  with check (not locked and app.has_perm(team_id, 'manageStaff'));

create policy coach_roles_update on public.coach_roles for update to authenticated
  using (app.has_perm(team_id, 'manageStaff')) with check (app.has_perm(team_id, 'manageStaff'));

create policy coach_roles_delete on public.coach_roles for delete to authenticated
  using (not locked and app.has_perm(team_id, 'manageStaff'));

create policy player_groups_read on public.player_groups for select to authenticated
  using (app.is_team_member(team_id));

create policy player_groups_write on public.player_groups for all to authenticated
  using (app.has_perm(team_id, 'manageGroups')) with check (app.has_perm(team_id, 'manageGroups'));

create policy player_group_members_read on public.player_group_members for select to authenticated
  using (app.is_me(person_id) or app.has_perm(app.team_of_group(group_id), 'viewRoster'));

create policy player_group_members_write on public.player_group_members for all to authenticated
  using (app.has_perm(app.team_of_group(group_id), 'manageGroups'))
  with check (app.has_perm(app.team_of_group(group_id), 'manageGroups'));

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------

-- Team members see their sessions; coaches also see other teams' bookings in
-- the club, which the hall calendars need for conflicts.
create policy sessions_read on public.sessions for select to authenticated
  using (app.is_team_member(team_id) or app.is_club_coach(club_id));

create policy sessions_write on public.sessions for all to authenticated
  using (app.has_perm(team_id, 'editSessions')) with check (app.has_perm(team_id, 'editSessions'));

create policy session_series_read on public.session_series for select to authenticated
  using (app.is_team_coach(team_id));

create policy session_series_write on public.session_series for all to authenticated
  using (app.has_perm(team_id, 'planSeries')) with check (app.has_perm(team_id, 'planSeries'));

create policy series_week_states_read on public.session_series_week_states for select to authenticated
  using (app.is_team_coach(app.team_of_series(series_id)));

create policy series_week_states_write on public.session_series_week_states for all to authenticated
  using (app.has_perm(app.team_of_series(series_id), 'planSeries'))
  with check (app.has_perm(app.team_of_series(series_id), 'planSeries'));

-- ---------------------------------------------------------------------------
-- Athlete data
-- ---------------------------------------------------------------------------

create policy availability_read on public.availability for select to authenticated
  using (app.is_me(person_id) or app.coach_sees_availability(session_id, person_id, 'viewAttendance'));

create policy availability_own on public.availability for all to authenticated
  using (app.is_me(person_id)) with check (app.is_me(person_id));

create policy availability_reasons_read on public.availability_reasons for select to authenticated
  using (
    app.is_me(app.person_of_availability(availability_id))
    or exists (
      select 1 from public.availability a
      where a.id = availability_id and app.coach_sees_availability(a.session_id, a.person_id, 'viewAbsenceReasons')
    )
  );

create policy availability_reasons_own on public.availability_reasons for all to authenticated
  using (app.is_me(app.person_of_availability(availability_id)))
  with check (app.is_me(app.person_of_availability(availability_id)));

-- Raw entries: the athlete, and coaches with load details for a team the
-- athlete plays in (entries tied to another team stay with that team).
create policy load_entries_read on public.load_entries for select to authenticated
  using (
    app.is_me(person_id)
    or (
      app.coach_sees_athlete(person_id, 'viewLoadDetails')
      and (team_id is null or app.has_perm(team_id, 'viewLoadDetails'))
    )
  );

create policy load_entries_own on public.load_entries for all to authenticated
  using (app.is_me(person_id)) with check (app.is_me(person_id));

create policy load_summaries_read on public.load_summaries for select to authenticated
  using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewLoadSummary'));

create policy load_summaries_own on public.load_summaries for all to authenticated
  using (app.is_me(person_id)) with check (app.is_me(person_id));

create policy athlete_plans_read on public.athlete_plans for select to authenticated
  using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewAthletePlans'));

create policy athlete_plans_own on public.athlete_plans for all to authenticated
  using (app.is_me(person_id)) with check (app.is_me(person_id));

create policy acknowledged_sessions_own on public.acknowledged_sessions for all to authenticated
  using (app.is_me(person_id)) with check (app.is_me(person_id));
