-- Access tests for 0011 (club administration, piece 8a). Runs after 01 and 02
-- on the same database and reuses their helpers; the club here is founded
-- from scratch with a founding code.

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000051', 'frida@example.test'),
  ('10000000-0000-0000-0000-000000000052', 'lars@example.test'),
  ('10000000-0000-0000-0000-000000000053', 'carla@example.test'),
  ('10000000-0000-0000-0000-000000000054', 'paul@example.test');

-- Ids created during the test, readable by every role.
create table test.ids (name text primary key, id uuid);
grant select on test.ids to authenticated;
create function test.id(p_name text) returns uuid language sql stable as $$ select id from test.ids where name = p_name $$;
grant execute on function test.id(text) to authenticated;

select app.create_founding_code('test club') as code1 \gset
select app.create_founding_code('unused') as code2 \gset

-- ---------------------------------------------------------------------------
-- Founding a club
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000051');
select test.expect_error('a user cannot create founding codes', $q$select app.create_founding_code()$q$, 'permission denied');
select test.expect_error('a wrong founding code is refused',
  $q$select public.found_club('WRONGCODE2', 'X', '', 'F', 'F', 'D', 'T')$q$, 'does not exist');
select test.expect_error('a club needs its names',
  'select public.found_club(' || quote_literal(:'code1') || ', '''', '''', ''Frida'', ''Founder'', ''Handball'', ''A-Jugend'')', 'required');
select public.found_club(:'code1', 'SV Gruendung', 'Koeln', 'Frida', 'Founder', 'Handball', 'A-Jugend', true) as club1 \gset
reset role;
insert into test.ids values ('club', :'club1');
insert into test.ids select 'handball', id from public.departments where club_id = :'club1';
insert into test.ids select 'ajugend', id from public.teams where club_id = :'club1';
insert into test.ids select 'frida', id from public.people where user_id = '10000000-0000-0000-0000-000000000051';

select test.expect_count('found: Frida is club admin', $q$select 1 from public.club_roles where person_id = test.id('frida') and role = 'admin' and club_id = test.id('club')$q$, 1);
select test.expect_count('… the team got its four roles and a join code',
  $q$select 1 from public.teams t where t.id = test.id('ajugend') and exists (select 1 from public.team_join_codes j where j.team_id = t.id) and (select count(*) from public.coach_roles r where r.team_id = t.id) = 4$q$, 1);
select test.expect_count('… and Frida is its Head Coach, as asked',
  $q$select 1 from public.memberships m join public.coach_roles r on r.id = m.coach_role_id where m.person_id = test.id('frida') and m.team_id = test.id('ajugend') and r.locked$q$, 1);
select test.expect_count('… new teams track load', $q$select 1 from public.teams where id = test.id('ajugend') and features = array['load']$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000052');
select test.expect_error('a used founding code is refused',
  'select public.found_club(' || quote_literal(:'code1') || ', ''Zweiter'', '''', ''Lars'', ''L'', ''D'', ''T'')', 'already been used');
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_error('someone already in a club cannot found another',
  'select public.found_club(' || quote_literal(:'code2') || ', ''Zweiter'', '''', ''Martin'', ''W'', ''D'', ''T'')', 'already belongs to a club');
select test.expect_error('the founding codes stay unreadable', $q$select 1 from public.founding_codes$q$, 'permission denied');
reset role;

-- ---------------------------------------------------------------------------
-- The admin builds the club
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000051');
select test.expect_rows('admin: creates a department',
  $q$insert into public.departments (id, club_id, name) values ('d1000000-0000-0000-0000-000000000002', test.id('club'), 'Tennis')$q$, 1);
select test.expect_rows('admin: renames it',
  $q$update public.departments set name = 'Tennis & Padel' where id = 'd1000000-0000-0000-0000-000000000002'$q$, 1);
select test.expect_rows('admin: creates a team in it',
  $q$insert into public.teams (id, club_id, department_id, name, features) values ('71000000-0000-0000-0000-000000000002', test.id('club'), 'd1000000-0000-0000-0000-000000000002', 'Damen 1', '{}')$q$, 1);
reset role;
select test.expect_count('… which tracks load anyway (features come from the subscription, not the app)',
  $q$select 1 from public.teams where id = '71000000-0000-0000-0000-000000000002' and features = array['load']$q$, 1);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000051');
select test.expect_error('admin: a team cannot point at another club''s department',
  $q$insert into public.teams (club_id, department_id, name) values (test.id('club'), 'd0000000-0000-0000-0000-000000000001', 'Fremd')$q$, 'row-level security|another club');
select test.expect_rows('admin: renames a team', $q$update public.teams set name = 'Damen I' where id = '71000000-0000-0000-0000-000000000002'$q$, 1);

-- Department lead Lars for Handball, added by name and invited.
select test.expect_rows('admin: adds Lars by name',
  $q$insert into public.people (id, club_id, first_name, last_name) values ('a1000000-0000-0000-0000-000000000052', test.id('club'), 'Lars', 'Lead')$q$, 1);
select test.expect_rows('admin: makes him Handball lead',
  $q$insert into public.club_roles (id, club_id, person_id, role, department_id) values ('cb000000-0000-0000-0000-000000000052', test.id('club'), 'a1000000-0000-0000-0000-000000000052', 'department_lead', test.id('handball'))$q$, 1);
select test.expect_rows('admin: invites him',
  $q$insert into public.club_role_invites (token, club_role_id) values ('e1000000-0000-0000-0000-000000000052', 'cb000000-0000-0000-0000-000000000052')$q$, 1);
select test.expect_error('a lead needs a department',
  $q$insert into public.club_roles (club_id, person_id, role) values (test.id('club'), 'a1000000-0000-0000-0000-000000000052', 'department_lead')$q$, 'check');
reset role;
select test.expect_count('the invitation shows what it is for',
  $q$select 1 from public.invite_preview('e1000000-0000-0000-0000-000000000052') where usable and role_name = 'Department lead' and team_name = 'Handball' and first_name = 'Lars'$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000052');
select test.expect_count('Lars accepts', $q$select public.accept_staff_invite('e1000000-0000-0000-0000-000000000052')$q$, 1);
select test.expect_count('… and is Handball lead now',
  $q$select 1 from public.club_roles cr join public.people p on p.id = cr.person_id where p.user_id = '10000000-0000-0000-0000-000000000052' and cr.role = 'department_lead'$q$, 1);

-- ---------------------------------------------------------------------------
-- The department lead
-- ---------------------------------------------------------------------------

select test.expect_rows('lead: creates a team in Handball',
  $q$insert into public.teams (id, club_id, department_id, name) values ('71000000-0000-0000-0000-000000000003', test.id('club'), test.id('handball'), 'B-Jugend')$q$, 1);
select test.expect_error('lead: not in Tennis',
  $q$insert into public.teams (club_id, department_id, name) values (test.id('club'), 'd1000000-0000-0000-0000-000000000002', 'Herren')$q$, 'row-level security');
select test.expect_error('lead: no new departments',
  $q$insert into public.departments (club_id, name) values (test.id('club'), 'Fussball')$q$, 'row-level security');
select test.expect_error('lead: cannot appoint leads',
  $q$insert into public.club_roles (club_id, person_id, role, department_id) values (test.id('club'), test.id('frida'), 'department_lead', test.id('handball'))$q$, 'row-level security');
select test.expect_rows('lead: archives a team of his department',
  $q$update public.teams set archived_at = now() where id = '71000000-0000-0000-0000-000000000003'$q$, 1);
select test.expect_rows('lead: renames a team of another department changes nothing',
  $q$update public.teams set name = 'X' where id = '71000000-0000-0000-0000-000000000002'$q$, 0);

-- Lead invites a Head Coach for A-Jugend: Carla, by name.
select test.expect_rows('lead: adds Carla by name',
  $q$insert into public.people (id, club_id, first_name, last_name) values ('a1000000-0000-0000-0000-000000000053', test.id('club'), 'Carla', 'Coach')$q$, 1);
select test.expect_rows('lead: puts her into A-Jugend as Head Coach',
  $q$insert into public.memberships (person_id, team_id, role, coach_role_id) select 'a1000000-0000-0000-0000-000000000053', test.id('ajugend'), 'coach', r.id from public.coach_roles r where r.team_id = test.id('ajugend') and r.locked$q$, 1);
select test.expect_rows('lead: invites her',
  $q$insert into public.staff_invites (token, person_id, team_id) values ('e1000000-0000-0000-0000-000000000053', 'a1000000-0000-0000-0000-000000000053', test.id('ajugend'))$q$, 1);
select test.expect_count('lead: sees the team''s sessions, roles and staff',
  $q$select 1 from public.coach_roles where team_id = test.id('ajugend')$q$, 4);
reset role;

-- A player joins A-Jugend and reports for a session.
insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at)
values ('51000000-0000-0000-0000-000000000001', :'club1', test.id('handball'), test.id('ajugend'), 'Training', 'training', now() + interval '1 day', now() + interval '1 day 90 minutes');
select code as ajugend_code from public.team_join_codes where team_id = test.id('ajugend') \gset
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000054');
select public.join_team(:'ajugend_code', 'Paul', 'Player') is not null as joined;
reset role;
select test.expect_count('Paul joined A-Jugend', $q$select 1 from public.memberships m join public.people p on p.id = m.person_id where p.user_id = '10000000-0000-0000-0000-000000000054' and m.role = 'athlete'$q$, 1);
insert into public.availability (session_id, person_id, status)
select '51000000-0000-0000-0000-000000000001', p.id, 'out' from public.people p where p.user_id = '10000000-0000-0000-0000-000000000054';

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000052');
select test.expect_count('lead: sees the session', $q$select 1 from public.sessions where id = '51000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_count('lead: but no player data (roster)', $q$select 1 from public.memberships where team_id = test.id('ajugend') and role = 'athlete'$q$, 0);
select test.expect_count('… nor availability', $q$select 1 from public.availability where session_id = '51000000-0000-0000-0000-000000000001'$q$, 0);
select test.expect_count('… nor the join code''s players, but the code itself (to invite players)',
  $q$select 1 from public.team_join_codes where team_id = test.id('ajugend')$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000051');
select test.expect_count('admin as Head Coach of A-Jugend: sees the roster there',
  $q$select 1 from public.memberships where team_id = test.id('ajugend') and role = 'athlete'$q$, 1);
select test.expect_count('admin: but not in Damen I, which she only manages',
  $q$select 1 from unnest(app.team_permissions('71000000-0000-0000-0000-000000000002')) p where p in ('viewRoster', 'viewAttendance', 'viewLoadSummary')$q$, 0);
select test.expect_count('admin: management rights in Damen I',
  $q$select 1 from unnest(app.team_permissions('71000000-0000-0000-0000-000000000002')) p where p in ('editSessions', 'planSeries', 'manageGroups', 'manageFacilities', 'manageStaff')$q$, 5);
reset role;

-- ---------------------------------------------------------------------------
-- Coaches, outsiders, and keeping an admin
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000053');
select test.expect_count('Carla accepts her Head Coach invitation', $q$select public.accept_staff_invite('e1000000-0000-0000-0000-000000000053')$q$, 1);
select test.expect_error('Head Coach: cannot rename her team',
  $q$update public.teams set name = 'Umbenannt' where id = test.id('ajugend')$q$, 'Only the club admin');
select test.expect_error('Head Coach: cannot create teams',
  $q$insert into public.teams (club_id, department_id, name) values (test.id('club'), test.id('handball'), 'C-Jugend')$q$, 'row-level security');
select test.expect_count('Head Coach: does not see the club roles', $q$select 1 from public.club_roles$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_count('outsider (Martin, TV Test): sees nothing of the new club', $q$select 1 from public.teams where club_id = test.id('club')$q$, 0);
select test.expect_error('outsider: cannot add a department there',
  $q$insert into public.departments (club_id, name) values (test.id('club'), 'X')$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000051');
select test.expect_refused_at_commit('admin: cannot remove the last admin (herself)',
  $q$delete from public.club_roles where person_id = test.id('frida') and role = 'admin'$q$, 'at least one admin');
select test.expect_rows('admin: removes Lars as lead', $q$delete from public.club_roles where id = 'cb000000-0000-0000-0000-000000000052'$q$, 1);
-- Before 0011 a team without any staff manager was refused at commit; now
-- the club admin above it counts.
select test.expect_rows('admin: A-Jugend may lose all its coaches, the club still manages it',
  $q$delete from public.memberships where team_id = test.id('ajugend') and role = 'coach'$q$, 2);
reset role;

\echo 'all club administration checks passed'
