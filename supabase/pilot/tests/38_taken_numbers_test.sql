-- Taken shirt numbers (0060): visible as numbers (no names) to the team and
-- with the join code, refused with a clear reason. Fixtures from 01.
\set ON_ERROR_STOP on
begin;
insert into public.memberships (person_id, team_id, role)
select v.p::uuid, '70000000-0000-0000-0000-000000000016', 'athlete'
from (values ('a0000000-0000-0000-0000-000000000011'), ('a0000000-0000-0000-0000-000000000012')) v(p)
where not exists (select 1 from public.memberships m where m.person_id = v.p::uuid and m.team_id = '70000000-0000-0000-0000-000000000016');
delete from public.team_player_details where team_id = '70000000-0000-0000-0000-000000000016';
insert into public.team_player_details (team_id, person_id, jersey_number) values ('70000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000011', 10);
select code as u16_code from public.team_join_codes where team_id = '70000000-0000-0000-0000-000000000016' \gset

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000012');
select test.expect_count('Ben sees that 10 is taken in his team', $q$select 1 where public.team_taken_numbers('70000000-0000-0000-0000-000000000016') = array[10]::smallint[]$q$, 1);
select test.expect_error('… and cannot take it, with the reason', $q$insert into public.team_player_details (team_id, person_id, jersey_number) values ('70000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000012', 10)$q$, 'already taken');
select test.expect_rows('… 11 is free', $q$insert into public.team_player_details (team_id, person_id, jersey_number) values ('70000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000012', 11)$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_count('Jonas sees 11 taken, not his own 10', $q$select 1 where public.team_taken_numbers('70000000-0000-0000-0000-000000000016') = array[11]::smallint[]$q$, 1);
select test.expect_rows('Jonas keeps his own number when he changes his position', $q$update public.team_player_details set position = 'Center' where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('another club gets no numbers of the team', $q$select 1 where public.team_taken_numbers('70000000-0000-0000-0000-000000000016') = '{}'::smallint[]$q$, 1);
reset role;

set role anon;
select test.expect_count('with the join code, before signing in: the numbers only', 'select 1 where public.join_code_numbers(''' || :'u16_code' || ''') = array[10,11]::smallint[]', 1);
select test.expect_count('an unknown code: none', $q$select 1 where public.join_code_numbers('NOPE0000') = '{}'::smallint[]$q$, 1);
reset role;
rollback;
\echo 'taken numbers checks passed'
