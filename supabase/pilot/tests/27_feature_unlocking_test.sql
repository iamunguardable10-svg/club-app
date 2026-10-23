-- Unlocking in three levels (0046): our entitlement, the club's setting, the team's choice. Local fixtures from 05.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;
insert into public.sessions(id,club_id,department_id,team_id,title,session_type,starts_at,ends_at) values ('57000000-0000-0000-0000-0000000000f1','c7000000-0000-0000-0000-000000000001','d7000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','Away game','game',now()+interval '5 days',now()+interval '5 days'+interval '90 minutes'),
 ('57000000-0000-0000-0000-0000000000f2','c7000000-0000-0000-0000-000000000001','d7000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','Away game 2','game',now()+interval '6 days',now()+interval '6 days'+interval '90 minutes');

select test.expect_count('pilot: U20 has every feature', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and features = array['attendance','carpools','load','playbook','polls','squads']$q$, 1);
select test.expect_count('Minis (load switched off before 0046) keep the basic features', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000002' and features = array['attendance','carpools','playbook','polls','squads']$q$, 1);

-- Level 3: the head coach decides for the team.
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_rows('Paul offers a ride', $q$insert into public.carpools(id, session_id, driver_id, seats) values ('ca000000-0000-0000-0000-0000000000f1', '57000000-0000-0000-0000-0000000000f1', 'a7000000-0000-0000-0000-000000000072', 2)$q$, 1);
select test.expect_rows('a player cannot switch team features', $q$update public.teams set feature_choices = array['load'] where id = '77000000-0000-0000-0000-000000000001'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla (head coach) switches carpools off', $q$update public.teams set feature_choices = array['attendance','load','polls','squads'] where id = '77000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_count('… gone from the result', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and not ('carpools' = any (features))$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_error('… nobody can offer a ride now', $q$insert into public.carpools(id, session_id, driver_id, seats) values ('ca000000-0000-0000-0000-0000000000f2', '57000000-0000-0000-0000-0000000000f2', 'a7000000-0000-0000-0000-000000000072', 2)$q$, 'row-level security');
select test.expect_count('… the existing ride stays (hidden, not deleted)', $q$select 1 from public.carpools where id = 'ca000000-0000-0000-0000-0000000000f1'$q$, 1);
reset role;
select test.expect_count('… stored', $q$select 1 from public.carpools where id = 'ca000000-0000-0000-0000-0000000000f1'$q$, 1);

-- The app before 0046 writes `features` and knows only load.
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('an old app switches load off', $q$update public.teams set features = '{}' where id = '77000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_count('… only load changes', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and features = array['attendance','polls','squads'] and feature_choices = array['attendance','polls','squads']$q$, 1);
select test.expect_rows('… and on again', $q$update public.teams set features = array['load'] where id = '77000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_count('… with the other choices kept', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and features = array['attendance','load','polls','squads']$q$, 1);

-- Level 2: the club decides for all teams.
select test.act_as('10000000-0000-0000-0000-000000000075');
select test.expect_error('a coach who is not club admin cannot set club features', $q$insert into public.club_feature_settings(club_id, feature, mode) values ('c7000000-0000-0000-0000-000000000001', 'polls', 'off')$q$, 'row-level security');
reset role;
create temp table versions_before as select version from public.data_changes where club_id = 'c7000000-0000-0000-0000-000000000001' and table_name = 'teams';
grant select on versions_before to authenticated;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla (club admin) switches polls off for all teams', $q$insert into public.club_feature_settings(club_id, feature, mode) values ('c7000000-0000-0000-0000-000000000001', 'polls', 'off')$q$, 1);
select test.expect_count('… off in both teams, whatever they chose', $q$select 1 from public.teams where club_id = 'c7000000-0000-0000-0000-000000000001' and 'polls' = any (features)$q$, 0);
select test.expect_count('… the teams'' result changed for live updates', $q$select 1 from public.data_changes where club_id = 'c7000000-0000-0000-0000-000000000001' and table_name = 'teams' and version > (select version from versions_before)$q$, 1);
select test.expect_error('… no new poll', $q$insert into public.messages(club_id, team_ids, audience, author_id, body, poll_options) values ('c7000000-0000-0000-0000-000000000001', array['77000000-0000-0000-0000-000000000001']::uuid[], 'players', 'a7000000-0000-0000-0000-000000000074', 'Jersey colour?', array['red','blue'])$q$, 'row-level security');
select test.expect_rows('… a message without poll still goes', $q$insert into public.messages(club_id, team_ids, audience, author_id, body) values ('c7000000-0000-0000-0000-000000000001', array['77000000-0000-0000-0000-000000000001']::uuid[], 'players', 'a7000000-0000-0000-0000-000000000074', 'Training moved')$q$, 1);
select test.expect_rows('Carla sets carpools on for all teams', $q$insert into public.club_feature_settings(club_id, feature, mode) values ('c7000000-0000-0000-0000-000000000001', 'carpools', 'on')$q$, 1);
select test.expect_count('… on in U20 although the team switched it off', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and 'carpools' = any (features) and not ('carpools' = any (feature_choices))$q$, 1);
select test.expect_rows('… back to "teams decide"', $q$delete from public.club_feature_settings where club_id = 'c7000000-0000-0000-0000-000000000001'$q$, 2);
select test.expect_count('… the team''s choices count again', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and features = array['attendance','load','polls','squads']$q$, 1);

-- Level 1: our entitlement.
select test.expect_error('nobody in the club can unlock', $q$insert into public.club_entitlements(club_id, feature, source) values ('c7000000-0000-0000-0000-000000000001', 'load', 'manual')$q$, 'permission denied');
select test.expect_count('the club sees its entitlement', $q$select 1 from public.club_entitlements where club_id = 'c7000000-0000-0000-0000-000000000001' and feature = 'load' and source = 'pilot' and valid_until = date '2027-06-30'$q$, 1);
reset role;
update public.club_entitlements set valid_until = current_date - 1 where club_id = 'c7000000-0000-0000-0000-000000000001';
select test.expect_count('ran out: load is off', $q$select 1 from public.teams where club_id = 'c7000000-0000-0000-0000-000000000001' and 'load' = any (features)$q$, 0);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_count('… and its rights are gone', $q$select 1 where 'viewLoadSummary' = any (app.team_permissions('77000000-0000-0000-0000-000000000001'))$q$, 0);
select test.expect_rows('… a team cannot switch it on by itself', $q$update public.teams set feature_choices = array['attendance','load','polls','squads'] where id = '77000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_count('… still off', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and 'load' = any (features)$q$, 0);
reset role;
select app.grant_feature('c7000000-0000-0000-0000-000000000001', 'load', null, 'plan');
select test.expect_count('unlocked again (plan, no end): load is back', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and 'load' = any (features)$q$, 1);
select test.expect_count('the nightly check finds nothing to change', $q$select 1 where app.refresh_team_features() = 0$q$, 1);

-- A club founded now is in the pilot too.
insert into public.clubs(id, name) values ('c7000000-0000-0000-0000-0000000000f9', 'New club');
select test.expect_count('new club: pilot entitlements (load, playbook)', $q$select 1 from public.club_entitlements where club_id = 'c7000000-0000-0000-0000-0000000000f9' and source = 'pilot'$q$, 2);
select test.expect_count('the helpers are not callable over the API', $q$select 1 where has_function_privilege('authenticated', 'app.grant_feature(uuid, text, date, text)', 'execute')$q$, 0);

\echo 'feature unlocking tests passed'
rollback;
