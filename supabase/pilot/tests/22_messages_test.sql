-- Tests for 0036: one kind of message to teams, departments and the whole
-- club. A small club of its own: Anna (club admin), Leo (lead of Handball),
-- Hugo (Head Coach of the Handball team), Pia (player in Handball A and in
-- Tennis Damen), Tom (player, Tennis); Otto is in another club.

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-0000000000c1', 'anna.news@example.test'),
  ('10000000-0000-0000-0000-0000000000c2', 'leo.news@example.test'),
  ('10000000-0000-0000-0000-0000000000c3', 'hugo.news@example.test'),
  ('10000000-0000-0000-0000-0000000000c4', 'pia.news@example.test'),
  ('10000000-0000-0000-0000-0000000000c5', 'tom.news@example.test');
insert into public.clubs (id, name) values ('cc000000-0000-0000-0000-000000000001', 'TV Nachrichten');
insert into public.departments (id, club_id, name) values
  ('cd000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'Handball'),
  ('cd000000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000001', 'Tennis');
insert into public.teams (id, club_id, department_id, name) values
  ('ce000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001', 'Handball A'),
  ('ce000000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000002', 'Tennis Damen');
insert into public.people (id, club_id, user_id, first_name, last_name) values
  ('cf000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c1', 'Anna', 'Admin'),
  ('cf000000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c2', 'Leo', 'Lead'),
  ('cf000000-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c3', 'Hugo', 'Head'),
  ('cf000000-0000-0000-0000-000000000004', 'cc000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c4', 'Pia', 'Player'),
  ('cf000000-0000-0000-0000-000000000005', 'cc000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000c5', 'Tom', 'Tennis');
insert into public.club_roles (club_id, person_id, role, department_id) values
  ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', 'admin', null),
  ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000002', 'department_lead', 'cd000000-0000-0000-0000-000000000001');
insert into public.memberships (person_id, team_id, role, coach_role_id)
  select 'cf000000-0000-0000-0000-000000000003', 'ce000000-0000-0000-0000-000000000001', 'coach', r.id
  from public.coach_roles r where r.team_id = 'ce000000-0000-0000-0000-000000000001' and r.locked;
insert into public.memberships (person_id, team_id, role) values
  ('cf000000-0000-0000-0000-000000000004', 'ce000000-0000-0000-0000-000000000001', 'athlete'),
  ('cf000000-0000-0000-0000-000000000004', 'ce000000-0000-0000-0000-000000000002', 'athlete'),
  ('cf000000-0000-0000-0000-000000000005', 'ce000000-0000-0000-0000-000000000002', 'athlete');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values
  ('https://push.test/news-hugo', '10000000-0000-0000-0000-0000000000c3', 'k', 'a'),
  ('https://push.test/news-pia', '10000000-0000-0000-0000-0000000000c4', 'k', 'a'),
  ('https://push.test/news-tom', '10000000-0000-0000-0000-0000000000c5', 'k', 'a');

-- Sending
set role authenticated;
select test.act_as('10000000-0000-0000-0000-0000000000c1');
select test.expect_rows('Anna (admin) writes to the whole club',
  $q$insert into public.messages (id, club_id, whole_club, author_id, body)
     values ('c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', true, 'cf000000-0000-0000-0000-000000000001', 'General meeting on 12 November, 19:00, club house.')$q$, 1);
select test.expect_rows('… and an important one, pinned a week unless given',
  $q$insert into public.messages (id, club_id, whole_club, author_id, body, important)
     values ('c0000000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000001', true, 'cf000000-0000-0000-0000-000000000001', 'All halls closed on Monday.', true)$q$, 1);
select test.expect_error('a message needs someone to go to',
  $q$insert into public.messages (club_id, author_id, body) values ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', 'x')$q$, 'check');
select test.act_as('10000000-0000-0000-0000-0000000000c2');
select test.expect_rows('Leo (lead) writes to Handball',
  $q$insert into public.messages (id, club_id, department_ids, author_id, body)
     values ('c0000000-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-000000000001', '{cd000000-0000-0000-0000-000000000001}', 'cf000000-0000-0000-0000-000000000002', 'Handball summer party on Saturday.')$q$, 1);
select test.expect_error('… not to Tennis',
  $q$insert into public.messages (club_id, department_ids, author_id, body)
     values ('cc000000-0000-0000-0000-000000000001', '{cd000000-0000-0000-0000-000000000002}', 'cf000000-0000-0000-0000-000000000002', 'x')$q$, 'row-level security');
select test.expect_error('… not to Handball and Tennis together',
  $q$insert into public.messages (club_id, department_ids, author_id, body)
     values ('cc000000-0000-0000-0000-000000000001', '{cd000000-0000-0000-0000-000000000001,cd000000-0000-0000-0000-000000000002}', 'cf000000-0000-0000-0000-000000000002', 'x')$q$, 'row-level security');
select test.expect_error('… not to the whole club',
  $q$insert into public.messages (club_id, whole_club, author_id, body) values ('cc000000-0000-0000-0000-000000000001', true, 'cf000000-0000-0000-0000-000000000002', 'x')$q$, 'row-level security');
select test.expect_rows('… only to the coaches of Handball',
  $q$insert into public.messages (id, club_id, department_ids, audience, author_id, body)
     values ('c0000000-0000-0000-0000-000000000005', 'cc000000-0000-0000-0000-000000000001', '{cd000000-0000-0000-0000-000000000001}', 'staff', 'cf000000-0000-0000-0000-000000000002', 'Coaches meeting on Thursday.')$q$, 1);

-- Writers, person by person
select test.act_as('10000000-0000-0000-0000-0000000000c3');
select test.expect_error('Hugo (Head Coach) may not write to Handball yet',
  $q$insert into public.messages (club_id, department_ids, author_id, body)
     values ('cc000000-0000-0000-0000-000000000001', '{cd000000-0000-0000-0000-000000000001}', 'cf000000-0000-0000-0000-000000000003', 'x')$q$, 'row-level security');
select test.expect_error('… nor allow it himself',
  $q$insert into public.message_writers (club_id, person_id, department_id)
     values ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000003', 'cd000000-0000-0000-0000-000000000001')$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-0000000000c2');
select test.expect_rows('Leo lets Hugo write to Handball',
  $q$insert into public.message_writers (club_id, person_id, department_id)
     values ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000003', 'cd000000-0000-0000-0000-000000000001')$q$, 1);
select test.expect_error('… but not to Tennis',
  $q$insert into public.message_writers (club_id, person_id, department_id)
     values ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000003', 'cd000000-0000-0000-0000-000000000002')$q$, 'row-level security');
select test.expect_error('… nor to the whole club',
  $q$insert into public.message_writers (club_id, person_id) values ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000003')$q$, 'row-level security');
select test.expect_rows('… and he cannot rename the department any more',
  $q$update public.departments set name = 'Handball!' where id = 'cd000000-0000-0000-0000-000000000001'$q$, 0);
select test.act_as('10000000-0000-0000-0000-0000000000c3');
select test.expect_rows('Hugo now writes to Handball',
  $q$insert into public.messages (id, club_id, department_ids, author_id, body)
     values ('c0000000-0000-0000-0000-000000000004', 'cc000000-0000-0000-0000-000000000001', '{cd000000-0000-0000-0000-000000000001}', 'cf000000-0000-0000-0000-000000000003', 'New training times from next week.')$q$, 1);
select test.expect_error('… still not to the whole club',
  $q$insert into public.messages (club_id, whole_club, author_id, body) values ('cc000000-0000-0000-0000-000000000001', true, 'cf000000-0000-0000-0000-000000000003', 'x')$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-0000000000c4');
select test.expect_error('Pia (player) cannot write',
  $q$insert into public.messages (club_id, team_ids, author_id, body)
     values ('cc000000-0000-0000-0000-000000000001', '{ce000000-0000-0000-0000-000000000001}', 'cf000000-0000-0000-0000-000000000004', 'x')$q$, 'row-level security');
select test.expect_count('… nor see who may write', $q$select 1 from public.message_writers$q$, 0);
select test.act_as('10000000-0000-0000-0000-0000000000c1');
select test.expect_rows('Anna lets Leo write to the whole club',
  $q$insert into public.message_writers (club_id, person_id) values ('cc000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000002')$q$, 1);
select test.act_as('10000000-0000-0000-0000-0000000000c2');
select test.expect_rows('Leo now writes to the whole club',
  $q$insert into public.messages (id, club_id, whole_club, author_id, body)
     values ('c0000000-0000-0000-0000-000000000006', 'cc000000-0000-0000-0000-000000000001', true, 'cf000000-0000-0000-0000-000000000002', 'Volunteers wanted for the club fair.')$q$, 1);

-- Several teams at once: everyone once
select test.act_as('10000000-0000-0000-0000-0000000000c1');
select test.expect_rows('Anna writes to both teams',
  $q$insert into public.messages (id, club_id, team_ids, author_id, body)
     values ('c0000000-0000-0000-0000-000000000007', 'cc000000-0000-0000-0000-000000000001', '{ce000000-0000-0000-0000-000000000001,ce000000-0000-0000-0000-000000000002}', 'cf000000-0000-0000-0000-000000000001', 'Club photos on Sunday.')$q$, 1);
reset role;
select test.expect_count('Pia (in both teams) is a recipient once',
  $q$select 1 from app.message_recipients('c0000000-0000-0000-0000-000000000007') r where r.person_id = 'cf000000-0000-0000-0000-000000000004'$q$, 1);
select test.expect_count('… everyone once: Pia, Tom and Hugo',
  $q$select 1 from app.message_recipients('c0000000-0000-0000-0000-000000000007')$q$, 3);
select test.expect_count('… one push each, titled with both teams',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:c0000000-0000-0000-0000-000000000007:%' and title = 'Handball A · Tennis Damen · Anna'$q$, 3);

-- Reading
set role authenticated;
select test.act_as('10000000-0000-0000-0000-0000000000c4');
select test.expect_count('Pia sees the club news, Handball''s for everyone, and the one to her teams (not the coaches'' one)',
  $q$select 1 from public.messages$q$, 6);
select test.act_as('10000000-0000-0000-0000-0000000000c5');
select test.expect_count('Tom (Tennis) sees the club ones and the one to his team', $q$select 1 from public.messages$q$, 4);
select test.act_as('10000000-0000-0000-0000-0000000000c3');
select test.expect_count('Hugo sees the coaches'' message too', $q$select 1 from public.messages where id = 'c0000000-0000-0000-0000-000000000005'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('Otto (other club) sees none', $q$select 1 from public.messages where club_id = 'cc000000-0000-0000-0000-000000000001'$q$, 0);
reset role;
select test.expect_count('the important one is pinned for a week',
  $q$select 1 from public.messages where id = 'c0000000-0000-0000-0000-000000000002' and pinned_until = created_at + interval '7 days'$q$, 1);

-- Pushes
select test.expect_count('club news: to Hugo, Pia and Tom (the ones with a device)',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:c0000000-0000-0000-0000-000000000001:%' and title = 'TV Nachrichten · Anna' and text_key = 'push.message'$q$, 3);
select test.expect_count('Handball news by Leo: to Hugo and Pia, not Tom',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:c0000000-0000-0000-0000-000000000003:%' and title = 'Handball · Leo' and user_id <> '10000000-0000-0000-0000-0000000000c5'$q$, 2);
select test.expect_count('the coaches'' message only to Hugo',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:c0000000-0000-0000-0000-000000000005:%'$q$, 1);
select test.expect_count('… Hugo''s own news not to himself',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:c0000000-0000-0000-0000-000000000004:%' and user_id = '10000000-0000-0000-0000-0000000000c3'$q$, 0);
select test.expect_count('players open their messages page, staff theirs',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:c0000000-0000-0000-0000-000000000001:%'
     and url = case when user_id = '10000000-0000-0000-0000-0000000000c3' then '/messages' else '/athlete/messages' end$q$, 3);
select test.expect_count('the important one cannot be muted',
  $q$select 1 from app.push_outbox where dedupe_key like 'message:c0000000-0000-0000-0000-000000000002:%' and kind = 'important' and title = 'Important · TV Nachrichten · Anna'$q$, 3);

-- Read marks
set role authenticated;
select test.act_as('10000000-0000-0000-0000-0000000000c4');
select test.expect_rows('Pia has seen the club news',
  $q$insert into public.message_reads (message_id, person_id) values ('c0000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000004')$q$, 1);
select test.act_as('10000000-0000-0000-0000-0000000000c5');
select test.expect_error('Tom cannot mark Handball news',
  $q$insert into public.message_reads (message_id, person_id) values ('c0000000-0000-0000-0000-000000000003', 'cf000000-0000-0000-0000-000000000005')$q$, 'row-level security');
select test.expect_rows('Tom has seen the club news too',
  $q$insert into public.message_reads (message_id, person_id) values ('c0000000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000005')$q$, 1);
select test.expect_count('… and does not see who else did', $q$select 1 from public.message_reads where person_id <> 'cf000000-0000-0000-0000-000000000005'$q$, 0);
select test.act_as('10000000-0000-0000-0000-0000000000c1');
select test.expect_count('Anna sees who has read it', $q$select 1 from public.message_reads where message_id = 'c0000000-0000-0000-0000-000000000001'$q$, 2);
reset role;
select test.expect_count('reading drops the waiting push', $q$select 1 from app.push_outbox where dedupe_key = 'message:c0000000-0000-0000-0000-000000000001:10000000-0000-0000-0000-0000000000c4' and sent_at is not null$q$, 1);

-- Managing
set role authenticated;
select test.act_as('10000000-0000-0000-0000-0000000000c3');
select test.expect_rows('Hugo (may write) cannot delete Leo''s news', $q$delete from public.messages where id = 'c0000000-0000-0000-0000-000000000003'$q$, 0);
select test.expect_count('… nor see who read it', $q$select 1 from public.message_reads where message_id = 'c0000000-0000-0000-0000-000000000001'$q$, 0);
select test.act_as('10000000-0000-0000-0000-0000000000c4');
select test.expect_rows('Pia cannot delete news', $q$delete from public.messages where id = 'c0000000-0000-0000-0000-000000000001'$q$, 0);
select test.act_as('10000000-0000-0000-0000-0000000000c2');
select test.expect_rows('Leo cannot delete Anna''s club news', $q$delete from public.messages where id = 'c0000000-0000-0000-0000-000000000001'$q$, 0);
select test.expect_rows('… but Hugo''s in his department', $q$delete from public.messages where id = 'c0000000-0000-0000-0000-000000000004'$q$, 1);
select test.expect_rows('… and takes Hugo''s permission back',
  $q$delete from public.message_writers where person_id = 'cf000000-0000-0000-0000-000000000003'$q$, 1);
select test.act_as('10000000-0000-0000-0000-0000000000c3');
select test.expect_error('Hugo can no longer write to Handball',
  $q$insert into public.messages (club_id, department_ids, author_id, body)
     values ('cc000000-0000-0000-0000-000000000001', '{cd000000-0000-0000-0000-000000000001}', 'cf000000-0000-0000-0000-000000000003', 'x')$q$, 'row-level security');
select test.expect_rows('… his own team he still can',
  $q$insert into public.messages (club_id, team_ids, author_id, body)
     values ('cc000000-0000-0000-0000-000000000001', '{ce000000-0000-0000-0000-000000000001}', 'cf000000-0000-0000-0000-000000000003', 'Bring a ball.')$q$, 1);
select test.act_as('10000000-0000-0000-0000-0000000000c1');
select test.expect_rows('Anna deletes her club news', $q$delete from public.messages where id = 'c0000000-0000-0000-0000-000000000001'$q$, 1);
reset role;

select 'all message checks passed';
