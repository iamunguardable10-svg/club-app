-- Tests for 0033: answering automatically or saying yes yourself. Uses the
-- push club of 05 (Carla, Head Coach U20; Pia and Paul, players with a
-- device; Pete, player without one).

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at) values
  ('57000000-0000-0000-0000-0000000000c1', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Answer me', 'training', now() + interval '3 days', now() + interval '3 days 90 minutes'),
  ('57000000-0000-0000-0000-0000000000c2', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Already over', 'training', now() - interval '3 hours', now() - interval '1 hour');

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia says yes or no herself from now on',
  $q$update public.people set rsvp_mode = 'manual' where id = 'a7000000-0000-0000-0000-000000000071'$q$, 1);
select test.expect_rows('… she cannot change it for Paul',
  $q$update public.people set rsvp_mode = 'manual' where id = 'a7000000-0000-0000-0000-000000000072'$q$, 0);
select test.expect_error('… nor set something else',
  $q$update public.people set rsvp_mode = 'sometimes' where id = 'a7000000-0000-0000-0000-000000000071'$q$, 'check');
select test.expect_error('a player cannot remind the open ones',
  $q$select public.remind_open_players('57000000-0000-0000-0000-0000000000c1')$q$, 'may not see attendance');
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_count('Carla (coach) sees how Pia answers',
  $q$select 1 from public.people where id = 'a7000000-0000-0000-0000-000000000071' and rsvp_mode = 'manual'$q$, 1);
select test.expect_count('Carla reminds the open ones: only Pia (Paul answers automatically, Pete has no device)',
  $q$select 1 where public.remind_open_players('57000000-0000-0000-0000-0000000000c1') = 1$q$, 1);
select test.expect_count('… a second time adds nobody',
  $q$select 1 where public.remind_open_players('57000000-0000-0000-0000-0000000000c1') = 0$q$, 1);
select test.expect_error('… not for a session that has started',
  $q$select public.remind_open_players('57000000-0000-0000-0000-0000000000c2')$q$, 'already started');
reset role;
select test.expect_count('the reminder is "Are you in?" for Pia, in her language later',
  $q$select 1 from app.push_outbox where dedupe_key = 'reminder-open:57000000-0000-0000-0000-0000000000c1:10000000-0000-0000-0000-000000000071'
     and kind = 'reminder' and text_key = 'push.reminder'$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia says yes',
  $q$insert into public.availability (session_id, person_id, status) values ('57000000-0000-0000-0000-0000000000c1', 'a7000000-0000-0000-0000-000000000071', 'in')$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_count('… now nobody is open',
  $q$select 1 where public.remind_open_players('57000000-0000-0000-0000-0000000000c1') = 0$q$, 1);
reset role;
update public.people set rsvp_mode = 'auto' where id = 'a7000000-0000-0000-0000-000000000071';
delete from public.sessions where id in ('57000000-0000-0000-0000-0000000000c1', '57000000-0000-0000-0000-0000000000c2');

select 'all rsvp checks passed';
