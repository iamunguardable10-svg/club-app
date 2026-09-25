-- Tests for 0019 (piece 14: notes, meeting, game details). Runs after 01–08
-- and uses the push club of 05: Carla (Head Coach U20), Pia and Paul
-- (players U20, with devices), Tim (Helper, roster only).

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at) values
  ('57000000-0000-0000-0000-000000000091', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Game', 'game', date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 2 hours'),
  ('57000000-0000-0000-0000-000000000092', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Training', 'training', date_trunc('hour', now()) + interval '4 days', date_trunc('hour', now()) + interval '4 days 90 minutes');
delete from app.push_outbox where session_id in ('57000000-0000-0000-0000-000000000091', '57000000-0000-0000-0000-000000000092');

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla adds opponent, away, address and meeting to the game',
  $q$update public.sessions set opponent = 'TSV Neustadt', home_away = 'away', venue_address = 'Sportpark 3, Neustadt',
     meet_minutes_before = 90, meet_point = 'Club car park', notes = 'Bring both kits.' where id = '57000000-0000-0000-0000-000000000091'$q$, 1);
select test.expect_error('a training has no opponent',
  $q$update public.sessions set opponent = 'X' where id = '57000000-0000-0000-0000-000000000092'$q$, 'sessions_game_details');
select test.expect_error('an address only for away games',
  $q$update public.sessions set home_away = 'home' where id = '57000000-0000-0000-0000-000000000091'$q$, 'sessions_venue_only_away');
select test.expect_error('meeting at most 4 hours before',
  $q$update public.sessions set meet_minutes_before = 300 where id = '57000000-0000-0000-0000-000000000092'$q$, 'check');
select test.expect_error('notes at most 1000 characters',
  $q$update public.sessions set notes = repeat('x', 1001) where id = '57000000-0000-0000-0000-000000000092'$q$, 'check');
select test.act_as('10000000-0000-0000-0000-000000000075');
select test.expect_rows('Tim (Helper, no planning right) cannot change the meeting point',
  $q$update public.sessions set meet_point = 'Elsewhere' where id = '57000000-0000-0000-0000-000000000091'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('Pia (player) sees the game details',
  $q$select 1 from public.sessions where id = '57000000-0000-0000-0000-000000000091' and opponent = 'TSV Neustadt' and meet_point = 'Club car park' and notes = 'Bring both kits.'$q$, 1);
reset role;

select test.expect_count('push: Pia is told where and when to meet',
  $q$select 1 from app.push_outbox where kind = 'changed' and session_id = '57000000-0000-0000-0000-000000000091'
     and user_id = '10000000-0000-0000-0000-000000000071'
     and body like 'Game vs TSV Neustadt · now %' and body like '%· Sportpark 3, Neustadt · Meet __:__ at Club car park'$q$, 1);

delete from app.push_outbox where session_id in ('57000000-0000-0000-0000-000000000091', '57000000-0000-0000-0000-000000000092');
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla only changes the note of the training',
  $q$update public.sessions set notes = 'Indoor shoes' where id = '57000000-0000-0000-0000-000000000092'$q$, 1);
reset role;
select test.expect_count('… a note alone sends nothing', $q$select 1 from app.push_outbox where session_id = '57000000-0000-0000-0000-000000000092'$q$, 0);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla sets a meeting time for the training',
  $q$update public.sessions set meet_minutes_before = 15 where id = '57000000-0000-0000-0000-000000000092'$q$, 1);
reset role;
select test.expect_count('… that is a change players hear about',
  $q$select 1 from app.push_outbox where kind = 'changed' and session_id = '57000000-0000-0000-0000-000000000092' and body like '%Meet __:__' and body not like '%Meet __:__ at%'$q$, 2);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('series carry notes and meeting too',
  $q$insert into public.session_series (club_id, department_id, team_id, title, session_type, weekday, start_time, end_time, notes, meet_minutes_before, meet_point)
     values ('c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 'Training', 'training', 2, '18:00', '19:30', 'Warm up outside', 15, 'Hall entrance')$q$, 1);
select test.expect_rows('Carla cancels the game',
  $q$delete from public.sessions where id = '57000000-0000-0000-0000-000000000091'$q$, 1);
reset role;
select test.expect_count('… the cancellation names the opponent',
  $q$select 1 from app.push_outbox where kind = 'cancelled' and session_id = '57000000-0000-0000-0000-000000000091' and body like 'Game vs TSV Neustadt on % is cancelled.'$q$, 2);

select 'all session detail checks passed';
