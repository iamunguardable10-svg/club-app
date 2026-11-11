-- E-mail first (0055): whether an address has an account, before signing in.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;

insert into auth.users (id, email, email_confirmed_at) values
  ('e0000000-0000-0000-0000-000000000001', 'Known@Example.test', now()),
  ('e0000000-0000-0000-0000-000000000002', 'waiting@example.test', null),
  ('e0000000-0000-0000-0000-000000000003', 'gone@example.test', now());
update auth.users set deleted_at = now() where id = 'e0000000-0000-0000-0000-000000000003';

set role anon;
select test.expect_count('an account, whatever the letter case and spaces', $q$select 1 where public.email_account_status('  known@example.TEST ') = 'confirmed'$q$, 1);
select test.expect_count('an account still waiting for its confirmation', $q$select 1 where public.email_account_status('waiting@example.test') = 'unconfirmed'$q$, 1);
select test.expect_count('no account', $q$select 1 where public.email_account_status('new@example.test') = 'none'$q$, 1);
select test.expect_count('a deleted account counts as none', $q$select 1 where public.email_account_status('gone@example.test') = 'none'$q$, 1);
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.55"}', true);
select test.expect_error('… and not endlessly from one caller', $q$select public.email_account_status(x::text) from generate_series(1, 40) x$q$, 'Too many attempts');

\echo 'email account status tests passed'
rollback;
