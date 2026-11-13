-- Age 16 with the birth month in the boundary year (0057, audit 2026-11 variant b).
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claims','',false);
select extract(year from current_date)::integer-16 as edge, extract(month from current_date)::integer as month \gset
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000351','edge-nomonth@example.test'),
 ('10000000-0000-0000-0000-000000000352','edge-thismonth@example.test'),
 ('10000000-0000-0000-0000-000000000353','older@example.test');
insert into public.people(id,club_id,user_id,first_name,last_name,birth_year,birth_month) values
 ('a0000000-0000-0000-0000-000000000351','c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000351','Edge','NoMonth',:edge,null),
 ('a0000000-0000-0000-0000-000000000352','c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000352','Edge','ThisMonth',:edge,:month),
 ('a0000000-0000-0000-0000-000000000353','c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000353','Older','December',:edge-1,12);

-- The rule itself, also in January (no earlier month exists then).
select test.expect_count('the year before the edge is 16, whatever month', 'select 1 where app.is_16('||:edge||'-1,12) and app.is_16('||:edge||'-1,null)',1);
select test.expect_count('edge year without month is under 16', 'select 1 where not app.is_16('||:edge||',null)',1);
select test.expect_count('birthday month itself still under 16', 'select 1 where not app.is_16('||:edge||','||:month||')',1);
select test.expect_count('an earlier month in the edge year is 16 (none in January)', 'select 1 where app.is_16('||:edge||',1) = ('||:month||' > 1)',1);
select test.expect_count('the year after the edge is never 16', 'select 1 where not app.is_16('||:edge||'+1,1)',1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000351');
select test.expect_error('edge year without month cannot self-consent', $q$select public.give_health_consent('a0000000-0000-0000-0000-000000000351','2026-10-08')$q$,'parent');
select test.expect_error('signup step without month cannot claim health', 'select public.record_access_consent(''2026-10-08'','||:edge||',true,false)','parent');
select test.expect_count('a parent link is allowed instead', $q$select 1 where length(public.create_parent_consent_token('a0000000-0000-0000-0000-000000000351'))=64$q$,1);
select public.save_my_birth_year('a0000000-0000-0000-0000-000000000351',:edge,:month);
select test.expect_error('the month cannot be changed afterwards', 'select public.save_my_birth_year(''a0000000-0000-0000-0000-000000000351'','||:edge||','||(case when :month = 1 then 2 else 1 end)||')','operator');
select test.expect_count('own month readable', 'select 1 from public.person_birth_years where person_id=''a0000000-0000-0000-0000-000000000351'' and birth_month='||:month,1);
select test.expect_error('month not readable from the names table', $q$select birth_month from public.people$q$,'permission denied');

select test.act_as('10000000-0000-0000-0000-000000000352');
select test.expect_error('birthday month needs a parent', $q$select public.give_health_consent('a0000000-0000-0000-0000-000000000352','2026-10-08')$q$,'parent');

select test.act_as('10000000-0000-0000-0000-000000000353');
select public.give_health_consent('a0000000-0000-0000-0000-000000000353','2026-10-08');
select test.expect_count('older player consents for themselves', $q$select 1 where public.health_consent_active('a0000000-0000-0000-0000-000000000353')$q$,1);
select test.expect_error('a parent link is not for them', $q$select public.create_parent_consent_token('a0000000-0000-0000-0000-000000000353')$q$,'under 16');
reset role;

-- A stored self-consent from before 0057 for an edge-year player without month stops counting.
insert into public.consents(person_id,kind,version) values ('a0000000-0000-0000-0000-000000000352','health','2026-10-08');
select test.expect_count('old self-consent of an under-16 is not active', $q$select 1 where not app.health_active('a0000000-0000-0000-0000-000000000352')$q$,1);
rollback;
\echo 'birth month checks passed'
