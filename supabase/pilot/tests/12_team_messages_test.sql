-- Tests for 0022 (piece 17: team messages). Runs after 01–11 and uses the
-- push club of 05: Carla (Head Coach U20), Tim (roster and attendance since
-- 10), Pia, Paul (in group "Backs"), Pete (players with devices).

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from app.push_outbox where kind in ('message', 'important');

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla writes to U20',
  $q$insert into public.team_messages (id, team_id, author_id, body)
     values ('e5000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000074', 'Training moves to the small hall this week.')$q$, 1);
select test.expect_error('… not under someone else''s name',
  $q$insert into public.team_messages (team_id, author_id, body) values ('77000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000075', 'x')$q$, 'row-level security');
select test.expect_error('… not empty',
  $q$insert into public.team_messages (team_id, author_id, body) values ('77000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000074', '   ')$q$, 'check');
select test.expect_error('… only to groups of the team',
  $q$insert into public.team_messages (team_id, group_ids, author_id, body) values ('77000000-0000-0000-0000-000000000001', '{9a000000-0000-0000-0000-000000000016}', 'a7000000-0000-0000-0000-000000000074', 'x')$q$, 'groups must belong');
select test.expect_rows('Carla writes an important message to the Backs only',
  $q$insert into public.team_messages (id, team_id, group_ids, author_id, body, important)
     values ('e5000000-0000-0000-0000-000000000002', '77000000-0000-0000-0000-000000000001', '{67000000-0000-0000-0000-000000000001}', 'a7000000-0000-0000-0000-000000000074', 'Backs: extra session Friday 17:00.', true)$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000075');
select test.expect_rows('Tim (team manager rights) may write too',
  $q$insert into public.team_messages (id, team_id, author_id, body) values ('e5000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000075', 'Kit collection on Monday.')$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_error('Pia (player) cannot write',
  $q$insert into public.team_messages (team_id, author_id, body) values ('77000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000071', 'Hi all')$q$, 'row-level security');
select test.expect_count('Pia sees the two team-wide messages, not the one for the Backs',
  $q$select 1 from public.team_messages where team_id = '77000000-0000-0000-0000-000000000001'$q$, 2);
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul (Backs) sees all three', $q$select 1 from public.team_messages where team_id = '77000000-0000-0000-0000-000000000001'$q$, 3);
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('Otto (other club) sees none', $q$select 1 from public.team_messages$q$, 0);
reset role;

select test.expect_count('push: the team message reaches Pia, Paul and Pete',
  $q$select 1 from app.push_outbox where kind = 'message' and dedupe_key like 'message:e5000000-0000-0000-0000-000000000001:%'$q$, 3);
select test.expect_count('… titled with the team and the author',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:e5000000-0000-0000-0000-000000000001:%' and title = 'U20 · Carla' and body = 'Training moves to the small hall this week.'$q$, 3);
select test.expect_count('push: the important one only to Paul, marked important',
  $q$select 1 from app.push_outbox where kind = 'important' and title = 'Important · U20 · Carla' and user_id = '10000000-0000-0000-0000-000000000072'$q$, 1);
select test.expect_count('… nobody else', $q$select 1 from app.push_outbox where kind = 'important'$q$, 1);

-- Reading (automatic when opened: the app writes a read row)
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia opens her messages: read',
  $q$insert into public.message_reads (message_id, person_id) values ('e5000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000071')$q$, 1);
select test.expect_error('she cannot mark one she is not a recipient of',
  $q$insert into public.message_reads (message_id, person_id) values ('e5000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000071')$q$, 'row-level security');
select test.expect_error('… nor mark it for Pete',
  $q$insert into public.message_reads (message_id, person_id) values ('e5000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000073')$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul does not see who else read it', $q$select 1 from public.message_reads where person_id <> 'a7000000-0000-0000-0000-000000000072'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_count('Carla sees that Pia read it', $q$select 1 from public.message_reads where message_id = 'e5000000-0000-0000-0000-000000000001'$q$, 1);

-- Remind once, only the unread
reset role;
update app.push_outbox set sent_at = now() where kind in ('message', 'important');
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla reminds',
  $q$update public.team_messages set reminded_at = now() where id = 'e5000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_error('… only once',
  $q$update public.team_messages set reminded_at = now() + interval '1 minute' where id = 'e5000000-0000-0000-0000-000000000001'$q$, 'already reminded');
reset role;
select test.expect_count('reminder to Paul and Pete (unread), not to Pia',
  $q$select 1 from app.push_outbox where dedupe_key like 'message-reminder:e5000000-0000-0000-0000-000000000001:%' and title like 'Reminder: U20%'
     and user_id in ('10000000-0000-0000-0000-000000000072', '10000000-0000-0000-0000-000000000073')$q$, 2);
select test.expect_count('… none to Pia', $q$select 1 from app.push_outbox where dedupe_key = 'message-reminder:e5000000-0000-0000-0000-000000000001:10000000-0000-0000-0000-000000000071'$q$, 0);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000073');
select test.expect_rows('Pete reads it before the reminder went out',
  $q$insert into public.message_reads (message_id, person_id) values ('e5000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000073')$q$, 1);
reset role;
select test.expect_count('… his reminder is closed', $q$select 1 from app.push_outbox where dedupe_key = 'message-reminder:e5000000-0000-0000-0000-000000000001:10000000-0000-0000-0000-000000000073' and sent_at is not null$q$, 1);

-- Muting
insert into public.notification_settings (user_id, muted_kinds, quiet_from, quiet_to) values ('10000000-0000-0000-0000-000000000073', '{message}', null, null)
on conflict (user_id) do update set muted_kinds = '{message}';
select test.expect_error('important messages cannot be switched off',
  $q$update public.notification_settings set muted_kinds = '{important}' where user_id = '10000000-0000-0000-0000-000000000073'$q$, 'check');

select 'all team message checks passed';
