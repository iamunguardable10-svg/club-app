-- Team logos (0054): who configures or runs the team puts it in; it is public. Fixtures from 01.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;

select test.expect_count('the bucket is public', $q$select 1 from storage.buckets where id = 'team-logos' and public$q$, 1);
select code as u16_code from public.team_join_codes where team_id = '70000000-0000-0000-0000-000000000016' \gset

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('the head coach puts the U16 logo', $q$insert into storage.objects (bucket_id, name) values ('team-logos', 'c0000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000016.png')$q$, 1);
select test.expect_rows('… and says so on the team', $q$update public.teams set logo_at = now() where id = '70000000-0000-0000-0000-000000000016'$q$, 1);
select test.expect_error('… only as PNG', $q$insert into storage.objects (bucket_id, name) values ('team-logos', 'c0000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000018.jpg')$q$, 'row-level security');
select test.expect_error('… not in another club''s folder', $q$insert into storage.objects (bucket_id, name) values ('team-logos', 'c0000000-0000-0000-0000-000000000002/70000000-0000-0000-0000-000000000016.png')$q$, 'row-level security');

select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_error('the team manager cannot replace it', $q$insert into storage.objects (bucket_id, name) values ('team-logos', 'c0000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000016.png')$q$, 'row-level security');
select test.expect_rows('… nor remove it', $q$delete from storage.objects where bucket_id = 'team-logos'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_rows('a player cannot remove it', $q$delete from storage.objects where bucket_id = 'team-logos'$q$, 0);
select test.expect_rows('… nor clear it on the team', $q$update public.teams set logo_at = null where id = '70000000-0000-0000-0000-000000000016'$q$, 0);

select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('someone outside the club learns from the code the logo and the department', format($f$select 1 from public.join_code_profile(%L) where logo like 'c0000000-0000-0000-0000-000000000001/70000000-0000-0000-0000-000000000016.png?v=%%' and department_name is not null$f$, :'u16_code'), 1);

select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('the head coach removes it again', $q$delete from storage.objects where bucket_id = 'team-logos'$q$, 1);

\echo 'team logo tests passed'
rollback;
