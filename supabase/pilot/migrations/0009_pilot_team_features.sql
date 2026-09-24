-- Team features (piece 3.5, decided 2026-09-24): not every team needs training
-- load. A team has a list of switched-on features, for now only `load`. Later
-- the club's subscription sets this list; until then it is switched here, in
-- the database, and nobody can change it from the app (`teams` stays
-- read-only for the app apart from the default hall).
--
-- New teams start with load, existing teams keep it.
--
-- Without `load`:
-- - the team's coach roles lose their load rights (viewLoadSummary,
--   viewLoadDetails, viewAthletePlans) while the ticks stay stored;
-- - a player records load, plans and the traffic light only while at least
--   one of their teams tracks load, and entries tied to a team only for a
--   team that does.
-- Existing data stays; switching load back on shows it again.

alter table public.teams
  add column features text[] not null default array['load']
  check (features <@ array['load']);

create or replace function app.team_has_load(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select 'load' = any (t.features) from public.teams t where t.id = p_team), false)
$$;

create or replace function app.person_has_load(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.teams t on t.id = m.team_id
    where m.person_id = p_person and m.role = 'athlete' and 'load' = any (t.features)
  )
$$;

-- The one place coach rights come from: load rights count only in load teams.
create or replace function app.team_permissions(p_team uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct perm), '{}') from (
    select unnest(case when r.locked then app.all_permissions() else r.permissions end) as perm
    from public.memberships m
    join public.people p on p.id = m.person_id
    join public.coach_roles r on r.id = m.coach_role_id
    where m.team_id = p_team and m.role = 'coach' and p.user_id = auth.uid()
  ) granted
  where perm not in ('viewLoadSummary', 'viewLoadDetails', 'viewAthletePlans') or app.team_has_load(p_team)
$$;

-- Writing load: only players who track it. Deleting one's own rows stays
-- possible either way.
drop policy if exists load_entries_own_insert on public.load_entries;
drop policy if exists load_entries_own_update on public.load_entries;
create policy load_entries_own_insert on public.load_entries for insert to authenticated
  with check (app.is_me(person_id) and app.person_has_load(person_id) and (team_id is null or app.team_has_load(team_id)));
create policy load_entries_own_update on public.load_entries for update to authenticated
  using (app.is_me(person_id))
  with check (app.is_me(person_id) and app.person_has_load(person_id) and (team_id is null or app.team_has_load(team_id)));

drop policy if exists load_summaries_own_insert on public.load_summaries;
drop policy if exists load_summaries_own_update on public.load_summaries;
create policy load_summaries_own_insert on public.load_summaries for insert to authenticated
  with check (app.is_me(person_id) and app.person_has_load(person_id));
create policy load_summaries_own_update on public.load_summaries for update to authenticated
  using (app.is_me(person_id))
  with check (app.is_me(person_id) and app.person_has_load(person_id));

drop policy if exists athlete_plans_own_insert on public.athlete_plans;
drop policy if exists athlete_plans_own_update on public.athlete_plans;
create policy athlete_plans_own_insert on public.athlete_plans for insert to authenticated
  with check (app.is_me(person_id) and app.person_has_load(person_id) and (team_id is null or app.team_has_load(team_id)));
create policy athlete_plans_own_update on public.athlete_plans for update to authenticated
  using (app.is_me(person_id))
  with check (app.is_me(person_id) and app.person_has_load(person_id) and (team_id is null or app.team_has_load(team_id)));
