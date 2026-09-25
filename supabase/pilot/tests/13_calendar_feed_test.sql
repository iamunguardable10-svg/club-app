-- Tests for 0023 (piece 19: calendar subscription link). Runs after 01–12
-- and uses the push club of 05: Carla (Head Coach U20), Pia, Paul (group
-- "Backs"), Pete (players). Own sessions, checked by their ids.

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into public.facilities (id, club_id, name, address)
values ('f7000000-0000-0000-0000-000000000019', 'c7000000-0000-0000-0000-000000000001', 'Feed Hall', 'Hallenweg 1');
insert into public.department_facilities values ('d7000000-0000-0000-0000-000000000001', 'f7000000-0000-0000-0000-000000000019');
insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at, facility_id, group_ids, notes)
values
  ('5c000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Team training', 'training', now() + interval '1 day', now() + interval '1 day 90 minutes', 'f7000000-0000-0000-0000-000000000019', '{}', 'Bring, both; kits'),
  ('5c000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Backs session', 'training', now() + interval '2 days', now() + interval '2 days 1 hour', null, '{67000000-0000-0000-0000-000000000001}', null),
  ('5c000000-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Far away', 'training', now() + interval '400 days', now() + interval '400 days 1 hour', null, '{}', null);
insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at, opponent, home_away, venue_address, meet_minutes_before, meet_point)
values ('5c000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Game', 'game', now() + interval '3 days', now() + interval '3 days 2 hours', 'TSV Nord', 'away', 'Sportpark Nord, Essen', 60, 'Car park');
insert into public.squad_entries (session_id, person_id, status) values
  ('5c000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000071', 'reserve'),
  ('5c000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000072', 'not_selected');
update public.sessions set squad_published_at = now() where id = '5c000000-0000-0000-0000-000000000003';
insert into public.athlete_plans (id, person_id, title, date, starts_at, training_type, expected_rpe, expected_duration_minutes) values
  ('5d000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000071', 'Gym: legs', current_date + 1, now() + interval '1 day 4 hours', 'strength', 6, 60),
  ('5d000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000071', 'Easy run', current_date + 2, null, 'endurance', 3, 30);

-- The link
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select test.expect_error('not signed in: no link', $q$select public.calendar_feed_token()$q$, 'permission denied');
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select public.calendar_feed_token() as pia_token \gset
select test.expect_count('Pia gets a long link, the same one again',
  format($q$select 1 where length(%L) >= 48 and public.calendar_feed_token() = %L$q$, :'pia_token', :'pia_token'), 1);
select test.expect_count('… her status knows it', format($q$select 1 where public.calendar_feed_status()->>'token' = %L$q$, :'pia_token'), 1);
select test.expect_error('… the links table is closed to the app', $q$select 1 from public.calendar_feeds$q$, 'permission denied');
select test.expect_error('… and she cannot read a feed herself', format($q$select public.calendar_feed(%L)$q$, :'pia_token'), 'permission denied');
select test.act_as('10000000-0000-0000-0000-000000000072');
select public.calendar_feed_token() as paul_token \gset
select test.act_as('10000000-0000-0000-0000-000000000074');
select public.calendar_feed_token() as carla_token \gset
reset role;

-- What the calendar app gets (the Edge Function runs as the service role)
set role service_role;
select test.expect_count('Pia: team training and the game, not the Backs session, not beyond a year',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' in ('session-5c000000-0000-0000-0000-000000000001@club-os', 'session-5c000000-0000-0000-0000-000000000003@club-os')$q$, :'pia_token'), 2);
select test.expect_count('… nothing she is not in',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' in ('session-5c000000-0000-0000-0000-000000000002@club-os', 'session-5c000000-0000-0000-0000-000000000004@club-os')$q$, :'pia_token'), 0);
select test.expect_count('… training with the hall and its address, and the note',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' = 'session-5c000000-0000-0000-0000-000000000001@club-os'
              and e->>'summary' = 'U20 · Team training' and e->>'location' = 'Feed Hall, Hallenweg 1' and e->>'description' = 'Bring, both; kits'$q$, :'pia_token'), 1);
select test.expect_count('… the game with opponent, away address, her squad status and the meeting',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' = 'session-5c000000-0000-0000-0000-000000000003@club-os'
              and e->>'summary' = 'U20 · Game vs TSV Nord (away)' and e->>'location' = 'Sportpark Nord, Essen'
              and e->>'description' like E'You''re a reserve\nMeet __:__ at Car park'$q$, :'pia_token'), 1);
select test.expect_count('… her own training: timed, and one for the whole day',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where (e->>'uid' = 'plan-5d000000-0000-0000-0000-000000000001@club-os' and e->>'start' is not null and e->>'end' is not null)
               or (e->>'uid' = 'plan-5d000000-0000-0000-0000-000000000002@club-os' and e->>'start' is null and e->>'date' = (current_date + 2)::text)$q$, :'pia_token'), 2);
select test.expect_count('Paul (Backs): the Backs session too',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' = 'session-5c000000-0000-0000-0000-000000000002@club-os'$q$, :'paul_token'), 1);
select test.expect_count('… not picked for the game: says so, no meeting',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' = 'session-5c000000-0000-0000-0000-000000000003@club-os' and e->>'description' = 'Not in the squad this time'$q$, :'paul_token'), 1);
select test.expect_count('… and no one else''s own training',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e where e->>'uid' like 'plan-%%'$q$, :'paul_token'), 0);
select test.expect_count('Carla (coach): every session of her team, no squad status',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' in ('session-5c000000-0000-0000-0000-000000000001@club-os', 'session-5c000000-0000-0000-0000-000000000002@club-os', 'session-5c000000-0000-0000-0000-000000000003@club-os')
              and coalesce(e->>'description', '') not like '%%squad%%'$q$, :'carla_token'), 3);
select test.expect_count('an unknown or short link: nothing', $q$select 1 where public.calendar_feed('nope') is null and public.calendar_feed(repeat('0', 64)) is null$q$, 1);
reset role;
select test.expect_count('fetching is noted', format($q$select 1 from public.calendar_feeds where token = %L and last_fetched_at is not null$q$, :'pia_token'), 1);

-- A cancelled session disappears
delete from public.sessions where id = '5c000000-0000-0000-0000-000000000001';
set role service_role;
select test.expect_count('cancelled training is gone from the feed',
  format($q$select 1 from jsonb_array_elements(public.calendar_feed(%L)->'events') e
            where e->>'uid' = 'session-5c000000-0000-0000-0000-000000000001@club-os'$q$, :'pia_token'), 0);
reset role;

-- New link, stop
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select public.calendar_feed_token(true) as pia_new \gset
select test.expect_count('a new link replaces the old one', format($q$select 1 where %L <> %L$q$, :'pia_new', :'pia_token'), 1);
select public.calendar_feed_stop();
select test.expect_count('switched off: no link any more', $q$select 1 where public.calendar_feed_status() is null$q$, 1);
reset role;
set role service_role;
select test.expect_count('… neither the old nor the new one works',
  format($q$select 1 where public.calendar_feed(%L) is null and public.calendar_feed(%L) is null$q$, :'pia_token', :'pia_new'), 1);
reset role;

delete from public.sessions where id in ('5c000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000003', '5c000000-0000-0000-0000-000000000004');
delete from public.athlete_plans where id in ('5d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002');

select 'calendar feed tests passed' as result;
