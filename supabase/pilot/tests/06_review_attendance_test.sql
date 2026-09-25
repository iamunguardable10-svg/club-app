-- Tests for 0016 (pieces 10 and 11). Runs after 01–05 and uses the club of 01:
-- Martin (Head Coach U16, all rights), Uwe (Team Manager U16: roster and
-- attendance, no load details), Vera (Head Coach Volleyball), Jonas (player U16),
-- Otto (another club). Session 17 "Athletik U16" is in the past, 16 ahead.

\set ON_ERROR_STOP on
set client_min_messages = notice;

select id as jonas_entry from public.load_entries
where person_id = 'a0000000-0000-0000-0000-000000000011' and session_id = '50000000-0000-0000-0000-000000000017' limit 1 \gset
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
values ('https://push.test/jonas', '10000000-0000-0000-0000-000000000011', 'k', 'a') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 10 · Review marks
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_error('Uwe (no load details) cannot mark an entry',
  'insert into public.load_entry_reviews (entry_id, person_id, requested_by) values (' || quote_literal(:'jonas_entry') || ', ''a0000000-0000-0000-0000-000000000011'', ''a0000000-0000-0000-0000-000000000005'')', 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000006');
select test.expect_error('Vera (Volleyball) cannot mark a U16 entry',
  'insert into public.load_entry_reviews (entry_id, person_id) values (' || quote_literal(:'jonas_entry') || ', ''a0000000-0000-0000-0000-000000000011'')', 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_error('Martin cannot sign as someone else',
  'insert into public.load_entry_reviews (entry_id, person_id, requested_by) values (' || quote_literal(:'jonas_entry') || ', ''a0000000-0000-0000-0000-000000000011'', ''a0000000-0000-0000-0000-000000000003'')', 'row-level security');
select test.expect_rows('Martin marks Jonas'' entry with a note',
  'insert into public.load_entry_reviews (entry_id, person_id, requested_by, note) values (' || quote_literal(:'jonas_entry') || ', ''a0000000-0000-0000-0000-000000000011'', ''a0000000-0000-0000-0000-000000000001'', ''75 min? We did 60.'')', 1);
select test.expect_count('Martin sees the mark', $q$select 1 from public.load_entry_reviews$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_count('Uwe does not see it', $q$select 1 from public.load_entry_reviews$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_count('Jonas sees the mark on his entry', $q$select 1 from public.load_entry_reviews where note like '75 min%'$q$, 1);
select test.expect_error('Jonas cannot mark entries himself',
  'insert into public.load_entry_reviews (entry_id, person_id) values (' || quote_literal(:'jonas_entry') || ', ''a0000000-0000-0000-0000-000000000011'')', 'duplicate|row-level security');
reset role;
select test.expect_count('push: Jonas gets "Please check an entry" with the note',
  $q$select 1 from app.push_outbox where kind = 'review' and user_id = '10000000-0000-0000-0000-000000000011' and body like 'Martin asks you to check Athletik U16%RPE 8 · 75 min) – 75 min? We did 60.' and sent_at is null$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_rows('Jonas corrects the minutes',
  'update public.load_entries set duration_minutes = 60, load = 480 where id = ' || quote_literal(:'jonas_entry'), 1);
select test.expect_count('… the mark is gone', $q$select 1 from public.load_entry_reviews$q$, 0);
reset role;
select test.expect_count('… and so is the unsent push', $q$select 1 from app.push_outbox where kind = 'review' and sent_at is null$q$, 0);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin marks it again',
  'insert into public.load_entry_reviews (entry_id, person_id) values (' || quote_literal(:'jonas_entry') || ', ''a0000000-0000-0000-0000-000000000011'')', 1);
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_rows('Jonas: "it is correct" removes the mark', 'delete from public.load_entry_reviews where entry_id = ' || quote_literal(:'jonas_entry'), 1);
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('Otto (other club) sees nothing', $q$select 1 from public.load_entry_reviews$q$, 0);
reset role;

-- ---------------------------------------------------------------------------
-- 11 · Confirmed attendance
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_error('Jonas cannot confirm his own attendance',
  $q$insert into public.attendance_confirmations (session_id, person_id, present) values ('50000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000011', true)$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000006');
select test.expect_error('Vera (Volleyball) cannot confirm for U16',
  $q$insert into public.attendance_confirmations (session_id, person_id, present) values ('50000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000011', true)$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_error('not before the session has started',
  $q$insert into public.attendance_confirmations (session_id, person_id, present) values ('50000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000011', true)$q$, 'once the session has started');
select test.expect_error('only players of the team',
  $q$insert into public.attendance_confirmations (session_id, person_id, present) values ('50000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000013', true)$q$, 'players of the team');
select test.expect_rows('Uwe (Team Manager, attendance right) confirms Jonas was not there',
  $q$insert into public.attendance_confirmations (session_id, person_id, present, confirmed_by) values ('50000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000011', false, 'a0000000-0000-0000-0000-000000000005')$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_count('Jonas sees the confirmation', $q$select 1 from public.attendance_confirmations where not present$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin corrects it: he was there',
  $q$update public.attendance_confirmations set present = true, confirmed_by = 'a0000000-0000-0000-0000-000000000001' where session_id = '50000000-0000-0000-0000-000000000017' and person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('Otto sees nothing', $q$select 1 from public.attendance_confirmations$q$, 0);
reset role;
select test.expect_count('confirmed absent: the rating push for that session is closed',
  $q$select 1 from app.push_outbox where dedupe_key = 'rate:50000000-0000-0000-0000-000000000017:10000000-0000-0000-0000-000000000011' and sent_at is not null$q$, 1);
select app.push_enqueue_due(now());
select test.expect_count('… and not queued again', $q$select 1 from app.push_outbox where dedupe_key = 'rate:50000000-0000-0000-0000-000000000017:10000000-0000-0000-0000-000000000011' and sent_at is null$q$, 0);

\echo 'all review and attendance checks passed'
