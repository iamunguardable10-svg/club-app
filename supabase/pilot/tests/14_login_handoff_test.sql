-- Tests for 0025 (staying signed in when the app is added to the home
-- screen). Uses the push club of 05: Pia and Paul.

\set ON_ERROR_STOP on
set client_min_messages = notice;

set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select test.expect_error('not signed in: no code', $q$select public.create_login_handoff()$q$, 'permission denied');
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select public.create_login_handoff() as first_code \gset
select public.create_login_handoff() as pia_code \gset
select test.expect_count('Pia gets a long random code', format($q$select 1 where %L ~ '^[0-9a-f]{64}$'$q$, :'pia_code'), 1);
select test.expect_error('… the app cannot trade it itself', format($q$select public.consume_login_handoff(%L)$q$, :'pia_code'), 'permission denied');
select test.expect_error('… nor read the codes', $q$select 1 from app.login_handoffs$q$, 'permission denied');
reset role;
select test.expect_count('a new code replaces her older one', format($q$select 1 from app.login_handoffs where code = %L$q$, :'first_code'), 0);

set role service_role;
select test.expect_count('the server trades it once for Pia''s account',
  format($q$select 1 where public.consume_login_handoff(%L) = 'push-pia@example.test'$q$, :'pia_code'), 1);
select test.expect_count('… not twice', format($q$select 1 where public.consume_login_handoff(%L) is null$q$, :'pia_code'), 1);
select test.expect_count('an unknown code: nothing', $q$select 1 where public.consume_login_handoff(repeat('a', 64)) is null$q$, 1);
reset role;

-- Too old: 10 minutes
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select public.create_login_handoff() as paul_code \gset
reset role;
update app.login_handoffs set created_at = now() - interval '11 minutes' where code = :'paul_code';
set role service_role;
select test.expect_count('a code older than 10 minutes does not work', format($q$select 1 where public.consume_login_handoff(%L) is null$q$, :'paul_code'), 1);
reset role;

select 'login handoff tests passed' as result;
