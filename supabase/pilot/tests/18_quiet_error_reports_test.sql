-- Tests for 0030: "Script error." without detail is not stored.

\set ON_ERROR_STOP on
set client_min_messages = notice;

set role anon;
select public.report_error('error', 'Script error.', null, '/club', 'coach', 'server', 'v1', 'iPhone · Safari');
select public.report_error('error', 'Script error.', '', '/club', 'coach', 'server', 'v1', 'iPhone · Safari');
select public.report_error('error', 'Script error.', 'at foo (app.js:1)', '/club', 'coach', 'server', 'v1', 'iPhone · Safari');
reset role;

select test.expect_count('"Script error." alone is dropped',
  $q$select 1 from app.error_reports where message = 'Script error.' and detail is null$q$, 0);
select test.expect_count('… with a stack it is kept',
  $q$select 1 from app.error_reports where message = 'Script error.' and detail is not null$q$, 1);

select 'all quiet error report checks passed' as result;
