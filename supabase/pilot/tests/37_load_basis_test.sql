-- Load with short history (0059): the stage and the ratio of the nightly summary.
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claims','',false);
insert into public.people(id,club_id,first_name,last_name) values
 ('a0000000-0000-0000-0000-000000000371','c0000000-0000-0000-0000-000000000001','Basis','Thirteen'),
 ('a0000000-0000-0000-0000-000000000372','c0000000-0000-0000-0000-000000000001','Basis','Fourteen'),
 ('a0000000-0000-0000-0000-000000000373','c0000000-0000-0000-0000-000000000001','Basis','Thirty'),
 ('a0000000-0000-0000-0000-000000000374','c0000000-0000-0000-0000-000000000001','Basis','Sparse'),
 ('a0000000-0000-0000-0000-000000000375','c0000000-0000-0000-0000-000000000001','Basis','Future'),
 ('a0000000-0000-0000-0000-000000000376','c0000000-0000-0000-0000-000000000001','Basis','Zero');
insert into public.consents(person_id,kind,version,by_parent_name,by_parent_email)
select id, 'parent_health', '2026-10-08', 'Parent', 'parent@example.test' from public.people where id::text like 'a0000000-0000-0000-0000-00000000037_';
-- Every second day back to 12, 13, 29 days ago (the app's `every(-n, 0)`).
insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source)
select p.id, current_date - p.back + d, 'Training', 'team_training', 5, 80, 400, 'manual'
from (values ('a0000000-0000-0000-0000-000000000371'::uuid, 12), ('a0000000-0000-0000-0000-000000000372'::uuid, 13), ('a0000000-0000-0000-0000-000000000373'::uuid, 29)) as p(id, back)
cross join lateral generate_series(0, p.back, 2) as d;
-- First entry 40 days ago, then three rated days in the last 28.
insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source)
select 'a0000000-0000-0000-0000-000000000374', current_date - d, 'Training', 'team_training', 5, 100, 500, 'manual' from unnest(array[40,20,10,2]) as d;
-- 13 days of history plus entries ahead, and a person with only zero loads.
insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source)
select 'a0000000-0000-0000-0000-000000000375', current_date + d, 'Training', 'team_training', 5, 80, 400, 'manual' from unnest(array[-12,-6,0,5,20]) as d;
insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source)
select 'a0000000-0000-0000-0000-000000000376', current_date - d, 'Rest', 'recovery', 0, 30, 0, 'manual' from generate_series(0, 40) as d;

select test.expect_count('13 days: building, no ratio', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000371', current_date) where basis='building' and acwr is null and not chronic_full$q$,1);
select test.expect_count('14 days: provisional with a ratio', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000372', current_date) where basis='provisional' and acwr is not null and not chronic_full$q$,1);
select test.expect_count('30 days: regular, chronic full', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000373', current_date) where basis='regular' and acwr is not null and chronic_full$q$,1);
select test.expect_count('long span, three rated days: building', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000374', current_date) where basis='building' and acwr is null$q$,1);
select test.expect_count('future entries do not make history', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000375', current_date) where basis='building' and acwr is null$q$,1);
select test.expect_count('zero loads are not ratings', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000376', current_date) where basis='building' and acwr is null$q$,1);
select test.expect_count('no entries at all: building', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000999', current_date) where basis='building'$q$,1);
select test.expect_count('the ratio is finite', $q$select 1 from app.load_basis_summary('a0000000-0000-0000-0000-000000000373', current_date) where acwr > 0 and acwr < 10$q$,1);

-- A stored row keeps its stage; the column takes only the three stages.
insert into public.load_summaries(person_id, acwr, chronic_full, basis) values ('a0000000-0000-0000-0000-000000000372', 1.1, false, 'provisional');
select test.expect_count('stored stage readable', $q$select 1 from public.load_summaries where person_id='a0000000-0000-0000-0000-000000000372' and basis='provisional'$q$,1);
select test.expect_error('only the three stages', $q$update public.load_summaries set basis='full' where person_id='a0000000-0000-0000-0000-000000000372'$q$,'check');
set role authenticated;
select test.expect_error('the summary function is not callable from the app', $q$select * from app.load_basis_summary('a0000000-0000-0000-0000-000000000373', current_date)$q$,'permission denied');
reset role;
rollback;
\echo 'load basis checks passed'
