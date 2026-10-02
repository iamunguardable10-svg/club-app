-- Tests for 0032: how long an important team message stays pinned. Uses the
-- push club of 05 and 12 (Carla, Head Coach U20; Pia, player).

\set ON_ERROR_STOP on
set client_min_messages = notice;

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla pins an important message for one day',
  $q$insert into public.messages (id, club_id, team_ids, audience, author_id, body, important, pinned_until)
     values ('e5000000-0000-0000-0000-000000000011', (select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'Bus leaves 9:00 sharp.', true, now() + interval '1 day')$q$, 1);
select test.expect_rows('… without a time (older app): pinned for a week',
  $q$insert into public.messages (id, club_id, team_ids, audience, author_id, body, important)
     values ('e5000000-0000-0000-0000-000000000012', (select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'Hall closed on Friday.', true)$q$, 1);
select test.expect_error('… not longer than a month',
  $q$insert into public.messages (club_id, team_ids, audience, author_id, body, important, pinned_until)
     values ((select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'x', true, now() + interval '40 days')$q$, 'check');
select test.expect_error('… not in the past',
  $q$insert into public.messages (club_id, team_ids, audience, author_id, body, important, pinned_until)
     values ((select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'x', true, now() - interval '1 day')$q$, 'check');
select test.expect_error('a normal message is never pinned',
  $q$insert into public.messages (club_id, team_ids, audience, author_id, body, pinned_until)
     values ((select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'x', now() + interval '1 day')$q$, 'check');
select test.expect_error('the time is fixed once written',
  $q$update public.messages set pinned_until = now() + interval '14 days' where id = 'e5000000-0000-0000-0000-000000000011'$q$, 'permission denied');
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('Pia sees until when',
  $q$select 1 from public.messages where id = 'e5000000-0000-0000-0000-000000000011' and pinned_until > now() and pinned_until <= now() + interval '1 day'$q$, 1);
reset role;
select test.expect_count('the one without a time: a week after it was written',
  $q$select 1 from public.messages where id = 'e5000000-0000-0000-0000-000000000012' and pinned_until = created_at + interval '7 days'$q$, 1);

select 'all message pinning checks passed';
