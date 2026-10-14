-- Live updates (0045): every change counts up its club's version of the table; members read only their clubs'. Local fixtures from 05.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;
-- 17 deleted Pete's account; recreate him inside this rolled-back fixture.
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000000073','live-pete@example.test');
insert into public.people(id,club_id,user_id,first_name,last_name) values ('a7000000-0000-0000-0000-000000000073','c7000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000073','Pete','Player');
insert into public.memberships(person_id,team_id,role) values ('a7000000-0000-0000-0000-000000000073','77000000-0000-0000-0000-000000000001','athlete');
-- Someone in another club.
insert into public.clubs(id,name) values ('c7000000-0000-0000-0000-000000000099','Other club');
insert into auth.users(id,email) values ('10000000-0000-0000-0000-0000000007a9','live-other@example.test');
insert into public.people(id,club_id,user_id,first_name,last_name) values ('a7000000-0000-0000-0000-000000000099','c7000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-0000000007a9','Olga','Other');

create temp table before_versions as select table_name, version from public.data_changes where club_id = 'c7000000-0000-0000-0000-000000000001';
grant select on before_versions to authenticated;
create function pg_temp.version_of(p_table text) returns bigint language sql as $$
  select coalesce((select version from public.data_changes where club_id = 'c7000000-0000-0000-0000-000000000001' and table_name = p_table), 0)
$$;
create function pg_temp.moved(p_table text) returns bigint language sql as $$
  select pg_temp.version_of(p_table) - coalesce((select version from before_versions where table_name = p_table), 0)
$$;

-- One statement with three rows counts once.
insert into public.sessions(id,club_id,department_id,team_id,title,session_type,starts_at,ends_at)
select ('57000000-0000-0000-0000-0000000000e' || i)::uuid,'c7000000-0000-0000-0000-000000000001','d7000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','Live','training',now()+interval '3 days',now()+interval '3 days'+interval '1 hour'
from generate_series(1,3) i;
select test.expect_count('three new sessions count once', $q$select 1 where pg_temp.moved('sessions') = 1$q$, 1);

-- A player's answer counts in their club (resolved through the session).
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000073');
select test.expect_rows('Pete answers', $q$insert into public.availability(session_id, person_id, status) values ('57000000-0000-0000-0000-0000000000e1', 'a7000000-0000-0000-0000-000000000073', 'in')$q$, 1);
reset role;
select test.expect_count('the answer counts for availability', $q$select 1 where pg_temp.moved('availability') = 1$q$, 1);
select test.expect_count('other tables did not move', $q$select 1 where pg_temp.moved('messages') = 0 and pg_temp.moved('load_entries') = 0$q$, 1);

-- Deleting a session also deletes its answers; both count, the answer through the person.
delete from public.sessions where id = '57000000-0000-0000-0000-0000000000e1';
select test.expect_count('the deleted session counts', $q$select 1 where pg_temp.moved('sessions') = 2$q$, 1);
select test.expect_count('its deleted answers count', $q$select 1 where pg_temp.moved('availability') = 2$q$, 1);

-- An update with no matching rows changes nothing.
update public.sessions set title = 'x' where id = '57000000-0000-0000-0000-0000000000ff';
select test.expect_count('an update of no rows does not count', $q$select 1 where pg_temp.moved('sessions') = 2$q$, 1);

-- Members read their clubs' versions only, and nobody writes them.
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000073');
select test.expect_count('Pete sees his club', $q$select 1 from public.data_changes where club_id = 'c7000000-0000-0000-0000-000000000001' and table_name = 'availability'$q$, 1);
select test.expect_error('Pete cannot write versions', $q$update public.data_changes set version = 0$q$, 'permission denied');
select test.act_as('10000000-0000-0000-0000-0000000007a9');
select test.expect_count('another club sees none of it', $q$select 1 from public.data_changes where club_id = 'c7000000-0000-0000-0000-000000000001'$q$, 0);
reset role;
set role anon;
select test.expect_error('signed out reads nothing', $q$select 1 from public.data_changes$q$, 'permission denied');
reset role;
select test.expect_count('the helpers are not callable over the API', $q$select 1 where has_function_privilege('authenticated', 'app.change_clubs(text, jsonb)', 'execute')$q$, 0);

\echo 'live update tests passed'
rollback;
