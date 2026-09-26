-- Tests for 0026 (piece 20: connect Apple Calendar). Uses the push club of
-- 05: Pia (player, U20). The Edge Function's calls are made as the service
-- role, as it does with the server key.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Connecting (the function, after Apple accepted the password)
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_error('the app cannot store a connection itself',
  $q$select public.apple_sync_connect('10000000-0000-0000-0000-000000000071', 'pia@icloud.com', 'abcd-efgh-ijkl-mnop', 'https://h/', null)$q$, 'permission denied');
select test.expect_count('not connected: no status', $q$select 1 where public.apple_calendar_status() is null$q$, 1);
reset role;

set role service_role;
select public.apple_sync_connect('10000000-0000-0000-0000-000000000071', 'pia@icloud.com', 'abcd-efgh-ijkl-mnop', 'https://p1-caldav.example/1/calendars/', 'https://p1-caldav.example/1/calendars/clubos/');
select test.expect_count('the function reads the password back for a sync',
  $q$select 1 where public.apple_sync_load('10000000-0000-0000-0000-000000000071') ->> 'password' = 'abcd-efgh-ijkl-mnop'$q$, 1);
select public.apple_sync_save('10000000-0000-0000-0000-000000000071', '{
  "club_os_url": "https://p1-caldav.example/1/calendars/clubos/",
  "calendars": [{"url": "https://p1-caldav.example/1/calendars/home/", "name": "Home", "color": "#FF2968"},
                {"url": "https://p1-caldav.example/1/calendars/work/", "name": "Work", "color": null}],
  "pushed": {"session-1@club-os": "h1"}
}'::jsonb);
reset role;
select test.expect_count('the password is in the Vault, not in the connection',
  $q$select 1 from app.calendar_connections c join vault.secrets s on s.id = c.secret_id where c.user_id = '10000000-0000-0000-0000-000000000071' and s.secret = 'abcd-efgh-ijkl-mnop'$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('Pia sees her connection, without the password',
  $q$select 1 where public.apple_calendar_status() ->> 'apple_id' = 'pia@icloud.com' and not (public.apple_calendar_status() ? 'password')$q$, 1);
select test.expect_error('… the connections table is closed to the app', $q$select 1 from app.calendar_connections$q$, 'permission denied');
select test.expect_count('… her two calendars, nothing imported yet', $q$select 1 from public.calendar_sources where not import$q$, 2);
select test.expect_rows('she lets Club OS read "Home"', $q$update public.calendar_sources set import = true where name = 'Home'$q$, 1);
select test.expect_error('… but cannot rename it or add one', $q$update public.calendar_sources set name = 'x'$q$, 'permission denied');
select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul sees none of Pia''s calendars', $q$select 1 from public.calendar_sources$q$, 0);
reset role;

-- A sync imports the chosen calendar only
set role service_role;
select test.expect_count('the sync knows which calendars to read',
  $q$select 1 where public.apple_sync_load('10000000-0000-0000-0000-000000000071') -> 'imports' = '["https://p1-caldav.example/1/calendars/home/"]'::jsonb$q$, 1);
select public.apple_sync_save('10000000-0000-0000-0000-000000000071', '{
  "imported": [
    {"url": "https://p1-caldav.example/1/calendars/home/", "events": [
      {"key": "dinner", "title": "Dinner", "startsAt": "2026-09-26T17:00:00Z", "endsAt": "2026-09-26T18:00:00Z", "allDay": false},
      {"key": "trip", "title": "Trip", "startsAt": "2026-09-27T00:00:00Z", "endsAt": "2026-09-28T00:00:00Z", "allDay": true}]},
    {"url": "https://p1-caldav.example/1/calendars/work/", "events": [
      {"key": "meeting", "title": "Meeting", "startsAt": "2026-09-26T08:00:00Z", "endsAt": "2026-09-26T09:00:00Z", "allDay": false}]}
  ]
}'::jsonb);
reset role;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('Pia sees her two private events, none from "Work"', $q$select 1 from public.private_events$q$, 2);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_count('her coach Carla sees none of them (not yet: piece 21b)', $q$select 1 from public.private_events$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_rows('she stops importing "Home"', $q$update public.calendar_sources set import = false where name = 'Home'$q$, 1);
select test.expect_count('… its events are gone at once', $q$select 1 from public.private_events$q$, 0);

-- An error is kept for her to see
reset role;
set role service_role;
select public.apple_sync_save('10000000-0000-0000-0000-000000000071', '{"error": "Apple did not accept the Apple ID or the app-specific password."}'::jsonb);
reset role;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('a failed sync shows its reason', $q$select 1 where public.apple_calendar_status() ->> 'status' = 'error' and public.apple_calendar_status() ->> 'last_error' like 'Apple did not accept%'$q$, 1);

-- Disconnect
select public.disconnect_apple_calendar();
select test.expect_count('disconnected: no status, no calendars', $q$select 1 where public.apple_calendar_status() is null and not exists (select 1 from public.calendar_sources)$q$, 1);
reset role;
select test.expect_count('… and the password is gone from the Vault', $q$select 1 from vault.secrets where name = 'apple-calendar-10000000-0000-0000-0000-000000000071'$q$, 0);

-- The 15-minute sync is guarded
set role service_role;
select test.expect_error('the due list needs the dispatch secret', $q$select * from public.apple_sync_due('wrong')$q$, 'Not allowed');
reset role;

-- Limits (0027): 5 connection attempts and 60 syncs per hour and account
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_error('the app cannot count calls itself',
  $q$select public.apple_calendar_allow('10000000-0000-0000-0000-000000000071', 'connect')$q$, 'permission denied');
reset role;
set role service_role;
select test.expect_count('five connection attempts go ahead',
  $q$select 1 from generate_series(1, 5) where public.apple_calendar_allow('10000000-0000-0000-0000-000000000071', 'connect')$q$, 5);
select test.expect_count('… the sixth within the hour does not',
  $q$select 1 where not public.apple_calendar_allow('10000000-0000-0000-0000-000000000071', 'connect')$q$, 1);
select test.expect_count('syncs are counted apart',
  $q$select 1 where public.apple_calendar_allow('10000000-0000-0000-0000-000000000071', 'sync')$q$, 1);
select test.expect_count('another account is not affected',
  $q$select 1 where public.apple_calendar_allow('10000000-0000-0000-0000-000000000072', 'connect')$q$, 1);
reset role;
update app.apple_calendar_calls set at = at - interval '61 minutes' where user_id = '10000000-0000-0000-0000-000000000071';
set role service_role;
select test.expect_count('an hour later it goes again',
  $q$select 1 where public.apple_calendar_allow('10000000-0000-0000-0000-000000000071', 'connect')$q$, 1);
reset role;

select 'apple calendar tests passed' as result;
