-- Access tests for 0004 (join codes, staff invitations). Runs after
-- 01_rls_test.sql on the same database and reuses its fixture and helpers.

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000031', 'neu-spieler@example.test'),
  ('10000000-0000-0000-0000-000000000032', 'neu-trainerin@example.test');

-- A placeholder staff member for Sabine to be invited into U16 (merge case),
-- and an expired invitation.
insert into public.people (id, club_id, first_name, last_name) values
  ('a0000000-0000-0000-0000-000000000041', 'c0000000-0000-0000-0000-000000000001', 'Sabine', 'Köhler'),
  ('a0000000-0000-0000-0000-000000000042', 'c0000000-0000-0000-0000-000000000001', 'Alt', 'Einladung');
insert into public.memberships (person_id, team_id, role, coach_role_id)
select p, '70000000-0000-0000-0000-000000000016', 'coach', r.id
from unnest(array['a0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000042']::uuid[]) p,
     public.coach_roles r
where r.team_id = '70000000-0000-0000-0000-000000000016' and r.name = 'Co-Trainer';
insert into public.staff_invites (token, person_id, team_id) values
  ('e0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000041', '70000000-0000-0000-0000-000000000016');
insert into public.staff_invites (token, person_id, team_id, expires_at) values
  ('e0000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000042', '70000000-0000-0000-0000-000000000016', now() - interval '1 day');

select test.expect_count('every team got a join code', 'select 1 from public.team_join_codes', 3);

-- ---------------------------------------------------------------------------
-- Join codes and invitations: who may see and change them
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_count('Martin sees the U16 join code only', 'select 1 from public.team_join_codes', 1);
select test.expect_rows('Martin replaces the U16 code',
  $q$update public.team_join_codes set code = 'TEST2345' where team_id = '70000000-0000-0000-0000-000000000016'$q$, 1);
select test.expect_error('a code must be eight unambiguous characters',
  $q$update public.team_join_codes set code = 'OI01' where team_id = '70000000-0000-0000-0000-000000000016'$q$, 'check');
select test.expect_rows('Martin invites Lea Sommer',
  $q$insert into public.staff_invites (token, person_id, team_id) values ('e0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000016')$q$, 1);
select test.expect_error('no invitation for an athlete',
  $q$insert into public.staff_invites (person_id, team_id) values ('a0000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000016')$q$, 'Trainerteam');
select test.expect_error('no invitation for someone with an account',
  $q$insert into public.staff_invites (person_id, team_id) values ('a0000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000016')$q$, 'Konto');
select test.expect_error('Martin cannot invite into U18',
  $q$insert into public.staff_invites (person_id, team_id) values ('a0000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000018')$q$);
reset role;

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_count('Uwe (Betreuer) sees no join code', 'select 1 from public.team_join_codes', 0);
select test.expect_count('Uwe sees no invitations', 'select 1 from public.staff_invites', 0);
select test.expect_rows('Uwe cannot replace the code',
  $q$update public.team_join_codes set code = 'UWEUWE22' where team_id = '70000000-0000-0000-0000-000000000016'$q$, 0);
reset role;

-- ---------------------------------------------------------------------------
-- Not signed in: may look at an invitation, nothing else
-- ---------------------------------------------------------------------------

set role anon;
select test.expect_count('anon sees what an invitation is for',
  $q$select 1 from public.invite_preview('e0000000-0000-0000-0000-000000000021') where usable and team_name = 'U16' and role_name = 'Physio'$q$, 1);
select test.expect_count('an unknown token shows nothing',
  $q$select 1 from public.invite_preview('e0000000-0000-0000-0000-0000000000ff')$q$, 0);
select test.expect_error('anon cannot join a team', $q$select public.join_team('TEST2345', 'A', 'B')$q$, 'permission denied');
select test.expect_error('anon cannot accept an invitation', $q$select public.accept_staff_invite('e0000000-0000-0000-0000-000000000021')$q$, 'permission denied');
select test.expect_error('anon cannot read join codes', 'select * from public.team_join_codes', 'permission denied');
reset role;

-- ---------------------------------------------------------------------------
-- A new athlete joins with the code
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000031');
select test.expect_count('before joining: no club data', 'select 1 from public.sessions', 0);
select test.expect_error('a wrong code is refused', $q$select public.join_team('WRONG234', 'Mia', 'Neu')$q$, 'gibt es nicht');
select test.expect_error('names are needed', $q$select public.join_team('TEST2345', ' ', '')$q$, 'Nachname');
select test.expect_count('Mia joins U16 with the code (any case, spaces)',
  $q$select 1 from public.join_team(' test2345 ', 'Mia', 'Neu') t where t = '70000000-0000-0000-0000-000000000016'$q$, 1);
select test.expect_count('Mia is now an athlete of U16', $q$select 1 from public.memberships where role = 'athlete'$q$, 1);
select test.expect_count('Mia sees U16 sessions', 'select 1 from public.sessions', 2);
select test.expect_count('joining twice changes nothing',
  $q$select 1 from public.join_team('TEST2345', 'Mia', 'Neu') t where t = '70000000-0000-0000-0000-000000000016'$q$, 1);
select test.expect_count('… still one person, one membership',
  $q$select 1 from public.people p join public.memberships m on m.person_id = p.id where p.user_id = '10000000-0000-0000-0000-000000000031'$q$, 1);
reset role;

-- ---------------------------------------------------------------------------
-- Invitations are accepted
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000032');
select test.expect_count('the new coach accepts Lea''s invitation',
  $q$select 1 from public.accept_staff_invite('e0000000-0000-0000-0000-000000000021') t where t = '70000000-0000-0000-0000-000000000016'$q$, 1);
select test.expect_count('… and is Lea now, with her Physio role',
  $q$select 1 from public.people p join public.memberships m on m.person_id = p.id join public.coach_roles r on r.id = m.coach_role_id
     where p.user_id = '10000000-0000-0000-0000-000000000032' and p.first_name = 'Lea' and r.name = 'Physio'$q$, 1);
select test.expect_count('… and sees the U16 roles now', 'select 1 from public.coach_roles', 5);
select test.expect_error('an invitation works once', $q$select public.accept_staff_invite('e0000000-0000-0000-0000-000000000021')$q$, 'gilt nicht mehr');
select test.expect_error('an expired invitation is refused', $q$select public.accept_staff_invite('e0000000-0000-0000-0000-000000000042')$q$, 'gilt nicht mehr');
reset role;

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000002');
select test.expect_count('Sabine (U18) accepts an invitation into U16',
  $q$select 1 from public.accept_staff_invite('e0000000-0000-0000-0000-000000000041')$q$, 1);
reset role;
select test.expect_count('… she stays one person, now coaching both teams',
  $q$select 1 from public.memberships m join public.people p on p.id = m.person_id
     where p.user_id = '10000000-0000-0000-0000-000000000002' and m.role = 'coach'$q$, 2);
select test.expect_count('… and the placeholder is gone',
  $q$select 1 from public.people where id = 'a0000000-0000-0000-0000-000000000041'$q$, 0);

-- ---------------------------------------------------------------------------
-- Setting up a club (owner only)
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_error('the app cannot set up clubs',
  $q$select app.setup_club('X', 'Y', 'Z', 'T', 'A', 'B')$q$, 'permission denied');
reset role;

select app.setup_club('Pilotverein', 'Essen', 'Basketball', 'U14', 'Petra', 'Pilot', 'Halle Süd', 'Südweg 1') as setup_token \gset
select test.expect_count('setup: club, team with four roles, join code and hall',
  $q$select 1 from public.teams t
     join public.clubs c on c.id = t.club_id and c.name = 'Pilotverein'
     join public.team_join_codes j on j.team_id = t.id
     join public.facilities f on f.id = t.default_facility_id and f.name = 'Halle Süd'
     where (select count(*) from public.coach_roles r where r.team_id = t.id) = 4$q$, 1);
select test.expect_count('setup: the invitation is for Petra as Head Coach',
  'select 1 from public.invite_preview(' || quote_literal(:'setup_token') || ') where usable and role_name = ''Head Coach'' and first_name = ''Petra''', 1);

\echo 'all access checks for join codes and invitations passed'
