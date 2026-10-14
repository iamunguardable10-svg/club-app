-- Rate limits (0042): sliding window per IP for anonymous calls, per account when signed in.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;

-- No API headers (database, cron): never limited.
set role anon;
select set_config('request.jwt.claims', '', true);
do $$ begin for i in 1..40 loop perform public.join_code_preview('NOPE2345'); end loop; end $$;
select test.expect_count('no headers: 40 previews pass', $q$select 1$q$, 1);

-- Anonymous caller from one IP: 30 per 10 minutes, the 31st fails.
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}', true);
do $$ begin for i in 1..30 loop perform public.join_code_preview('NOPE2345'); end loop; end $$;
select test.expect_error('31st preview from the same IP', $q$select public.join_code_preview('NOPE2345')$q$, 'Too many attempts');
-- Another IP is not affected.
select set_config('request.headers', '{"x-forwarded-for":"198.51.100.9"}', true);
select test.expect_count('other IP still allowed', $q$select 1 from (select public.join_code_preview('NOPE2345')) x$q$, 0);

-- Founding codes: 10 per hour.
do $$ begin for i in 1..10 loop perform public.founding_code_usable('XXXX'); end loop; end $$;
select test.expect_error('11th founding code check', $q$select public.founding_code_usable('XXXX')$q$, 'Too many attempts');

-- Signed in: counted per account, not per IP.
reset role;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000072');
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7"}', true);
select test.expect_count('account has its own budget', $q$select 1 from (select public.join_code_preview('NOPE2345')) x$q$, 0);
do $$ begin for i in 1..29 loop perform public.join_code_preview('NOPE2345'); end loop; end $$;
select set_config('request.headers', '{"x-forwarded-for":"198.51.100.200"}', true);
select test.expect_error('a new IP does not reset the account budget', $q$select public.join_code_preview('NOPE2345')$q$, 'Too many attempts');

-- Previous window still counts with the share that overlaps the sliding window.
-- With a 2e9-second window we sit in window 0; window -1 had 100 calls.
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '{"cf-connecting-ip":"192.0.2.1"}', true);
insert into app.rate_windows(bucket, caller, window_start, current_count, previous_count)
values ('demo_low', app.rate_caller(), -1, 100, 0), ('demo_high', app.rate_caller(), -1, 100, 0);
select test.expect_count('no plain IP is stored', $q$select 1 from app.rate_windows where caller like '%192.0.2.1%' or caller like '%203.0.113.7%'$q$, 0);
create temp table expected as select 100 * (1 - extract(epoch from clock_timestamp()) / 2e9) + 1 as v;
select test.expect_count('weighted previous window blocks below the estimate',
  $q$select 1 where not app.rate_allow('demo_low', (select floor(v)::int - 1 from expected), 2000000000)$q$, 1);
select test.expect_count('weighted previous window allows above the estimate',
  $q$select 1 where app.rate_allow('demo_high', (select ceil(v)::int + 1 from expected), 2000000000)$q$, 1);

select test.expect_count('originals are not callable over the API', $q$select 1 where has_function_privilege('anon', 'app.join_code_preview_unlimited(text)', 'execute')$q$, 0);

\echo 'rate limit tests passed'
rollback;
