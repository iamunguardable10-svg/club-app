-- Access tests for 0012 (onboarding, piece 8b). Runs after 01–03 on the same
-- database: the club founded in 03 (SV Gruendung, team A-Jugend) and Martin
-- from 01 (another club).

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000061', 'nina@example.test'),
  ('10000000-0000-0000-0000-000000000062', 'otto@example.test');

select code as ajugend_code from public.team_join_codes where team_id = test.id('ajugend') \gset
insert into public.teams (club_id, department_id, name, archived_at)
values (test.id('club'), test.id('handball'), 'Old team', now()) returning id as old_team \gset
select code as old_code from public.team_join_codes where team_id = :'old_team' \gset
select app.create_founding_code('onboarding test') as fresh_code \gset
select code as used_code from public.founding_codes where used_at is not null limit 1 \gset

-- ---------------------------------------------------------------------------
-- Before signing in
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', false);
set role anon;
select test.expect_count('anon: a join code shows club and team',
  'select 1 from public.join_code_preview(' || quote_literal(lower(:'ajugend_code')) || ') where club_name = ''SV Gruendung'' and team_name = ''A-Jugend'' and usable', 1);
select test.expect_count('anon: an archived team is shown as not usable',
  'select 1 from public.join_code_preview(' || quote_literal(:'old_code') || ') where not usable', 1);
select test.expect_count('anon: an unknown code shows nothing', $q$select 1 from public.join_code_preview('NOPE2345')$q$, 0);
select test.expect_count('anon: a fresh founding code is usable',
  'select 1 where public.founding_code_usable(' || quote_literal(lower(:'fresh_code')) || ')', 1);
select test.expect_count('anon: a used founding code is not',
  'select 1 where public.founding_code_usable(' || quote_literal(:'used_code') || ')', 0);
select test.expect_count('anon: a wrong founding code is not', $q$select 1 where public.founding_code_usable('WRONGCODE2')$q$, 0);
select test.expect_error('anon: still cannot join', 'select public.join_team(' || quote_literal(:'ajugend_code') || ', ''A'', ''B'')', 'permission denied|Not signed in');
select test.expect_error('anon: still cannot read join codes', $q$select 1 from public.team_join_codes$q$, 'permission denied');
reset role;

-- ---------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000061');
select test.expect_error('an archived team cannot be joined',
  'select public.join_team(' || quote_literal(:'old_code') || ', ''Nina'', ''New'')', 'no longer active');
select test.expect_count('Nina joins A-Jugend with the code',
  'select public.join_team(' || quote_literal(:'ajugend_code') || ', ''Nina'', ''New'')', 1);
select test.expect_count('Nina now sees her team', $q$select 1 from public.teams where id = test.id('ajugend')$q$, 1);

select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_error('Martin (TV Test) cannot join a team of another club',
  'select public.join_team(' || quote_literal(:'ajugend_code') || ', ''Martin'', ''M'')', 'already belongs to another club');
select test.expect_error('Martin cannot found a second club', 'select public.found_club(' || quote_literal(:'fresh_code') || ', ''X'', '''', ''M'', ''M'', ''D'', ''T'')', 'already belongs to a club');
select test.expect_count('the founding code stays usable after the refusal',
  'select 1 where public.founding_code_usable(' || quote_literal(:'fresh_code') || ')', 1);
reset role;

-- An invitation into SV Gruendung for Otto; Martin (another club) must not take it.
insert into public.people (id, club_id, first_name, last_name) values ('e2000000-0000-0000-0000-000000000062', test.id('club'), 'Otto', 'Assistant');
insert into public.memberships (person_id, team_id, role, coach_role_id)
select 'e2000000-0000-0000-0000-000000000062', test.id('ajugend'), 'coach', r.id from public.coach_roles r where r.team_id = test.id('ajugend') and not r.locked limit 1;
insert into public.staff_invites (token, person_id, team_id) values ('e3000000-0000-0000-0000-000000000062', 'e2000000-0000-0000-0000-000000000062', test.id('ajugend'));

insert into public.people (id, club_id, first_name, last_name) values ('e2000000-0000-0000-0000-000000000063', test.id('club'), 'Lena', 'Lead');
insert into public.club_roles (id, club_id, person_id, role, department_id) values ('cb000000-0000-0000-0000-000000000063', test.id('club'), 'e2000000-0000-0000-0000-000000000063', 'department_lead', test.id('handball'));
insert into public.club_role_invites (token, club_role_id) values ('e3000000-0000-0000-0000-000000000063', 'cb000000-0000-0000-0000-000000000063');

select set_config('request.jwt.claims', '', false);
set role anon;
select test.expect_count('anon: a department lead invitation says it is a club role',
  $q$select 1 from public.invite_preview('e3000000-0000-0000-0000-000000000063') where kind = 'club' and role_name = 'Department lead' and team_name = 'Handball'$q$, 1);
select test.expect_count('anon: a staff invitation says it is one',
  $q$select 1 from public.invite_preview('e3000000-0000-0000-0000-000000000062') where kind = 'staff' and first_name = 'Otto' and usable$q$, 1);
reset role;

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_error('Martin cannot accept an invitation of another club',
  $q$select public.accept_staff_invite('e3000000-0000-0000-0000-000000000062')$q$, 'already belongs to another club');
select test.act_as('10000000-0000-0000-0000-000000000062');
select test.expect_count('Otto accepts his invitation', $q$select public.accept_staff_invite('e3000000-0000-0000-0000-000000000062')$q$, 1);
select test.expect_count('Otto is on the staff now',
  $q$select 1 from public.memberships where team_id = test.id('ajugend') and role = 'coach' and person_id in (select app.my_person_ids())$q$, 1);
reset role;

\echo 'all onboarding checks passed'
