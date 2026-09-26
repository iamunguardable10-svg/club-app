-- Tests for 0013 (push notifications, piece 7). Own club, so the state left
-- by 01–04 does not matter. Time-based messages are queued with a fixed
-- "now" (tomorrow 12:00 club time) so the quiet hours never make a test
-- depend on when it runs.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- The sender runs as the service role; it uses the test helpers too.
grant usage on schema test to service_role;
grant execute on all functions in schema test to service_role;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000071', 'push-pia@example.test'),
  ('10000000-0000-0000-0000-000000000072', 'push-paul@example.test'),
  ('10000000-0000-0000-0000-000000000073', 'push-pete@example.test'),
  ('10000000-0000-0000-0000-000000000074', 'push-carla@example.test'),
  ('10000000-0000-0000-0000-000000000075', 'push-tim@example.test');

insert into public.clubs (id, name) values ('c7000000-0000-0000-0000-000000000001', 'SV Push');
insert into public.departments (id, club_id, name) values ('d7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'Handball');
insert into public.teams (id, club_id, department_id, name) values
  ('77000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'U20'),
  ('77000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', 'Minis');
update public.teams set features = '{}' where id = '77000000-0000-0000-0000-000000000002';
insert into public.coach_roles (id, team_id, name, permissions) values
  ('7c000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 'Helper', '{viewRoster}');

insert into public.people (id, club_id, user_id, first_name, last_name) values
  ('a7000000-0000-0000-0000-000000000071', 'c7000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000071', 'Pia', 'Player'),
  ('a7000000-0000-0000-0000-000000000072', 'c7000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000072', 'Paul', 'Player'),
  ('a7000000-0000-0000-0000-000000000073', 'c7000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000073', 'Pete', 'Player'),
  ('a7000000-0000-0000-0000-000000000074', 'c7000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000074', 'Carla', 'Coach'),
  ('a7000000-0000-0000-0000-000000000075', 'c7000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000075', 'Tim', 'Helper');

insert into public.memberships (person_id, team_id, role, coach_role_id, created_at)
select 'a7000000-0000-0000-0000-000000000074', '77000000-0000-0000-0000-000000000001', 'coach', r.id, now() - interval '30 days'
from public.coach_roles r where r.team_id = '77000000-0000-0000-0000-000000000001' and r.locked;
insert into public.memberships (person_id, team_id, role, coach_role_id)
select 'a7000000-0000-0000-0000-000000000074', '77000000-0000-0000-0000-000000000002', 'coach', r.id
from public.coach_roles r where r.team_id = '77000000-0000-0000-0000-000000000002' and r.locked;
insert into public.memberships (person_id, team_id, role, coach_role_id, created_at) values
  ('a7000000-0000-0000-0000-000000000075', '77000000-0000-0000-0000-000000000001', 'coach', '7c000000-0000-0000-0000-000000000001', now() - interval '30 days'),
  ('a7000000-0000-0000-0000-000000000071', '77000000-0000-0000-0000-000000000001', 'athlete', null, now() - interval '30 days'),
  ('a7000000-0000-0000-0000-000000000072', '77000000-0000-0000-0000-000000000001', 'athlete', null, now() - interval '30 days'),
  ('a7000000-0000-0000-0000-000000000073', '77000000-0000-0000-0000-000000000001', 'athlete', null, now() - interval '30 days'),
  ('a7000000-0000-0000-0000-000000000071', '77000000-0000-0000-0000-000000000002', 'athlete', null, now() - interval '30 days');
insert into public.player_groups (id, team_id, name) values ('67000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 'Backs');
insert into public.player_group_members (group_id, person_id) values ('67000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000072');

-- Devices: everyone but Pete switched notifications on.
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values
  ('https://push.test/pia', '10000000-0000-0000-0000-000000000071', 'k', 'a'),
  ('https://push.test/paul', '10000000-0000-0000-0000-000000000072', 'k', 'a'),
  ('https://push.test/carla', '10000000-0000-0000-0000-000000000074', 'k', 'a'),
  ('https://push.test/tim', '10000000-0000-0000-0000-000000000075', 'k', 'a');

-- Tomorrow 12:00 club time: the fixed "now" for queued messages.
select ((current_date + 1) + time '12:00') at time zone 'Europe/Berlin' as noon \gset

insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at, group_ids) values
  -- S1: the next morning, 20 h after "now"
  ('57000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Training', 'training', :'noon'::timestamptz + interval '20 hours', :'noon'::timestamptz + interval '21 hours 30 minutes', '{}'),
  -- S2: only the Backs group
  ('57000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Backs', 'training', :'noon'::timestamptz + interval '30 hours', :'noon'::timestamptz + interval '31 hours', '{67000000-0000-0000-0000-000000000001}'),
  -- S3: ended an hour before "now"
  ('57000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Gym', 's_and_c', :'noon'::timestamptz - interval '2 hours', :'noon'::timestamptz - interval '1 hour', '{}'),
  -- S4: starts 90 minutes after "now"
  ('57000000-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Training', 'training', :'noon'::timestamptz + interval '90 minutes', :'noon'::timestamptz + interval '3 hours', '{}'),
  -- S5: ends at 23:30 the same day
  ('57000000-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Late game', 'game', :'noon'::timestamptz + interval '10 hours', :'noon'::timestamptz + interval '11 hours 30 minutes', '{}');
insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at) values
  ('57000000-0000-0000-0000-000000000006', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000002',
   'Minis fun', 'training', :'noon'::timestamptz - interval '2 hours', :'noon'::timestamptz - interval '1 hour');

create function test.outbox(p_kind text, p_session text) returns bigint language sql as $$
  select count(*) from app.push_outbox where kind = p_kind and session_id = p_session::uuid and sent_at is null
$$;

-- ---------------------------------------------------------------------------
-- Quiet hours
-- ---------------------------------------------------------------------------

select test.expect_count('quiet hours: 23:30 moves to 07:00 the next day',
  $q$select 1 where app.push_quiet_until('2026-09-25 23:30+02', '10000000-0000-0000-0000-000000000071') = '2026-09-26 07:00+02'$q$, 1);
select test.expect_count('quiet hours: 05:00 moves to 07:00 the same day',
  $q$select 1 where app.push_quiet_until('2026-09-25 05:00+02', '10000000-0000-0000-0000-000000000071') = '2026-09-25 07:00+02'$q$, 1);
select test.expect_count('quiet hours: 12:00 stays',
  $q$select 1 where app.push_quiet_until('2026-09-25 12:00+02', '10000000-0000-0000-0000-000000000071') = '2026-09-25 12:00+02'$q$, 1);
select test.expect_count('quiet hours: 22:00 in winter moves to 07:00 (CET)',
  $q$select 1 where app.push_quiet_until('2026-12-10 22:00+01', '10000000-0000-0000-0000-000000000071') = '2026-12-11 07:00+01'$q$, 1);

-- ---------------------------------------------------------------------------
-- Changed and cancelled
-- ---------------------------------------------------------------------------

update public.sessions set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = '57000000-0000-0000-0000-000000000001';
select test.expect_count('moved: Pia and Paul are told (not Pete without a device, not the coaches)',
  $q$select 1 from app.push_outbox where kind = 'changed' and session_id = '57000000-0000-0000-0000-000000000001'$q$, 2);
select test.expect_count('… bundled: sent at the earliest 2 minutes later',
  $q$select 1 from app.push_outbox where kind = 'changed' and send_after >= now() + interval '1 minute'$q$, 2);
update public.sessions set starts_at = starts_at + interval '30 minutes', ends_at = ends_at + interval '30 minutes' where id = '57000000-0000-0000-0000-000000000001';
select test.expect_count('moved again: still one message each, with the new time',
  'select 1 from app.push_outbox where kind = ''changed'' and body like ''%'' || to_char((' || quote_literal(:'noon') || '::timestamptz + interval ''21 hours 30 minutes'') at time zone ''Europe/Berlin'', ''HH24:MI'') || ''%''', 2);
select test.expect_count('… with the text key and values for other languages (0031)',
  $q$select 1 from app.push_outbox where kind = 'changed' and text_key = 'push.changed' and text_params ->> 'team' = 'U20' and text_params ? 'at'$q$, 2);
update public.sessions set title = 'Training (ball)' where id = '57000000-0000-0000-0000-000000000001';
select test.expect_count('a new title alone sends nothing new', $q$select 1 from app.push_outbox where kind = 'changed'$q$, 2);
update public.sessions set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = '57000000-0000-0000-0000-000000000002';
select test.expect_count('group session moved: only Paul (Backs)', $q$select 1 where test.outbox('changed', '57000000-0000-0000-0000-000000000002') = 1$q$, 1);
delete from public.sessions where id = '57000000-0000-0000-0000-000000000002';
select test.expect_count('cancelled: Paul is told', $q$select 1 where test.outbox('cancelled', '57000000-0000-0000-0000-000000000002') = 1$q$, 1);
select test.expect_count('… and the pending change message is dropped', $q$select 1 where test.outbox('changed', '57000000-0000-0000-0000-000000000002') = 0$q$, 1);

-- ---------------------------------------------------------------------------
-- Reminders, coach overview, rating (fixed "now")
-- ---------------------------------------------------------------------------

insert into public.availability (session_id, person_id, status) values
  ('57000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000071', 'in'),
  ('57000000-0000-0000-0000-000000000004', 'a7000000-0000-0000-0000-000000000071', 'in'),
  ('57000000-0000-0000-0000-000000000004', 'a7000000-0000-0000-0000-000000000072', 'out');
insert into public.load_entries (person_id, session_id, team_id, date, title, training_type, rpe, duration_minutes, load, source) values
  ('a7000000-0000-0000-0000-000000000072', '57000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000001', current_date + 1, 'Gym', 'strength', 6, 60, 360, 'planned_session');

select app.push_enqueue_due(:'noon'::timestamptz);
select test.expect_count('reminder: only Paul (Pia answered, Pete has no device)',
  $q$select 1 from app.push_outbox o join public.people p on p.user_id = o.user_id where o.kind = 'reminder' and o.session_id = '57000000-0000-0000-0000-000000000001' and p.first_name = 'Paul'$q$, 1);
select test.expect_count('… and nobody else', $q$select 1 where test.outbox('reminder', '57000000-0000-0000-0000-000000000001') = 1$q$, 1);
select test.expect_count('no reminder 90 minutes before (too late)', $q$select 1 where test.outbox('reminder', '57000000-0000-0000-0000-000000000004') = 0$q$, 1);
select test.expect_count('coach overview: Carla (Head Coach), not Tim (no attendance right)',
  $q$select 1 from app.push_outbox o where o.kind = 'summary' and o.user_id = '10000000-0000-0000-0000-000000000074'$q$, 1);
select test.expect_count('… one message only', $q$select 1 where test.outbox('summary', '57000000-0000-0000-0000-000000000004') = 1$q$, 1);
select test.expect_count('… with the counts',
  $q$select 1 from app.push_outbox where kind = 'summary' and body = '1 in · 1 out · 1 no answer'$q$, 1);
select test.expect_count('… and the counts as values for other languages',
  $q$select 1 from app.push_outbox where kind = 'summary' and text_key = 'push.summary' and text_params ->> 'in' = '1' and text_params ->> 'open' = '1'$q$, 1);
select test.expect_count('rating: Pia (Paul already rated, Pete has no device)',
  $q$select 1 from app.push_outbox where kind = 'rate' and session_id = '57000000-0000-0000-0000-000000000003' and user_id = '10000000-0000-0000-0000-000000000071'$q$, 1);
select test.expect_count('… nobody else for that session', $q$select 1 where test.outbox('rate', '57000000-0000-0000-0000-000000000003') = 1$q$, 1);
select test.expect_count('no rating for a team without load (Minis)', $q$select 1 where test.outbox('rate', '57000000-0000-0000-0000-000000000006') = 0$q$, 1);
select app.push_enqueue_due(:'noon'::timestamptz);
select test.expect_count('reminders for the evening game too (Pia and Paul, no answer yet)', $q$select 1 where test.outbox('reminder', '57000000-0000-0000-0000-000000000005') = 2$q$, 1);
select test.expect_count('queuing again adds nothing', $q$select 1 from app.push_outbox where kind in ('reminder', 'summary', 'rate')$q$, 5);

-- 23:35: the late game is over; the rating goes out now, a reminder waits.
select app.push_enqueue_due(:'noon'::timestamptz + interval '11 hours 35 minutes');
select test.expect_count('quiet hours: rating after the late game goes out right away',
  'select 1 from app.push_outbox where kind = ''rate'' and session_id = ''57000000-0000-0000-0000-000000000005'' and send_after = ' || quote_literal(:'noon') || '::timestamptz + interval ''11 hours 35 minutes''', 2);

-- ---------------------------------------------------------------------------
-- Sending: secret, claiming, results
-- ---------------------------------------------------------------------------

insert into app.push_config (key, value) values
  ('dispatch_secret', 'test-secret-0123456789abcdef0123456789abcdef'),
  ('vapid_public_key', 'BPUBLIC'), ('vapid_private_key', 'PRIVATE'), ('vapid_subject', 'https://club.test'),
  ('function_url', 'https://functions.test/push-dispatch');

set role anon;
select test.expect_count('anyone: the public key', $q$select 1 where public.push_public_key() = 'BPUBLIC'$q$, 1);
select test.expect_error('anon cannot take messages at all', $q$select public.push_take_due('test-secret-0123456789abcdef0123456789abcdef')$q$, 'permission denied');
reset role;
set role service_role;
select test.expect_error('wrong secret: nothing is handed out', $q$select public.push_take_due('wrong-secret-0123456789abcdef0123456789')$q$, 'Not allowed');
select test.expect_error('no secret: nothing is handed out', $q$select public.push_take_due(null)$q$, 'Not allowed');
reset role;
set role anon;
select test.expect_error('anon cannot read the outbox', $q$select 1 from app.push_outbox$q$, 'permission denied');
reset role;

-- Change and cancel messages came from real-time triggers; whether they are
-- due now depends on the clock (quiet hours), so park them for this part.
update app.push_outbox set send_after = now() + interval '1 day' where kind in ('changed', 'cancelled');
-- Make the rating (Pia) and the reminder (Paul) due now; Paul then answers.
update app.push_outbox set send_after = now() - interval '1 minute' where kind in ('rate', 'reminder') and session_id in ('57000000-0000-0000-0000-000000000003', '57000000-0000-0000-0000-000000000001');
insert into public.availability (session_id, person_id, status) values ('57000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000072', 'late');

-- Pia uses the app in German (the app keeps the language with the account).
update auth.users set raw_user_meta_data = '{"locale": "de"}' where id = '10000000-0000-0000-0000-000000000071';
set role service_role;
select public.push_take_due('test-secret-0123456789abcdef0123456789abcdef') as batch \gset
reset role;
select test.expect_count('handed out: the rating for Pia, not the reminder Paul answered meanwhile',
  'select 1 from jsonb_array_elements(' || quote_literal(:'batch') || '::jsonb -> ''items'') i where i ->> ''endpoint'' = ''https://push.test/pia'' and i -> ''payload'' ->> ''title'' = ''How hard was it?''', 1);
select test.expect_count('… with her language, the text key and the values (0031)',
  'select 1 from jsonb_array_elements(' || quote_literal(:'batch') || '::jsonb -> ''items'') i where i ->> ''locale'' = ''de'' and i ->> ''text_key'' = ''push.rate'' and i -> ''text_params'' ? ''team''', 1);
select test.expect_count('… one item in total', 'select 1 from jsonb_array_elements(' || quote_literal(:'batch') || '::jsonb -> ''items'')', 1);
select test.expect_count('… with the keys to sign it', 'select 1 where (' || quote_literal(:'batch') || '::jsonb -> ''vapid'' ->> ''private_key'') = ''PRIVATE''', 1);
select test.expect_count('… the answered reminder is closed', $q$select 1 where test.outbox('reminder', '57000000-0000-0000-0000-000000000001') = 0$q$, 1);
set role service_role;
select test.expect_count('claimed: not handed out twice',
  $q$select 1 from jsonb_array_elements(public.push_take_due('test-secret-0123456789abcdef0123456789abcdef') -> 'items')$q$, 0);
reset role;

-- A second device for Pia; one delivers, one is gone.
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.test/pia-old', '10000000-0000-0000-0000-000000000071', 'k', 'a');
select id as rate_id from app.push_outbox where kind = 'rate' and session_id = '57000000-0000-0000-0000-000000000003' \gset
set role service_role;
select public.push_report('test-secret-0123456789abcdef0123456789abcdef',
  jsonb_build_array(
    jsonb_build_object('outbox_id', :'rate_id', 'endpoint', 'https://push.test/pia', 'status', 201),
    jsonb_build_object('outbox_id', :'rate_id', 'endpoint', 'https://push.test/pia-old', 'status', 410)));
reset role;
select test.expect_count('report: delivered, so the message is done', 'select 1 from app.push_outbox where id = ' || quote_literal(:'rate_id') || ' and sent_at is not null', 1);
select test.expect_count('… and the gone device is removed', $q$select 1 from public.push_subscriptions where endpoint = 'https://push.test/pia-old'$q$, 0);

-- A temporary failure is retried, then given up after 3 attempts.
update app.push_outbox set send_after = now() - interval '1 minute' where kind = 'summary';
select id as summary_id from app.push_outbox where kind = 'summary' \gset
set role service_role;
select public.push_take_due('test-secret-0123456789abcdef0123456789abcdef');
select public.push_report('test-secret-0123456789abcdef0123456789abcdef',
  jsonb_build_array(jsonb_build_object('outbox_id', :'summary_id', 'endpoint', 'https://push.test/carla', 'status', 503)));
reset role;
select test.expect_count('503: tried again later', 'select 1 from app.push_outbox where id = ' || quote_literal(:'summary_id') || ' and sent_at is null and attempts = 1 and claimed_at is null', 1);
update app.push_outbox set attempts = 2 where id = :'summary_id';
set role service_role;
select public.push_take_due('test-secret-0123456789abcdef0123456789abcdef');
select public.push_report('test-secret-0123456789abcdef0123456789abcdef',
  jsonb_build_array(jsonb_build_object('outbox_id', :'summary_id', 'endpoint', 'https://push.test/carla', 'status', 503)));
reset role;
select test.expect_count('… given up after the third attempt', 'select 1 from app.push_outbox where id = ' || quote_literal(:'summary_id') || ' and sent_at is not null', 1);

-- ---------------------------------------------------------------------------
-- The minute tick
-- ---------------------------------------------------------------------------

-- The tick queues by the real clock; without devices it queues nothing new,
-- so what it sees is only what this part sets up.
create temp table saved_devices as select * from public.push_subscriptions;
delete from public.push_subscriptions;
delete from net.calls;
update app.push_outbox set sent_at = now() where sent_at is null and send_after <= now();
select app.push_tick();
select test.expect_count('tick: nothing due, the sender is not woken', 'select 1 from net.calls', 0);
update app.push_outbox set send_after = now() - interval '1 minute', sent_at = null, claimed_at = null where kind = 'cancelled';
select app.push_tick();
select test.expect_count('tick: something due, the sender is woken with the secret',
  $q$select 1 from net.calls where url = 'https://functions.test/push-dispatch' and headers ->> 'x-dispatch-secret' = 'test-secret-0123456789abcdef0123456789abcdef'$q$, 1);
insert into public.push_subscriptions select * from saved_devices;

-- ---------------------------------------------------------------------------
-- Devices from the app
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000073');
select public.save_push_subscription('https://push.test/pete', 'k2', 'a2');
select test.expect_count('Pete switches notifications on for his phone', $q$select 1 from public.push_subscriptions$q$, 1);
select test.expect_error('only https push addresses', $q$select public.save_push_subscription('http://evil.test/x', 'k', 'a')$q$, 'not a valid');
select test.expect_error('the table itself is not writable', $q$insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.test/x', '10000000-0000-0000-0000-000000000071', 'k', 'a')$q$, 'permission denied');
select test.expect_error('the outbox is not readable', $q$select 1 from app.push_outbox$q$, 'permission denied');
select test.expect_error('queuing is not callable from the app', $q$select app.push_enqueue_due()$q$, 'permission denied');
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul sees only his own device', $q$select 1 from public.push_subscriptions$q$, 1);
select public.save_push_subscription('https://push.test/pete', 'k3', 'a3');
select test.expect_count('the same phone, now used by Paul, belongs to Paul', $q$select 1 from public.push_subscriptions$q$, 2);
select public.delete_push_subscription('https://push.test/tim');
select public.delete_push_subscription('https://push.test/pete');
select test.act_as('10000000-0000-0000-0000-000000000075');
select test.expect_count('Paul cannot switch off Tim''s device', $q$select 1 from public.push_subscriptions$q$, 1);
reset role;
set role anon;
select test.expect_error('not signed in: cannot save a device', $q$select public.save_push_subscription('https://push.test/y', 'k', 'a')$q$, 'Not signed in|permission denied');
reset role;
select test.expect_count('Paul switched the phone off again', $q$select 1 from public.push_subscriptions where endpoint = 'https://push.test/pete'$q$, 0);

\echo 'all push checks passed'
