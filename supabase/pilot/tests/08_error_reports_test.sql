-- Tests for 0018 (piece 13: errors and problem reports). Runs after 01–07;
-- Martin (01) is made operator, Jonas (01) is a player, Pia (05) has a device.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Martin is the operator and has a device.
insert into app.operators (user_id) values ('10000000-0000-0000-0000-000000000001');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
values ('https://push.test/martin', '10000000-0000-0000-0000-000000000001', 'k', 'a') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Errors from the app
-- ---------------------------------------------------------------------------

set role anon;
select public.report_error('crash', 'TypeError: x is undefined', 'at foo (app.js:1:2)', '/join?code=SECRET123', null, 'demo', 'abc1234', 'iPhone · Safari');
select test.expect_error('anon cannot read reports', $q$select 1 from app.error_reports$q$, 'permission denied');
select test.expect_error('anon cannot list reports', $q$select * from public.list_error_reports()$q$, 'permission denied');
reset role;
select test.expect_count('an error from the demo club (not signed in) is stored, without the query string',
  $q$select 1 from app.error_reports where kind = 'crash' and page = '/join' and user_id is null and mode = 'demo' and count = 1$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select public.report_error('rejected', 'Not saved: new row violates check constraint. Failing row contains (a0000000-0000-0000-0000-000000000011, 9, 120, knee pain).', null, '/athlete/load', 'athlete', 'server', 'abc1234', 'Android · Chrome');
select public.report_error('rejected', 'Not saved: new row violates check constraint. Failing row contains (a0000000-0000-0000-0000-000000000012, 7, 90, back).', null, '/athlete/load', 'athlete', 'server', 'abc1235', 'Android · Chrome');
select public.report_error('error', 'Mail to jonas@example.test failed', null, '/settings', 'athlete', 'server', 'abc1234', 'x');
select public.report_error('nonsense-kind', 'Something odd', null, '/x', 'hacker', 'weird', null, null);
select test.expect_error('Jonas cannot read the table', $q$select 1 from app.error_reports$q$, 'permission denied');
select test.expect_error('Jonas (no operator) cannot list', $q$select * from public.list_error_reports()$q$, 'Only operators');
select test.expect_error('… nor resolve', $q$select public.resolve_error_report(gen_random_uuid(), true)$q$, 'Only operators');
select test.expect_count('Jonas is no operator', $q$select 1 where not public.am_i_operator()$q$, 1);
reset role;
select test.expect_count('the same refused save twice is one row, counted twice, with the newer version',
  $q$select 1 from app.error_reports where kind = 'rejected' and count = 2 and app_version = 'abc1235'$q$, 1);
select test.expect_count('… and what the database quoted from the row is gone',
  $q$select 1 from app.error_reports where kind = 'rejected' and message like '%Failing row contains (…).%' and message not like '%knee%' and message not like '%back%'$q$, 1);
select test.expect_count('e-mail addresses are removed', $q$select 1 from app.error_reports where message = 'Mail to (email) failed'$q$, 1);
select test.expect_count('unknown kind, role and mode are not taken over',
  $q$select 1 from app.error_reports where message = 'Something odd' and kind = 'error' and role is null and mode is null$q$, 1);

-- ---------------------------------------------------------------------------
-- Problem reports
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_error('an empty problem report is refused', $q$select public.report_problem('  ')$q$, 'few words');
select public.report_problem('The calendar shows the training on the wrong day.', '/athlete/calendar?x=1', 'athlete', 'server', 'abc1234', 'iPhone · Safari');
reset role;
select test.expect_count('Jonas'' problem report is stored with who sent it',
  $q$select 1 from app.error_reports where kind = 'problem' and user_id = '10000000-0000-0000-0000-000000000011' and page = '/athlete/calendar' and detail like 'The calendar%'$q$, 1);
select test.expect_count('the operator gets a push "Problem reported by Jonas Kern"',
  $q$select 1 from app.push_outbox where kind = 'report' and user_id = '10000000-0000-0000-0000-000000000001' and title = 'Problem reported by Jonas Kern' and url = '/reports'$q$, 1);
insert into app.error_reports (kind, fingerprint, message, user_id)
select 'problem', 'problem:' || gen_random_uuid(), 'x', '10000000-0000-0000-0000-000000000011' from generate_series(1, 9);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_error('at most 10 problem reports a day per account', $q$select public.report_problem('one more')$q$, 'many reports today');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
select public.report_problem('Demo: the button does nothing', '/coach/today', 'coach', 'demo', null, null);
reset role;
select test.expect_count('a problem report from the demo club works without an account',
  $q$select 1 from app.error_reports where kind = 'problem' and user_id is null and mode = 'demo'$q$, 1);

-- ---------------------------------------------------------------------------
-- The operator
-- ---------------------------------------------------------------------------

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_count('Martin is operator', $q$select 1 where public.am_i_operator()$q$, 1);
select test.expect_count('he sees all open reports', $q$select 1 from public.list_error_reports()$q$, 15);
select test.expect_count('problem reports come first, with the reporter''s name',
  $q$select 1 from (select * from public.list_error_reports() limit 1) r where r.kind = 'problem'$q$, 1);
select test.expect_count('… Jonas'' report names him',
  $q$select 1 from public.list_error_reports() where kind = 'problem' and reporter = 'Jonas Kern' and message like 'The calendar%'$q$, 1);
select id as rejected_id from public.list_error_reports() where kind = 'rejected' \gset
select public.resolve_error_report(:'rejected_id', true);
select test.expect_count('resolved: gone from the open list', $q$select 1 from public.list_error_reports() where kind = 'rejected'$q$, 0);
select test.expect_count('… still there with resolved ones', $q$select 1 from public.list_error_reports(true) where kind = 'rejected' and resolved_at is not null$q$, 1);
reset role;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000011');
select public.report_error('rejected', 'Not saved: new row violates check constraint. Failing row contains (1, 2).', null, '/athlete/load', 'athlete', 'server', 'abc1236', null);
reset role;
select test.expect_count('the resolved error comes back: a new open row, the old one stays resolved',
  $q$select 1 from app.error_reports where kind = 'rejected' group by fingerprint having count(*) = 2 and count(*) filter (where resolved_at is null) = 1$q$, 1);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select public.resolve_error_report(:'rejected_id', false);
reset role;
select test.expect_count('reopening the old one while a new one is open does nothing',
  'select 1 from app.error_reports where id = ' || quote_literal(:'rejected_id') || ' and resolved_at is not null', 1);

-- ---------------------------------------------------------------------------
-- Morning summary and the server
-- ---------------------------------------------------------------------------

select app.error_digest();
select test.expect_count('summary: one push to the operator, counting the open errors',
  $q$select 1 from app.push_outbox where kind = 'digest' and user_id = '10000000-0000-0000-0000-000000000001' and title like 'Club OS: % errors in the last 24 h'$q$, 1);
select app.error_digest();
select test.expect_count('… only once a day', $q$select 1 from app.push_outbox where kind = 'digest'$q$, 1);
update app.error_reports set resolved_at = now() where kind <> 'problem';
delete from app.push_outbox where kind = 'digest';
select app.error_digest();
select test.expect_count('a quiet day sends nothing', $q$select 1 from app.push_outbox where kind = 'digest'$q$, 0);

set role service_role;
select public.report_error('server', 'push-dispatch: VAPID keys are not set up.', null, 'push-dispatch');
reset role;
select test.expect_count('the Edge Function can report too', $q$select 1 from app.error_reports where kind = 'server' and page = 'push-dispatch'$q$, 1);

select 'all error report checks passed';
