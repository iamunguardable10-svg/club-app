-- Tests for 0020 (piece 16: absences over a period). Runs after 01–09 and
-- uses the push club of 05: Carla (Head Coach U20, all rights), Tim (Helper,
-- here given attendance but not absence reasons), Pia, Paul, Pete (players).

\set ON_ERROR_STOP on
set client_min_messages = notice;

update public.coach_roles set permissions = '{viewRoster,viewAttendance}' where id = '7c000000-0000-0000-0000-000000000001';
select (now() at time zone 'Europe/Berlin')::date as today \gset

-- ---------------------------------------------------------------------------
-- Entering, reading, rights
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia enters "injured" from yesterday to the day after tomorrow',
  $q$insert into public.absences (id, person_id, from_date, to_date, created_by)
     values ('ab000000-0000-0000-0000-000000000071', 'a7000000-0000-0000-0000-000000000071', current_date - 1, current_date + 2, 'a7000000-0000-0000-0000-000000000071')$q$, 1);
select test.expect_rows('… with the kind and a note',
  $q$insert into public.absence_reasons (absence_id, kind, note) values ('ab000000-0000-0000-0000-000000000071', 'injured', 'Ankle')$q$, 1);
select test.expect_error('the end cannot be before the start',
  $q$insert into public.absences (person_id, from_date, to_date) values ('a7000000-0000-0000-0000-000000000071', current_date, current_date - 1)$q$, 'check');
select test.expect_error('at most a year',
  $q$insert into public.absences (person_id, from_date, to_date) values ('a7000000-0000-0000-0000-000000000071', current_date, current_date + 400)$q$, 'check');
select test.expect_error('Pia cannot enter one for Paul',
  $q$insert into public.absences (person_id, from_date, to_date) values ('a7000000-0000-0000-0000-000000000072', current_date, current_date)$q$, 'row-level security');
select test.expect_error('… nor sign as someone else',
  $q$insert into public.absences (person_id, from_date, to_date, created_by) values ('a7000000-0000-0000-0000-000000000071', current_date + 10, current_date + 11, 'a7000000-0000-0000-0000-000000000074')$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul does not see Pia''s absence', $q$select 1 from public.absences where person_id = 'a7000000-0000-0000-0000-000000000071'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000075');
select test.expect_count('Tim (attendance) sees that Pia is away',
  $q$select 1 from public.absences where person_id = 'a7000000-0000-0000-0000-000000000071'$q$, 1);
select test.expect_count('… but not why (health)', $q$select 1 from public.absence_reasons$q$, 0);
select test.expect_rows('Tim enters an absence for Paul (next week, holiday)',
  $q$insert into public.absences (id, person_id, from_date, to_date, created_by)
     values ('ab000000-0000-0000-0000-000000000072', 'a7000000-0000-0000-0000-000000000072', current_date + 7, current_date + 9, 'a7000000-0000-0000-0000-000000000075')$q$, 1);
select test.expect_rows('… and says why, even if he cannot read it back',
  $q$insert into public.absence_reasons (absence_id, kind) values ('ab000000-0000-0000-0000-000000000072', 'holiday')$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_count('Carla (all rights) sees both absences with their kind',
  $q$select 1 from public.absences a join public.absence_reasons r on r.absence_id = a.id where r.kind in ('injured', 'holiday')$q$, 2);
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul sees the absence Tim entered for him, and who entered it',
  $q$select 1 from public.absences where person_id = 'a7000000-0000-0000-0000-000000000072' and created_by = 'a7000000-0000-0000-0000-000000000075'$q$, 1);
select test.expect_rows('Paul shortens it (back a day early)',
  $q$update public.absences set to_date = current_date + 8 where id = 'ab000000-0000-0000-0000-000000000072'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('Otto (other club) sees nothing', $q$select 1 from public.absences$q$, 0);
reset role;

-- ---------------------------------------------------------------------------
-- Pushes: no reminder, no rating, counted as out
-- ---------------------------------------------------------------------------

insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at) values
  ('57000000-0000-0000-0000-0000000000a1', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Tomorrow', 'training', now() + interval '20 hours', now() + interval '21 hours'),
  ('57000000-0000-0000-0000-0000000000a2', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Soon', 'training', now() + interval '90 minutes', now() + interval '3 hours'),
  ('57000000-0000-0000-0000-0000000000a3', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Just over', 'training', now() - interval '2 hours', now() - interval '1 hour');
delete from app.push_outbox where session_id in ('57000000-0000-0000-0000-0000000000a1', '57000000-0000-0000-0000-0000000000a2', '57000000-0000-0000-0000-0000000000a3');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.test/pete', '10000000-0000-0000-0000-000000000073', 'k', 'a') on conflict do nothing;
select app.push_enqueue_due(now());

select test.expect_count('"Are you in?" goes to Paul and Pete, not to Pia (away)',
  $q$select 1 from app.push_outbox o join public.people p on p.user_id = o.user_id
     where o.kind = 'reminder' and o.session_id = '57000000-0000-0000-0000-0000000000a1'
     group by o.session_id having count(*) = 2 and bool_and(p.first_name <> 'Pia')$q$, 1);
select test.expect_count('"How hard was it?" not for Pia',
  $q$select 1 from app.push_outbox where kind = 'rate' and session_id = '57000000-0000-0000-0000-0000000000a3' and user_id = '10000000-0000-0000-0000-000000000071'$q$, 0);
select test.expect_count('… but for Paul', $q$select 1 from app.push_outbox where kind = 'rate' and session_id = '57000000-0000-0000-0000-0000000000a3' and user_id = '10000000-0000-0000-0000-000000000072'$q$, 1);
select test.expect_count('coach overview counts Pia as out, the others as no answer',
  $q$select 1 from app.push_outbox where kind = 'summary' and session_id = '57000000-0000-0000-0000-0000000000a2' and user_id = '10000000-0000-0000-0000-000000000074'
     and body = '0 in · 1 out · 2 no answer'$q$, 1);
select test.expect_count('Pia is away for tomorrow''s session', $q$select 1 where app.absent_for_session('a7000000-0000-0000-0000-000000000071', '57000000-0000-0000-0000-0000000000a1')$q$, 1);
insert into public.availability (session_id, person_id, status) values ('57000000-0000-0000-0000-0000000000a1', 'a7000000-0000-0000-0000-000000000071', 'in');
select test.expect_count('… unless she says "in" for it anyway', $q$select 1 where not app.absent_for_session('a7000000-0000-0000-0000-000000000071', '57000000-0000-0000-0000-0000000000a1')$q$, 1);

-- A new absence closes what is still waiting about its sessions. It starts
-- yesterday so "Just over" (an hour ago) is inside it also just after midnight.
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_rows('Paul says he was sick since yesterday, until tomorrow',
  'insert into public.absences (person_id, from_date, to_date) values (''a7000000-0000-0000-0000-000000000072'', ' || quote_literal(:'today') || '::date - 1, ' || quote_literal(:'today') || '::date + 1)', 1);
reset role;
select test.expect_count('… his waiting "Are you in?" and "How hard was it?" are closed',
  $q$select 1 from app.push_outbox where user_id = '10000000-0000-0000-0000-000000000072' and kind in ('reminder', 'rate')
     and session_id in ('57000000-0000-0000-0000-0000000000a1', '57000000-0000-0000-0000-0000000000a3') and sent_at is null$q$, 0);

select 'all absence checks passed';
