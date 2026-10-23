-- Meetings (0048): their own type with an online link, never rated. Local fixtures from 05.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;
insert into public.push_subscriptions(endpoint,user_id,p256dh,auth) values ('https://push.test/meeting-pia','10000000-0000-0000-0000-000000000071','k','a') on conflict do nothing;

select test.expect_rows('a meeting with a video link', $q$insert into public.sessions(id,club_id,department_id,team_id,title,session_type,starts_at,ends_at,online_url) values ('57000000-0000-0000-0000-0000000000f1','c7000000-0000-0000-0000-000000000001','d7000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','Meeting','meeting',now() - interval '2 hours',now() - interval '1 hour','https://meet.example.com/u16')$q$, 1);
select test.expect_error('… the link must be https', $q$update public.sessions set online_url = 'javascript:alert(1)' where id = '57000000-0000-0000-0000-0000000000f1'$q$, 'online_url');
select test.expect_error('… without spaces', $q$update public.sessions set online_url = 'https://a b' where id = '57000000-0000-0000-0000-0000000000f1'$q$, 'online_url');
select test.expect_rows('a weekly meeting', $q$insert into public.session_series(club_id,department_id,team_id,title,session_type,weekday,start_time,end_time) values ('c7000000-0000-0000-0000-000000000001','d7000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','Meeting','meeting',1,'18:00','19:00')$q$, 1);

select app.push_enqueue_due(now());
select test.expect_count('no "How hard was it?" for the meeting', $q$select 1 from app.push_outbox where kind = 'rate' and session_id = '57000000-0000-0000-0000-0000000000f1'$q$, 0);
select test.expect_error('no load entry for a meeting', $q$insert into public.load_entries(person_id, session_id, team_id, date, title, training_type, rpe, duration_minutes, load, source) values ('a7000000-0000-0000-0000-000000000071','57000000-0000-0000-0000-0000000000f1','77000000-0000-0000-0000-000000000001',current_date,'Meeting','team_training',3,60,180,'planned_session')$q$, 'not rated');

\echo 'meeting tests passed'
rollback;
