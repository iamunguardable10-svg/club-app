-- Player profile (0051): number and position per team, height and strong side per person. Fixtures from 01.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;

-- Earlier tests take Jonas and Ben out of the U16; here they play there again.
insert into public.memberships (person_id, team_id, role)
select v.p::uuid, '70000000-0000-0000-0000-000000000016', 'athlete'
from (values ('a0000000-0000-0000-0000-000000000011'), ('a0000000-0000-0000-0000-000000000012')) v(p)
where not exists (select 1 from public.memberships m where m.person_id = v.p::uuid and m.team_id = '70000000-0000-0000-0000-000000000016');

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_rows('Jonas sets his number and position in the U16', $q$insert into public.team_player_details (team_id, person_id, jersey_number, position) values ('70000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000011', 7, ' Point Guard ')$q$, 1);
select test.expect_count('… stored without the spaces', $q$select 1 from public.team_player_details where position = 'Point Guard'$q$, 1);
select test.expect_error('… not for a team he does not play in', $q$insert into public.team_player_details (team_id, person_id, jersey_number) values ('70000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000011', 9)$q$, 'Only a player of the team');
select test.expect_error('… not for Ben', $q$insert into public.team_player_details (team_id, person_id, jersey_number) values ('70000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000012', 9)$q$, 'row-level security');
select test.expect_error('… numbers go up to 99', $q$update public.team_player_details set jersey_number = 100 where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 'check');
select test.expect_rows('his height and strong side', $q$insert into public.person_details (person_id, height_cm, strong_side) values ('a0000000-0000-0000-0000-000000000011', 186, 'right')$q$, 1);
select test.expect_error('… a height that cannot be', $q$update public.person_details set height_cm = 400 where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 'check');

select test.act_as('10000000-0000-0000-0000-000000000012');
select test.expect_count('Ben does not see Jonas'' number', $q$select 1 from public.team_player_details$q$, 0);
select test.expect_count('… nor his height', $q$select 1 from public.person_details$q$, 0);
select test.expect_rows('Ben takes number 12', $q$insert into public.team_player_details (team_id, person_id, jersey_number) values ('70000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000012', 12)$q$, 1);
select test.expect_error('… but not 7, which is Jonas''', $q$update public.team_player_details set jersey_number = 7 where person_id = 'a0000000-0000-0000-0000-000000000012'$q$, 'duplicate key');

select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_count('the team manager sees both numbers', $q$select 1 from public.team_player_details$q$, 2);
select test.expect_count('… and Jonas'' height', $q$select 1 from public.person_details$q$, 1);
select test.expect_rows('… but cannot change a number', $q$update public.team_player_details set jersey_number = 5 where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 0);

select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('the head coach changes Jonas'' number', $q$update public.team_player_details set jersey_number = 5 where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 1);
select test.expect_rows('… but not his height', $q$update public.person_details set height_cm = 150 where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 0);

select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('another club sees nothing', $q$select 1 from public.team_player_details union all select 1 from public.person_details$q$, 0);

reset role;
delete from public.memberships where person_id = 'a0000000-0000-0000-0000-000000000012' and team_id = '70000000-0000-0000-0000-000000000016';
select test.expect_count('leaving the team frees Ben''s number', $q$select 1 from public.team_player_details where person_id = 'a0000000-0000-0000-0000-000000000012'$q$, 0);

\echo 'player profile tests passed'
rollback;
