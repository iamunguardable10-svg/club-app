-- Indexes for foreign keys and write policies split by command.
--
-- Both from the Supabase performance advisor after 0001/0002:
-- - Every access check reads memberships by team or role, so the foreign keys
--   the checks and cascades follow get an index.
-- - A `for all` policy is also a SELECT policy, so reading those tables
--   evaluated two policies. Writes now have their own insert/update/delete
--   policies with the same conditions; reading keeps the *_read policies.
-- No rule changes: the tests in supabase/pilot/tests pass unchanged.

create index if not exists acknowledged_sessions_session on public.acknowledged_sessions (session_id);
create index if not exists athlete_plans_person on public.athlete_plans (person_id);
create index if not exists athlete_plans_team on public.athlete_plans (team_id);
create index if not exists availability_person on public.availability (person_id);
create index if not exists department_facilities_facility on public.department_facilities (facility_id);
create index if not exists departments_club on public.departments (club_id);
create index if not exists facilities_club on public.facilities (club_id);
create index if not exists load_entries_session on public.load_entries (session_id);
create index if not exists load_entries_team on public.load_entries (team_id);
create index if not exists memberships_coach_role on public.memberships (coach_role_id);
create index if not exists memberships_team on public.memberships (team_id);
create index if not exists people_club on public.people (club_id);
create index if not exists player_group_members_person on public.player_group_members (person_id);
create index if not exists player_groups_team on public.player_groups (team_id);
create index if not exists session_series_club on public.session_series (club_id);
create index if not exists session_series_department on public.session_series (department_id);
create index if not exists session_series_facility on public.session_series (facility_id);
create index if not exists session_series_team on public.session_series (team_id);
create index if not exists series_week_states_committed_session on public.session_series_week_states (committed_session_id);
create index if not exists sessions_club on public.sessions (club_id);
create index if not exists sessions_department on public.sessions (department_id);
create index if not exists sessions_series on public.sessions (series_id);
create index if not exists teams_club on public.teams (club_id);
create index if not exists teams_default_facility on public.teams (default_facility_id);
create index if not exists teams_department on public.teams (department_id);

-- Replaces a `for all` policy by insert, update and delete policies with the
-- same condition. Reading stays with the table's *_read policy.
create or replace function app.split_write_policy(p_table text, p_policy text, p_condition text) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('drop policy if exists %I on public.%I', p_policy, p_table);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p_policy || '_insert', p_table, p_condition);
  execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', p_policy || '_update', p_table, p_condition, p_condition);
  execute format('create policy %I on public.%I for delete to authenticated using (%s)', p_policy || '_delete', p_table, p_condition);
end $$;

select app.split_write_policy('player_groups', 'player_groups_write', $c$app.has_perm(team_id, 'manageGroups')$c$);
select app.split_write_policy('player_group_members', 'player_group_members_write', $c$app.has_perm(app.team_of_group(group_id), 'manageGroups')$c$);
select app.split_write_policy('sessions', 'sessions_write', $c$app.has_perm(team_id, 'editSessions')$c$);
select app.split_write_policy('session_series', 'session_series_write', $c$app.has_perm(team_id, 'planSeries')$c$);
select app.split_write_policy('session_series_week_states', 'series_week_states_write', $c$app.has_perm(app.team_of_series(series_id), 'planSeries')$c$);
select app.split_write_policy('availability', 'availability_own', $c$app.is_me(person_id)$c$);
select app.split_write_policy('availability_reasons', 'availability_reasons_own', $c$app.is_me(app.person_of_availability(availability_id))$c$);
select app.split_write_policy('load_entries', 'load_entries_own', $c$app.is_me(person_id)$c$);
select app.split_write_policy('load_summaries', 'load_summaries_own', $c$app.is_me(person_id)$c$);
select app.split_write_policy('athlete_plans', 'athlete_plans_own', $c$app.is_me(person_id)$c$);

-- acknowledged_sessions has only its own policy, so `for all` is the single
-- SELECT policy there and stays.

drop function app.split_write_policy(text, text, text);
