-- Carpools (0047): departure time and meeting point, their checks and the push to riders. Local fixtures from 05.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;
insert into public.sessions(id,club_id,department_id,team_id,title,session_type,starts_at,ends_at) values ('57000000-0000-0000-0000-0000000000e9','c7000000-0000-0000-0000-000000000001','d7000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','Away game','game',date_trunc('day', now()) + interval '4 days 15 hours',date_trunc('day', now()) + interval '4 days 17 hours');
insert into public.push_subscriptions(endpoint,user_id,p256dh,auth) values ('https://push.test/departure-pia','10000000-0000-0000-0000-000000000071','k','a') on conflict do nothing;

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_rows('Paul offers a ride leaving an hour before, from the school', $q$insert into public.carpools(id, session_id, driver_id, seats, depart_at, meet_point) values ('ca000000-0000-0000-0000-0000000000e9', '57000000-0000-0000-0000-0000000000e9', 'a7000000-0000-0000-0000-000000000072', 3, date_trunc('day', now()) + interval '4 days 14 hours', 'School car park')$q$, 1);
select test.expect_error('… not after the start', $q$update public.carpools set depart_at = date_trunc('day', now()) + interval '4 days 15 hours' where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 'before the game');
select test.expect_error('… not more than a day before', $q$update public.carpools set depart_at = date_trunc('day', now()) + interval '3 days 14 hours' where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 'at most 24 hours');
select test.expect_error('… meeting point length', $q$update public.carpools set meet_point = repeat('x', 121) where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 'check');

select test.expect_error('a pin needs both coordinates', $q$update public.carpools set meet_lat = 48.1 where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 'meet_pin');
select test.expect_rows('… with both it is kept', $q$update public.carpools set meet_lat = 48.1374, meet_lng = 11.5755 where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia rides along', $q$insert into public.carpool_riders(carpool_id, person_id) values ('ca000000-0000-0000-0000-0000000000e9', 'a7000000-0000-0000-0000-000000000071')$q$, 1);
select test.expect_rows('… and cannot change the departure', $q$update public.carpools set meet_point = 'Elsewhere' where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 0);

select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_rows('Paul moves the departure', $q$update public.carpools set depart_at = date_trunc('day', now()) + interval '4 days 13 hours 30 minutes', meet_point = 'Station' where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 1);
reset role;
select test.expect_count('… Pia is told, in her language later (text key and values)', $q$select 1 from app.push_outbox where dedupe_key = 'carpool:ca000000-0000-0000-0000-0000000000e9:changed:10000000-0000-0000-0000-000000000071' and text_key = 'push.carpoolChanged' and text_params->>'meet_point' = 'Station' and text_params ? 'depart_at'$q$, 1);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_rows('Paul changes only the seats', $q$update public.carpools set seats = 4 where id = 'ca000000-0000-0000-0000-0000000000e9'$q$, 1);
reset role;
select test.expect_count('… no second push for that', $q$select 1 from app.push_outbox where dedupe_key like 'carpool:ca000000-0000-0000-0000-0000000000e9:changed:%'$q$, 1);

\echo 'carpool departure tests passed'
rollback;
