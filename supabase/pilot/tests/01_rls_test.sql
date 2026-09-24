-- Access-rule tests for the pilot schema, run against a plain local Postgres
-- after 00_supabase_shim.sql and both migrations (see supabase/pilot/README.md).
--
-- Each block acts as one person, the way the app would after sign-in, and
-- checks what they can read and change. A failed check stops the run.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Test helpers
-- ---------------------------------------------------------------------------

create schema test;
grant usage on schema test to authenticated, anon;

create function test.count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', p_sql) into n;
  return n;
end $$;

create function test.expect_count(p_label text, p_sql text, p_expected bigint) returns void language plpgsql as $$
declare n bigint := test.count(p_sql);
begin
  if n <> p_expected then
    raise exception 'FAIL %: expected %, got %', p_label, p_expected, n;
  end if;
  raise notice 'ok  %', p_label;
end $$;

-- Runs a write and expects it to be refused (an error, not a silent no-op).
create function test.expect_error(p_label text, p_sql text, p_pattern text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_pattern is not null and sqlerrm !~* p_pattern then
      raise exception 'FAIL %: wrong error: %', p_label, sqlerrm;
    end if;
    raise notice 'ok  % (refused: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: was allowed', p_label;
end $$;

-- Runs a write and expects it to change exactly this many rows. Under row-
-- level security an update or delete of rows you may not see changes none.
create function test.expect_rows(p_label text, p_sql text, p_expected bigint) returns void language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'FAIL %: expected % changed rows, got %', p_label, p_expected, n;
  end if;
  raise notice 'ok  %', p_label;
end $$;

-- Deferred checks (a team keeps a staff manager) only fire at commit, so a
-- write that should be refused by them runs through this.
create function test.expect_refused_at_commit(p_label text, p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    set constraints all immediate;
  exception when others then
    if sqlerrm !~* p_pattern then
      raise exception 'FAIL %: wrong error: %', p_label, sqlerrm;
    end if;
    raise notice 'ok  % (refused: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: was allowed', p_label;
end $$;

grant execute on all functions in schema test to authenticated, anon;

create function test.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
end $$;
grant execute on function test.act_as(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixture: one club, two departments, U16 and U18 in Basketball, a
-- Volleyball team, staff and athletes as in the local seed
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'martin@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'sabine@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'tobias@example.test'),
  ('10000000-0000-0000-0000-000000000005', 'uwe@example.test'),
  ('10000000-0000-0000-0000-000000000006', 'vera@example.test'),
  ('10000000-0000-0000-0000-000000000011', 'jonas@example.test'),
  ('10000000-0000-0000-0000-000000000012', 'ben@example.test'),
  ('10000000-0000-0000-0000-000000000013', 'lena@example.test'),
  ('10000000-0000-0000-0000-000000000099', 'outsider@example.test');

insert into public.clubs (id, name) values ('c0000000-0000-0000-0000-000000000001', 'TV Test');
insert into public.clubs (id, name) values ('c0000000-0000-0000-0000-000000000002', 'Anderer Verein');
insert into public.departments (id, club_id, name) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Basketball'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Volleyball');
insert into public.facilities (id, club_id, name, address) values
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Sporthalle Nord', 'Nordring 12, Essen'),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Kraftraum', 'Nordring 14, Essen'),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Schulhalle', 'Schulweg 1, Essen');
insert into public.department_facilities (department_id, facility_id) values
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003');
insert into public.teams (id, club_id, department_id, name, default_facility_id) values
  ('70000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'U16', 'f0000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'U18', null),
  ('70000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Volleyball Damen', null);

insert into public.people (id, club_id, user_id, first_name, last_name) values
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Martin', 'Weber'),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Sabine', 'Köhler'),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Tobias', 'Neumann'),
  ('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Uwe', 'Heller'),
  ('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'Vera', 'Volley'),
  ('a0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', 'Jonas', 'Kern'),
  ('a0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000012', 'Ben', 'Albrecht'),
  ('a0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000013', 'Lena', 'Sturm'),
  ('a0000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000099', 'Otto', 'Außen');

-- Coach memberships use the template roles the team trigger created.
insert into public.memberships (person_id, team_id, role, coach_role_id)
select v.person_id::uuid, v.team_id::uuid, 'coach', r.id
from (values
  ('a0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000016', 'Head Coach'),
  ('a0000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000018', 'Head Coach'),
  ('a0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000016', 'Assistant Coach'),
  ('a0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000018', 'Assistant Coach'),
  ('a0000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000016', 'Team Manager'),
  ('a0000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000099', 'Head Coach')
) as v(person_id, team_id, role_name)
join public.coach_roles r on r.team_id = v.team_id::uuid and r.name = v.role_name;

insert into public.memberships (person_id, team_id, role) values
  ('a0000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000016', 'athlete'),
  ('a0000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000016', 'athlete'),
  ('a0000000-0000-0000-0000-000000000013', '70000000-0000-0000-0000-000000000018', 'athlete');

insert into public.sessions (id, team_id, club_id, department_id, title, session_type, starts_at, ends_at, facility_id) values
  ('50000000-0000-0000-0000-000000000016', '70000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'Training U16', 'training', now() + interval '1 day', now() + interval '1 day 90 minutes', 'f0000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000018', '70000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Training U18', 'training', now() + interval '2 days', now() + interval '2 days 90 minutes', 'f0000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000017', '70000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Athletik U16', 's_and_c', now() - interval '2 days', now() - interval '2 days' + interval '60 minutes', 'f0000000-0000-0000-0000-000000000002');

insert into public.session_series (id, team_id, club_id, department_id, title, session_type, weekday, start_time, end_time, facility_id) values
  ('5e000000-0000-0000-0000-000000000016', '70000000-0000-0000-0000-000000000016', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Athletik', 's_and_c', 5, '16:30', '17:30', 'f0000000-0000-0000-0000-000000000002');

insert into public.availability (id, session_id, person_id, status, late_minutes) values
  ('ab000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000011', 'out', null),
  ('ab000000-0000-0000-0000-000000000013', '50000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000013', 'late', 15);
insert into public.availability_reasons (availability_id, reason) values
  ('ab000000-0000-0000-0000-000000000011', 'Knöchel verdreht'),
  ('ab000000-0000-0000-0000-000000000013', 'Zahnarzt');

insert into public.load_entries (person_id, session_id, team_id, date, title, training_type, rpe, duration_minutes, load, source) values
  ('a0000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000017', '70000000-0000-0000-0000-000000000016', current_date - 2, 'Athletik U16', 'strength', 8, 75, 600, 'planned_session'),
  ('a0000000-0000-0000-0000-000000000012', '50000000-0000-0000-0000-000000000017', '70000000-0000-0000-0000-000000000016', current_date - 2, 'Athletik U16', 'strength', 6, 60, 360, 'planned_session'),
  ('a0000000-0000-0000-0000-000000000013', null, null, current_date - 1, 'Laufen', 'conditioning', 5, 40, 200, 'solo');
insert into public.load_summaries (person_id, acwr, chronic_full) values
  ('a0000000-0000-0000-0000-000000000011', 1.42, true),
  ('a0000000-0000-0000-0000-000000000012', 0.95, true),
  ('a0000000-0000-0000-0000-000000000013', 1.05, true);
insert into public.athlete_plans (person_id, title, date, training_type, expected_rpe, expected_duration_minutes) values
  ('a0000000-0000-0000-0000-000000000011', 'Laufen', current_date + 1, 'conditioning', 5, 30);

-- Martin cannot read U18 roles, so the tests below take this id from here.
select id as u18_betreuer from public.coach_roles
where team_id = '70000000-0000-0000-0000-000000000018' and name = 'Team Manager' \gset

-- ---------------------------------------------------------------------------
-- Integrity rules (as the owner, before any role is involved)
-- ---------------------------------------------------------------------------

select test.expect_count('every team got the four role templates',
  'select 1 from public.coach_roles where team_id = ''70000000-0000-0000-0000-000000000016''', 4);
select test.expect_count('session scope comes from the team, not the client',
  'select 1 from public.sessions where id = ''50000000-0000-0000-0000-000000000016'' and club_id = ''c0000000-0000-0000-0000-000000000001'' and department_id = ''d0000000-0000-0000-0000-000000000001''', 1);
select test.expect_error('a session cannot use a hall its department cannot book',
  $q$insert into public.sessions (team_id, club_id, department_id, title, session_type, starts_at, ends_at, facility_id)
     select '70000000-0000-0000-0000-000000000099', c.id, d.id, 'x', 'training', now(), now() + interval '1 hour', 'f0000000-0000-0000-0000-000000000001'
     from public.clubs c, public.departments d where c.id = 'c0000000-0000-0000-0000-000000000001' and d.id = 'd0000000-0000-0000-0000-000000000002'$q$,
  'not shared');
select test.expect_error('an athlete cannot report for another team''s session',
  $q$insert into public.availability (session_id, person_id, status) values ('50000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000011', 'in')$q$,
  'Only players');

-- ---------------------------------------------------------------------------
-- Not signed in
-- ---------------------------------------------------------------------------

set role anon;
select test.expect_error('anon reads no people', 'select * from public.people', 'permission denied');
select test.expect_error('anon reads no load entries', 'select * from public.load_entries', 'permission denied');
reset role;

-- ---------------------------------------------------------------------------
-- Martin, Head Coach U16
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');

select test.expect_count('Martin sees the U16 roster, not the U18 one',
  'select 1 from public.people p join public.memberships m on m.person_id = p.id where m.role = ''athlete''', 2);
select test.expect_count('Martin sees the absence and its reason',
  'select 1 from public.availability a join public.availability_reasons r on r.availability_id = a.id', 1);
select test.expect_count('Martin sees U16 load entries only',
  'select 1 from public.load_entries', 2);
select test.expect_count('Martin sees U16 load summaries only',
  'select 1 from public.load_summaries', 2);
select test.expect_count('Martin sees U16 athlete plans',
  'select 1 from public.athlete_plans', 1);
select test.expect_count('Martin sees other teams'' sessions for hall conflicts',
  'select 1 from public.sessions', 3);
select test.expect_count('Martin sees nothing of another club',
  'select 1 from public.clubs', 1);
select test.expect_rows('Martin moves a U16 session',
  $q$update public.sessions set starts_at = starts_at + interval '30 minutes', ends_at = ends_at + interval '30 minutes' where id = '50000000-0000-0000-0000-000000000016'$q$, 1);
select test.expect_rows('Martin cannot move a U18 session',
  $q$update public.sessions set starts_at = starts_at + interval '30 minutes', ends_at = ends_at + interval '30 minutes' where id = '50000000-0000-0000-0000-000000000018'$q$, 0);
select test.expect_error('Martin cannot create a U18 session',
  $q$insert into public.sessions (team_id, club_id, department_id, title, session_type, starts_at, ends_at)
     values ('70000000-0000-0000-0000-000000000018', 'c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'x', 'training', now(), now() + interval '1 hour')$q$,
  'row-level security');
select test.expect_error('Martin cannot rename his team', $q$update public.teams set name = 'X' where id = '70000000-0000-0000-0000-000000000016'$q$, 'permission denied');
select test.expect_rows('Martin sets the U16 default hall',
  $q$update public.teams set default_facility_id = 'f0000000-0000-0000-0000-000000000002' where id = '70000000-0000-0000-0000-000000000016'$q$, 1);

-- Roles
select test.expect_rows('the Head Coach role cannot be deleted',
  $q$delete from public.coach_roles where team_id = '70000000-0000-0000-0000-000000000016' and locked$q$, 0);
select test.expect_error('the Head Coach role cannot be renamed',
  $q$update public.coach_roles set name = 'Chef' where team_id = '70000000-0000-0000-0000-000000000016' and locked$q$, 'Head Coach');
select test.expect_error('an assigned role cannot be deleted',
  $q$delete from public.coach_roles where team_id = '70000000-0000-0000-0000-000000000016' and name = 'Team Manager'$q$, 'foreign key');
select test.expect_error('Martin cannot create a locked role',
  $q$insert into public.coach_roles (team_id, name, permissions, locked) values ('70000000-0000-0000-0000-000000000016', 'Zweiter Chef', '{}', true)$q$,
  'row-level security');
select test.expect_rows('Martin creates a Physio role with absence reasons only',
  $q$insert into public.coach_roles (team_id, name, permissions) values ('70000000-0000-0000-0000-000000000016', 'Physio', array['viewRoster', 'viewAbsenceReasons'])$q$, 1);
select test.expect_count('the Physio role got attendance added, as the data layer does',
  $q$select 1 from public.coach_roles where name = 'Physio' and 'viewAttendance' = any (permissions)$q$, 1);
select test.expect_error('role names are unique per team',
  $q$insert into public.coach_roles (team_id, name) values ('70000000-0000-0000-0000-000000000016', 'physio')$q$, 'duplicate');

-- Staff
select test.expect_rows('Martin adds Lea Sommer to the staff by name',
  $q$insert into public.people (id, club_id, first_name, last_name) values ('a0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000001', 'Lea', 'Sommer')$q$, 1);
select test.expect_rows('… as Physio',
  $q$insert into public.memberships (person_id, team_id, role, coach_role_id)
     select 'a0000000-0000-0000-0000-000000000021', team_id, 'coach', id from public.coach_roles where team_id = '70000000-0000-0000-0000-000000000016' and name = 'Physio'$q$, 1);
select test.expect_error('Martin cannot make himself an athlete of U18',
  $q$insert into public.memberships (person_id, team_id, role) values ('a0000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000018', 'athlete')$q$,
  'row-level security');
select test.expect_error('a U18 role cannot be assigned in U16',
  'update public.memberships set coach_role_id = ' || quote_literal(:'u18_betreuer') || $q$ where person_id = 'a0000000-0000-0000-0000-000000000005'$q$,
  'another team');

-- Halls
select test.expect_rows('Martin adds a hall',
  $q$insert into public.facilities (id, club_id, name, address) values ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Sporthalle Süd', 'Südstraße 3')$q$, 1);
select test.expect_rows('… and shares it with Basketball',
  $q$insert into public.department_facilities (department_id, facility_id) values ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004')$q$, 1);
select test.expect_error('Martin cannot share it with Volleyball',
  $q$insert into public.department_facilities (department_id, facility_id) values ('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004')$q$,
  'row-level security');
select test.expect_rows('Martin renames a Basketball-only hall',
  $q$update public.facilities set address = 'Nordring 12, 45141 Essen' where id = 'f0000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_rows('Martin cannot change the hall shared with Volleyball',
  $q$update public.facilities set name = 'Meine Halle' where id = 'f0000000-0000-0000-0000-000000000003'$q$, 0);
select test.expect_rows('Martin cannot delete the hall shared with Volleyball',
  $q$delete from public.facilities where id = 'f0000000-0000-0000-0000-000000000003'$q$, 0);
reset role;

-- ---------------------------------------------------------------------------
-- Uwe, Team Manager U16 (roster and attendance)
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000005');

select test.expect_count('Uwe sees the U16 roster', 'select 1 from public.memberships where role = ''athlete''', 2);
select test.expect_count('Uwe sees who is out', 'select 1 from public.availability', 1);
select test.expect_count('Uwe does not see why', 'select 1 from public.availability_reasons', 0);
select test.expect_count('Uwe sees no load entries', 'select 1 from public.load_entries', 0);
select test.expect_count('Uwe sees no load summaries', 'select 1 from public.load_summaries', 0);
select test.expect_count('Uwe sees no athlete plans', 'select 1 from public.athlete_plans', 0);
select test.expect_rows('Uwe cannot move a session',
  $q$update public.sessions set title = 'x' where id = '50000000-0000-0000-0000-000000000016'$q$, 0);
select test.expect_rows('Uwe cannot change the default hall',
  $q$update public.teams set default_facility_id = null where id = '70000000-0000-0000-0000-000000000016'$q$, 0);
select test.expect_error('Uwe cannot add a hall',
  $q$insert into public.facilities (club_id, name) values ('c0000000-0000-0000-0000-000000000001', 'Uwes Halle')$q$, 'row-level security');
select test.expect_rows('Uwe cannot give his role more rights',
  $q$update public.coach_roles set permissions = app.all_permissions() where name = 'Team Manager' and team_id = '70000000-0000-0000-0000-000000000016'$q$, 0);
select test.expect_count('Uwe sees the U16 staff', 'select 1 from public.memberships where role = ''coach''', 4);
reset role;

-- Martin gives Team Manager the traffic light.
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin gives Team Manager the load traffic light',
  $q$update public.coach_roles set permissions = array['viewRoster', 'viewAttendance', 'viewLoadSummary'] where name = 'Team Manager' and team_id = '70000000-0000-0000-0000-000000000016'$q$, 1);
reset role;

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_count('Uwe now sees summaries', 'select 1 from public.load_summaries', 2);
select test.expect_count('… but still no raw entries', 'select 1 from public.load_entries', 0);
reset role;

-- ---------------------------------------------------------------------------
-- Jonas, athlete U16
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');

select test.expect_count('Jonas sees his own entries only', 'select 1 from public.load_entries', 1);
select test.expect_count('Jonas sees his own report and reason', 'select 1 from public.availability a join public.availability_reasons r on r.availability_id = a.id', 1);
select test.expect_count('Jonas sees no teammates', 'select 1 from public.memberships where role = ''athlete''', 1);
select test.expect_count('Jonas sees his coaches', 'select 1 from public.people p join public.memberships m on m.person_id = p.id where m.role = ''coach''', 4);
select test.expect_count('Jonas sees U16 sessions, not U18', 'select 1 from public.sessions', 2);
select test.expect_count('Jonas sees no coach roles', 'select 1 from public.coach_roles', 0);
select test.expect_count('Jonas sees no series planning', 'select 1 from public.session_series', 0);
select test.expect_rows('Jonas changes his report to in',
  $q$update public.availability set status = 'in' where id = 'ab000000-0000-0000-0000-000000000011'$q$, 1);
select test.expect_rows('Jonas removes his reason',
  $q$delete from public.availability_reasons where availability_id = 'ab000000-0000-0000-0000-000000000011'$q$, 1);
select test.expect_error('Jonas cannot report for Ben',
  $q$insert into public.availability (session_id, person_id, status) values ('50000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000012', 'out')$q$,
  'row-level security');
select test.expect_rows('Jonas logs load',
  $q$insert into public.load_entries (person_id, date, title, training_type, rpe, duration_minutes, load, source)
     values ('a0000000-0000-0000-0000-000000000011', current_date, 'Laufen', 'conditioning', 4, 30, 120, 'solo')$q$, 1);
select test.expect_rows('Jonas updates his summary',
  $q$update public.load_summaries set acwr = 1.30 where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 1);
select test.expect_rows('Jonas cannot touch Ben''s summary',
  $q$update public.load_summaries set acwr = 0.5 where person_id = 'a0000000-0000-0000-0000-000000000012'$q$, 0);
select test.expect_rows('Jonas cannot delete sessions',
  $q$delete from public.sessions$q$, 0);
reset role;

-- ---------------------------------------------------------------------------
-- Outsider from another club
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('an outsider sees no people but himself', 'select 1 from public.people', 1);
select test.expect_count('an outsider sees no sessions', 'select 1 from public.sessions', 0);
select test.expect_count('an outsider sees no halls of the club', 'select 1 from public.facilities', 0);
reset role;

-- ---------------------------------------------------------------------------
-- Lockout protection (U18: Sabine Head Coach, Tobias Assistant Coach)
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000002');
select test.expect_rows('Sabine takes staff management away from Assistant Coach',
  $q$update public.coach_roles set permissions = array['viewRoster'] where name = 'Assistant Coach' and team_id = '70000000-0000-0000-0000-000000000018'$q$, 1);
select test.expect_refused_at_commit('Sabine cannot make herself Team Manager (nobody would manage staff)',
  $q$update public.memberships set coach_role_id = (select id from public.coach_roles where team_id = '70000000-0000-0000-0000-000000000018' and name = 'Team Manager')
     where person_id = 'a0000000-0000-0000-0000-000000000002' and team_id = '70000000-0000-0000-0000-000000000018'$q$,
  'at least one person');
select test.expect_refused_at_commit('Sabine cannot remove herself',
  $q$delete from public.memberships where person_id = 'a0000000-0000-0000-0000-000000000002' and team_id = '70000000-0000-0000-0000-000000000018'$q$,
  'at least one person');
reset role;

-- ---------------------------------------------------------------------------
-- Deleting and unsharing halls (Martin again)
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin unshares the Kraftraum from Basketball',
  $q$delete from public.department_facilities where facility_id = 'f0000000-0000-0000-0000-000000000002'$q$, 1);
reset role;
select test.expect_count('… which clears it as U16 default', $q$select 1 from public.teams where default_facility_id = 'f0000000-0000-0000-0000-000000000002'$q$, 0);
select test.expect_count('… while sessions keep it', $q$select 1 from public.sessions where facility_id = 'f0000000-0000-0000-0000-000000000002'$q$, 2);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin deletes the Kraftraum (no department uses it now)',
  $q$delete from public.facilities where id = 'f0000000-0000-0000-0000-000000000002'$q$, 1);
reset role;
select test.expect_count('sessions stay, without a hall', $q$select 1 from public.sessions where facility_id is null$q$, 2);
select test.expect_count('the series stays, without a hall', $q$select 1 from public.session_series where facility_id is null$q$, 1);

\echo 'all access-rule checks passed'
