-- Tests for 0017 (piece 12, settings). Runs after 01–06 and reuses their
-- clubs: the push club of 05 (Pia, Paul, Carla), Frida's club of 03 (Frida is
-- admin) and the club of 01 (Martin, Head Coach U16; Jonas, player U16).
-- Quiet hours are set relative to the current hour, so no result depends on
-- when the tests run.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Notification settings: own row only
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('Pia saves her settings (changes off, no quiet hours)',
  $q$insert into public.notification_settings (muted_kinds, quiet_from, quiet_to) values ('{changed}', null, null)$q$, 1);
select test.expect_count('… and reads them back', $q$select 1 from public.notification_settings where muted_kinds = '{changed}' and quiet_from is null$q$, 1);
select test.expect_error('the rating prompt cannot be switched off',
  $q$update public.notification_settings set muted_kinds = '{rate}'$q$, 'check');
select test.expect_error('quiet hours need a start and an end',
  $q$update public.notification_settings set quiet_from = 22$q$, 'check');
select test.expect_error('the same hour twice is no window',
  $q$update public.notification_settings set quiet_from = 7, quiet_to = 7$q$, 'check');
select test.expect_error('Pia cannot save settings for Paul',
  $q$insert into public.notification_settings (user_id) values ('10000000-0000-0000-0000-000000000072')$q$, 'row-level security');
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul does not see Pia''s settings', $q$select 1 from public.notification_settings$q$, 0);
select test.expect_rows('Paul cannot change Pia''s settings',
  $q$update public.notification_settings set muted_kinds = '{}' where user_id = '10000000-0000-0000-0000-000000000071'$q$, 0);
reset role;
set role anon;
select test.expect_error('anon reads nothing', $q$select 1 from public.notification_settings$q$, 'permission denied');
reset role;

-- ---------------------------------------------------------------------------
-- Quiet hours per person
-- ---------------------------------------------------------------------------

insert into public.notification_settings (user_id, quiet_from, quiet_to) values ('10000000-0000-0000-0000-000000000074', 23, 6);
select test.expect_count('Carla 23–06: 22:30 stays',
  $q$select 1 where app.push_quiet_until('2026-09-25 22:30+02', '10000000-0000-0000-0000-000000000074') = '2026-09-25 22:30+02'$q$, 1);
select test.expect_count('Carla 23–06: 23:30 moves to 06:00 the next day',
  $q$select 1 where app.push_quiet_until('2026-09-25 23:30+02', '10000000-0000-0000-0000-000000000074') = '2026-09-26 06:00+02'$q$, 1);
select test.expect_count('Carla 23–06: 05:00 moves to 06:00',
  $q$select 1 where app.push_quiet_until('2026-09-25 05:00+02', '10000000-0000-0000-0000-000000000074') = '2026-09-25 06:00+02'$q$, 1);
update public.notification_settings set quiet_from = 13, quiet_to = 15 where user_id = '10000000-0000-0000-0000-000000000074';
select test.expect_count('a window within the day (13–15): 14:10 moves to 15:00',
  $q$select 1 where app.push_quiet_until('2026-09-25 14:10+02', '10000000-0000-0000-0000-000000000074') = '2026-09-25 15:00+02'$q$, 1);
select test.expect_count('… 15:00 stays',
  $q$select 1 where app.push_quiet_until('2026-09-25 15:00+02', '10000000-0000-0000-0000-000000000074') = '2026-09-25 15:00+02'$q$, 1);
select test.expect_count('no quiet hours (Pia): 03:00 stays',
  $q$select 1 where app.push_quiet_until('2026-09-25 03:00+02', '10000000-0000-0000-0000-000000000071') = '2026-09-25 03:00+02'$q$, 1);

-- ---------------------------------------------------------------------------
-- Sending with the settings
-- ---------------------------------------------------------------------------

-- Paul is in his quiet hours right now: from this hour to two hours later.
insert into public.notification_settings (user_id, quiet_from, quiet_to)
select '10000000-0000-0000-0000-000000000072', h, (h + 2) % 24
from (select extract(hour from now() at time zone 'Europe/Berlin')::smallint as h) x;
-- Nothing else waiting in the push club.
update app.push_outbox set sent_at = now() where sent_at is null;
insert into public.sessions (id, club_id, department_id, team_id, title, session_type, starts_at, ends_at) values
  ('57000000-0000-0000-0000-000000000071', 'c7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001',
   'Soon', 'training', now() + interval '90 minutes', now() + interval '3 hours');
insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after) values
  ('10000000-0000-0000-0000-000000000071', 'changed', null, 's-pia-changed', 'Session changed', 'x', '/', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000071', 'cancelled', null, 's-pia-cancelled', 'Session cancelled', 'x', '/', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000072', 'cancelled', null, 's-paul-cancelled', 'Session cancelled', 'x', '/', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000072', 'rate', null, 's-paul-rate', 'How hard was it?', 'x', '/', now() - interval '1 minute'),
  ('10000000-0000-0000-0000-000000000072', 'reminder', '57000000-0000-0000-0000-000000000071', 's-paul-reminder', 'Are you in?', 'x', '/', now() - interval '1 minute');

set role service_role;
select public.push_take_due('test-secret-0123456789abcdef0123456789abcdef') as batch \gset
reset role;
select test.expect_count('handed out: Pia''s cancellation and Paul''s rating prompt (it ignores quiet hours)',
  'select 1 from jsonb_array_elements(' || quote_literal(:'batch') || '::jsonb -> ''items'') i where i -> ''payload'' ->> ''title'' in (''Session cancelled'', ''How hard was it?'')', 2);
select test.expect_count('… nothing else', 'select 1 from jsonb_array_elements(' || quote_literal(:'batch') || '::jsonb -> ''items'')', 2);
select test.expect_count('Pia switched changes off: that message is dropped',
  $q$select 1 from app.push_outbox where dedupe_key = 's-pia-changed' and sent_at is not null and claimed_at is null$q$, 1);
select test.expect_count('Paul''s cancellation waits for the end of his quiet hours',
  $q$select 1 from app.push_outbox where dedupe_key = 's-paul-cancelled' and sent_at is null and send_after > now()
     and send_after = app.push_quiet_until(now(), '10000000-0000-0000-0000-000000000072')$q$, 1);
select test.expect_count('Paul''s "Are you in?" would come too late after waiting: dropped',
  $q$select 1 from app.push_outbox where dedupe_key = 's-paul-reminder' and sent_at is not null and claimed_at is null$q$, 1);
update public.notification_settings set quiet_from = null, quiet_to = null where user_id = '10000000-0000-0000-0000-000000000072';
update app.push_outbox set send_after = now() - interval '1 minute' where dedupe_key = 's-paul-cancelled';
set role service_role;
select test.expect_count('quiet hours switched off: the waiting message goes out',
  $q$select 1 from jsonb_array_elements(public.push_take_due('test-secret-0123456789abcdef0123456789abcdef') -> 'items') i where i ->> 'endpoint' = 'https://push.test/paul'$q$, 1);
reset role;

-- ---------------------------------------------------------------------------
-- Club: rename, delete departments
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000051');
select test.expect_rows('Frida (admin) renames her club',
  $q$update public.clubs set name = 'TSV Neu' where id = test.id('club')$q$, 1);
select test.expect_error('… not to an empty name', $q$update public.clubs set name = '  ' where id = test.id('club')$q$, 'check');
select test.expect_error('only the name can be changed', $q$update public.clubs set city = 'Berlin' where id = test.id('club')$q$, 'permission denied');
select test.expect_rows('Frida creates an empty department',
  $q$insert into public.departments (id, club_id, name) values ('d1000000-0000-0000-0000-000000000077', test.id('club'), 'Chess')$q$, 1);
select test.expect_error('a department with teams cannot be deleted',
  $q$delete from public.departments where id = 'd1000000-0000-0000-0000-000000000002'$q$, 'without teams');
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin (other club) cannot rename it', $q$update public.clubs set name = 'X' where id = test.id('club')$q$, 0);
select test.expect_rows('… nor delete its department', $q$delete from public.departments where id = 'd1000000-0000-0000-0000-000000000077'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000051');
select test.expect_rows('Frida deletes the empty department', $q$delete from public.departments where id = 'd1000000-0000-0000-0000-000000000077'$q$, 1);
reset role;

-- ---------------------------------------------------------------------------
-- Leaving a team
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_rows('Jonas cannot remove his coach',
  $q$delete from public.memberships where person_id = 'a0000000-0000-0000-0000-000000000001'$q$, 0);
select test.expect_rows('Jonas leaves U16',
  $q$delete from public.memberships where person_id = 'a0000000-0000-0000-0000-000000000011' and team_id = '70000000-0000-0000-0000-000000000016' and role = 'athlete'$q$, 1);
select test.expect_count('… and no longer sees its sessions',
  $q$select 1 from public.sessions where team_id = '70000000-0000-0000-0000-000000000016'$q$, 0);
reset role;
select test.expect_count('… left its groups', $q$select 1 from public.player_group_members where person_id = 'a0000000-0000-0000-0000-000000000011'$q$, 0);
select test.expect_count('… his load history stays', $q$select 1 where exists (select 1 from public.load_entries where person_id = 'a0000000-0000-0000-0000-000000000011')$q$, 1);

select 'all settings checks passed';
