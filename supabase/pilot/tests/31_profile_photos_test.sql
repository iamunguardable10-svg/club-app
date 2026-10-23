-- Profile photos (0050): only oneself puts one's photo, only one's club sees it. Fixtures from 01.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;

select test.expect_count('the bucket is private', $q$select 1 from storage.buckets where id = 'avatars' and not public$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin puts his own photo', $q$insert into storage.objects (bucket_id, name) values ('avatars', 'c0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001.jpg')$q$, 1);
select test.expect_rows('… and says so on his person', $q$update public.people set photo_at = now() where id = 'a0000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_rows('… replaces it', $q$update storage.objects set name = name where bucket_id = 'avatars' and name = 'c0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001.jpg'$q$, 1);
select test.expect_error('… but not one for Sabine', $q$insert into storage.objects (bucket_id, name) values ('avatars', 'c0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000002.jpg')$q$, 'row-level security');
select test.expect_error('… nor one in another club''s folder', $q$insert into storage.objects (bucket_id, name) values ('avatars', 'c0000000-0000-0000-0000-000000000002/a0000000-0000-0000-0000-000000000001.jpg')$q$, 'row-level security');
select test.expect_error('… nor any other file', $q$insert into storage.objects (bucket_id, name) values ('avatars', 'c0000000-0000-0000-0000-000000000001/a0000000-0000-0000-0000-000000000001.gif')$q$, 'row-level security');
select test.expect_rows('… nor mark Sabine as having a photo', $q$update public.people set photo_at = now() where id = 'a0000000-0000-0000-0000-000000000002'$q$, 0);

select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_count('a player of the club sees it', $q$select 1 from storage.objects where bucket_id = 'avatars'$q$, 1);
select test.expect_rows('… but cannot remove it', $q$delete from storage.objects where bucket_id = 'avatars'$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000003');
select test.expect_count('a coach of his team sees that there is one', $q$select 1 from public.people where id = 'a0000000-0000-0000-0000-000000000001' and photo_at is not null$q$, 1);

select test.act_as('10000000-0000-0000-0000-000000000099');
select test.expect_count('someone of another club does not see it', $q$select 1 from storage.objects where bucket_id = 'avatars'$q$, 0);

select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_rows('Martin removes his photo', $q$delete from storage.objects where bucket_id = 'avatars'$q$, 1);

\echo 'profile photo tests passed'
rollback;
