-- Tests for 0021 (piece 15: squads for games). Runs after 01–10 and uses
-- the push club of 05: Carla (Head Coach U20, all rights), Tim (roster and
-- attendance since 10, no editSessions), Pia, Paul, Pete (players, devices).

\set ON_ERROR_STOP on
set client_min_messages = notice;

delete from public.absences where person_id in ('a7000000-0000-0000-0000-000000000071', 'a7000000-0000-0000-0000-000000000072', 'a7000000-0000-0000-0000-000000000073');
insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at, opponent, meet_minutes_before, meet_point) values
  ('57000000-0000-0000-0000-0000000000b1', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Game', 'game', now() + interval '20 hours', now() + interval '22 hours', 'TSV Neustadt', 60, 'Car park'),
  ('57000000-0000-0000-0000-0000000000b2', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Team training', 'training', now() + interval '2 days', now() + interval '2 days 90 minutes', null, null, null);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla picks Pia (squad), Paul (reserve), Pete (not selected)',
  $q$insert into public.squad_entries (session_id, person_id, status, set_by) values
     ('57000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-000000000071', 'squad', 'a7000000-0000-0000-0000-000000000074'),
     ('57000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-000000000072', 'reserve', 'a7000000-0000-0000-0000-000000000074'),
     ('57000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-000000000073', 'not_selected', 'a7000000-0000-0000-0000-000000000074')$q$, 3);
select test.expect_error('no squad for a training',
  $q$insert into public.squad_entries (session_id, person_id, status) values ('57000000-0000-0000-0000-0000000000b2', 'a7000000-0000-0000-0000-000000000071', 'squad')$q$, 'only be picked for a game');
select test.expect_error('only players of the team',
  $q$insert into public.squad_entries (session_id, person_id, status) values ('57000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-000000000074', 'squad')$q$, 'players of the team');
select test.act_as('10000000-0000-0000-0000-000000000075');
select test.expect_count('Tim (attendance) sees the picks', $q$select 1 from public.squad_entries where session_id = '57000000-0000-0000-0000-0000000000b1'$q$, 3);
select test.expect_error('… but cannot pick (no editSessions)',
  $q$insert into public.squad_entries (session_id, person_id, status) values ('57000000-0000-0000-0000-0000000000b1', 'a7000000-0000-0000-0000-000000000071', 'reserve')$q$, 'row-level security|duplicate');
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('Pia sees nothing before it is published', $q$select 1 from public.squad_entries$q$, 0);
reset role;
select test.expect_count('… and nothing is sent yet', $q$select 1 from app.push_outbox where kind = 'squad'$q$, 0);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla publishes the squad',
  $q$update public.sessions set squad_published_at = now() where id = '57000000-0000-0000-0000-0000000000b1'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('Pia now sees her own status, not the others''', $q$select 1 from public.squad_entries where status = 'squad'$q$, 1);
select test.expect_count('… only hers', $q$select 1 from public.squad_entries$q$, 1);
reset role;
select test.expect_count('push: Pia "You''re in the squad" with meeting',
  $q$select 1 from app.push_outbox where kind = 'squad' and user_id = '10000000-0000-0000-0000-000000000071' and title = 'You''re in the squad'
     and body like 'Game vs TSV Neustadt · % · Meet __:__ at Car park'$q$, 1);
select test.expect_count('push: Paul "You''re a reserve"', $q$select 1 from app.push_outbox where kind = 'squad' and user_id = '10000000-0000-0000-0000-000000000072' and title = 'You''re a reserve'$q$, 1);
select test.expect_count('push: Pete "Not in the squad this time", without the meeting',
  $q$select 1 from app.push_outbox where kind = 'squad' and user_id = '10000000-0000-0000-0000-000000000073' and title = 'Not in the squad this time' and body not like '%Meet%'$q$, 1);

update app.push_outbox set sent_at = now() where kind = 'squad';
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla moves Paul into the squad',
  $q$update public.squad_entries set status = 'squad' where session_id = '57000000-0000-0000-0000-0000000000b1' and person_id = 'a7000000-0000-0000-0000-000000000072'$q$, 1);
select test.expect_rows('… and publishes again',
  $q$update public.sessions set squad_published_at = now() + interval '1 second' where id = '57000000-0000-0000-0000-0000000000b1'$q$, 1);
reset role;
select test.expect_count('only Paul is told again', $q$select 1 from app.push_outbox where kind = 'squad' and sent_at is null$q$, 1);
select test.expect_count('… that he is in the squad now', $q$select 1 from app.push_outbox where kind = 'squad' and sent_at is null and user_id = '10000000-0000-0000-0000-000000000072' and title = 'You''re in the squad'$q$, 1);

-- Not selected: no "Are you in?", not counted
delete from app.push_outbox where session_id = '57000000-0000-0000-0000-0000000000b1' and kind in ('reminder', 'summary');
select app.push_enqueue_due(now());
select test.expect_count('"Are you in?" for Pia and Paul, not for Pete (not selected)',
  $q$select 1 from app.push_outbox where kind = 'reminder' and session_id = '57000000-0000-0000-0000-0000000000b1'
     and user_id in ('10000000-0000-0000-0000-000000000071', '10000000-0000-0000-0000-000000000072')$q$, 2);
select test.expect_count('… none for Pete', $q$select 1 from app.push_outbox where kind = 'reminder' and session_id = '57000000-0000-0000-0000-0000000000b1' and user_id = '10000000-0000-0000-0000-000000000073'$q$, 0);
select test.expect_count('squad_status is null for a game without a published squad',
  $q$select 1 where app.squad_status('a7000000-0000-0000-0000-000000000071', '57000000-0000-0000-0000-0000000000b2') is null$q$, 1);

select 'all squad checks passed';
