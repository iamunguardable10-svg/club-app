-- Tests for 0034: polls in team messages. Uses the push club of 05 and 12
-- (Carla, Head Coach U20; Pia and Paul, players with devices; Pete, a player
-- whose account was deleted in 17; Otto, other club).

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from app.push_outbox where kind in ('message', 'important');

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla asks the team a question with three answers',
  $q$insert into public.messages (id, club_id, team_ids, audience, author_id, body, poll_options)
     values ('e5000000-0000-0000-0000-000000000021', (select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074',
             'Which kit for the final?', '{Home,Away,Third}')$q$, 1);
select test.expect_rows('… and one where several answers are fine',
  $q$insert into public.messages (id, club_id, team_ids, audience, author_id, body, poll_options, poll_multiple)
     values ('e5000000-0000-0000-0000-000000000022', (select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074',
             'Which days work for the team dinner?', '{Friday,Saturday}', true)$q$, 1);
select test.expect_error('a poll needs at least two answers',
  $q$insert into public.messages (club_id, team_ids, audience, author_id, body, poll_options)
     values ((select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'x', '{Yes}')$q$, 'A poll needs');
select test.expect_error('… at most six',
  $q$insert into public.messages (club_id, team_ids, audience, author_id, body, poll_options)
     values ((select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'x', '{a,b,c,d,e,f,g}')$q$, 'A poll needs');
select test.expect_error('… different ones',
  $q$insert into public.messages (club_id, team_ids, audience, author_id, body, poll_options)
     values ((select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'x', '{Yes,yes }')$q$, 'A poll needs');
select test.expect_error('… none empty',
  $q$insert into public.messages (club_id, team_ids, audience, author_id, body, poll_options)
     values ((select club_id from public.teams where id = '77000000-0000-0000-0000-000000000001'), '{77000000-0000-0000-0000-000000000001}', 'players', 'a7000000-0000-0000-0000-000000000074', 'x', '{Yes,"  "}')$q$, 'A poll needs');
select test.expect_error('the answers are fixed once written',
  $q$update public.messages set poll_options = '{Home,Away}' where id = 'e5000000-0000-0000-0000-000000000021'$q$, 'permission denied');
select test.expect_error('… and so are the counts',
  $q$update public.messages set poll_counts = '{9,9,9}' where id = 'e5000000-0000-0000-0000-000000000021'$q$, 'permission denied');
reset role;
select test.expect_count('a new poll starts at zero for each answer',
  $q$select 1 from public.messages where id = 'e5000000-0000-0000-0000-000000000021' and poll_counts = '{0,0,0}' and not poll_multiple and poll_closed_at is null$q$, 1);
select test.expect_count('push: marked as a poll',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:e5000000-0000-0000-0000-000000000021:%' and title = 'Poll · U20 · Carla' and (text_params ->> 'poll')::boolean$q$, 2);

-- Voting
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia votes "Away"',
  $q$insert into public.message_votes (message_id, person_id, options) values ('e5000000-0000-0000-0000-000000000021', 'a7000000-0000-0000-0000-000000000071', '{1}')$q$, 1);
select test.expect_error('… not two answers where only one is allowed',
  $q$update public.message_votes set options = '{0,1}' where message_id = 'e5000000-0000-0000-0000-000000000021'$q$, 'Choose one of the answers');
select test.expect_error('… not an answer that does not exist',
  $q$update public.message_votes set options = '{3}' where message_id = 'e5000000-0000-0000-0000-000000000021'$q$, 'Choose one of the answers');
select test.expect_rows('… changes her mind to "Home"',
  $q$update public.message_votes set options = '{0}' where message_id = 'e5000000-0000-0000-0000-000000000021' and person_id = 'a7000000-0000-0000-0000-000000000071'$q$, 1);
select test.expect_error('… cannot vote for Pete',
  $q$insert into public.message_votes (message_id, person_id, options) values ('e5000000-0000-0000-0000-000000000021', 'a7000000-0000-0000-0000-000000000073', '{0}')$q$, 'row-level security');
select test.expect_error('… cannot vote on a message without a poll',
  $q$insert into public.message_votes (message_id, person_id, options) values ('e5000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000071', '{0}')$q$, 'row-level security');
select test.expect_rows('… picks both days for the dinner',
  $q$insert into public.message_votes (message_id, person_id, options) values ('e5000000-0000-0000-0000-000000000022', 'a7000000-0000-0000-0000-000000000071', '{0,1}')$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul sees the counts …',
  $q$select 1 from public.messages where id = 'e5000000-0000-0000-0000-000000000021' and poll_counts = '{1,0,0}'$q$, 1);
select test.expect_count('… but not who else voted what', $q$select 1 from public.message_votes where person_id <> 'a7000000-0000-0000-0000-000000000072'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_error('Otto (other club) cannot vote',
  $q$insert into public.message_votes (message_id, person_id, options) values ('e5000000-0000-0000-0000-000000000021', 'a7000000-0000-0000-0000-000000000099', '{0}')$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_count('Carla sees who voted what', $q$select 1 from public.message_votes where message_id = 'e5000000-0000-0000-0000-000000000021'$q$, 1);
select test.expect_count('… and the counts of the dinner poll',
  $q$select 1 from public.messages where id = 'e5000000-0000-0000-0000-000000000022' and poll_counts = '{1,1}'$q$, 1);
select test.expect_error('Carla is not a recipient and cannot vote',
  $q$insert into public.message_votes (message_id, person_id, options) values ('e5000000-0000-0000-0000-000000000021', 'a7000000-0000-0000-0000-000000000074', '{2}')$q$, 'row-level security');

-- Remind: only those who have not voted (Paul), even though Pia has not read it either
reset role;
delete from app.push_outbox where kind in ('message', 'important');
set role authenticated;
select test.expect_rows('Carla reminds',
  $q$update public.messages set reminded_at = now() where id = 'e5000000-0000-0000-0000-000000000021'$q$, 1);
reset role;
select test.expect_count('the reminder goes only to Paul, who has not voted',
  $q$select 1 from app.push_outbox where dedupe_key like 'message-reminder:e5000000-0000-0000-0000-000000000021:%' and user_id = '10000000-0000-0000-0000-000000000072'$q$, 1);
select test.expect_count('… nobody else', $q$select 1 from app.push_outbox where dedupe_key like 'message-reminder:e5000000-0000-0000-0000-000000000021:%'$q$, 1);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_rows('Paul reads it',
  $q$insert into public.message_reads (message_id, person_id) values ('e5000000-0000-0000-0000-000000000021', 'a7000000-0000-0000-0000-000000000072')$q$, 1);
reset role;
select test.expect_count('… reading alone does not drop the reminder',
  $q$select 1 from app.push_outbox where dedupe_key like 'message-reminder:e5000000-0000-0000-0000-000000000021:%' and sent_at is null$q$, 1);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_rows('Paul votes "Third"',
  $q$insert into public.message_votes (message_id, person_id, options) values ('e5000000-0000-0000-0000-000000000021', 'a7000000-0000-0000-0000-000000000072', '{2}')$q$, 1);
reset role;
select test.expect_count('… voting does',
  $q$select 1 from app.push_outbox where dedupe_key like 'message-reminder:e5000000-0000-0000-0000-000000000021:%' and sent_at is null$q$, 0);

-- Closing
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia cannot close the poll',
  $q$update public.messages set poll_closed_at = now() where id = 'e5000000-0000-0000-0000-000000000021'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla closes the poll',
  $q$update public.messages set poll_closed_at = now() where id = 'e5000000-0000-0000-0000-000000000021'$q$, 1);
select test.expect_error('… once: it cannot be opened again',
  $q$update public.messages set poll_closed_at = null where id = 'e5000000-0000-0000-0000-000000000021'$q$, 'already closed');
select test.expect_error('a message without a poll cannot be closed',
  $q$update public.messages set poll_closed_at = now() where id = 'e5000000-0000-0000-0000-000000000001'$q$, 'already closed');
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia can no longer change her vote',
  $q$update public.message_votes set options = '{2}' where message_id = 'e5000000-0000-0000-0000-000000000021'$q$, 0);
select test.expect_rows('… nor take it back',
  $q$delete from public.message_votes where message_id = 'e5000000-0000-0000-0000-000000000021'$q$, 0);
select test.expect_rows('… on the open dinner poll she can take hers back',
  $q$delete from public.message_votes where message_id = 'e5000000-0000-0000-0000-000000000022'$q$, 1);
select test.expect_count('… and the counts follow',
  $q$select 1 from public.messages where id = 'e5000000-0000-0000-0000-000000000022' and poll_counts = '{0,0}'$q$, 1);
select test.expect_count('the final result stays',
  $q$select 1 from public.messages where id = 'e5000000-0000-0000-0000-000000000021' and poll_counts = '{1,0,1}' and poll_closed_at is not null$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla deletes the dinner poll',
  $q$delete from public.messages where id = 'e5000000-0000-0000-0000-000000000022'$q$, 1);
reset role;

select 'all message poll checks passed';
