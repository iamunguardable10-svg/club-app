-- Playbooks (0049): who adds, who sees drafts and releases, files, push, the feature switch. Local fixtures from 05.
\set ON_ERROR_STOP on
begin;
set client_min_messages = notice;
\set club 'c7000000-0000-0000-0000-000000000001'
\set team 'c7000000-0000-0000-0000-000000000001/77000000-0000-0000-0000-000000000001'

select test.expect_count('the feature is on for the pilot teams', $q$select 1 from public.teams where id = '77000000-0000-0000-0000-000000000001' and 'playbook' = any (features)$q$, 1);
select test.expect_count('… and the bucket is private', $q$select 1 from storage.buckets where id = 'playbooks' and not public$q$, 1);

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('the head coach uploads a file into the team folder', $q$insert into storage.objects (bucket_id, name) values ('playbooks', 'c7000000-0000-0000-0000-000000000001/77000000-0000-0000-0000-000000000001/b1/press.pdf')$q$, 1);
select test.expect_error('… not into another team''s folder', $q$insert into storage.objects (bucket_id, name) values ('playbooks', 'c7000000-0000-0000-0000-000000000001/77000000-0000-0000-0000-000000000099/b1/x.pdf')$q$, 'row-level security');
select test.expect_rows('… adds a draft', $q$insert into public.playbooks (id, team_id, title, category, file_path, file_name, file_type, file_size) values ('b0000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 'Full-court press', 'defense', 'c7000000-0000-0000-0000-000000000001/77000000-0000-0000-0000-000000000001/b1/press.pdf', 'press.pdf', 'application/pdf', 120000)$q$, 1);
select test.expect_error('… the file must be in the team folder', $q$insert into public.playbooks (team_id, title, file_path, file_name, file_type, file_size) values ('77000000-0000-0000-0000-000000000001', 'Elsewhere', 'other/x.pdf', 'x.pdf', 'application/pdf', 10)$q$, 'team''s folder');
select test.expect_error('… only PDFs and pictures', $q$insert into public.playbooks (team_id, title, file_path, file_name, file_type, file_size) values ('77000000-0000-0000-0000-000000000001', 'Zip', 'c7000000-0000-0000-0000-000000000001/77000000-0000-0000-0000-000000000001/b2/x.zip', 'x.zip', 'application/zip', 10)$q$, 'check');

select test.act_as('10000000-0000-0000-0000-000000000075');
select test.expect_count('a helper coach sees the draft', $q$select 1 from public.playbooks$q$, 1);
select test.expect_rows('… but cannot change it', $q$update public.playbooks set title = 'Mine' where id = 'b0000000-0000-0000-0000-000000000001'$q$, 0);

select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('players do not see a draft', $q$select 1 from public.playbooks$q$, 0);
select test.expect_count('… nor its file', $q$select 1 from storage.objects where bucket_id = 'playbooks'$q$, 0);
select test.expect_error('… and cannot add one', $q$insert into public.playbooks (team_id, title, file_path, file_name, file_type, file_size) values ('77000000-0000-0000-0000-000000000001', 'Mine', 'c7000000-0000-0000-0000-000000000001/77000000-0000-0000-0000-000000000001/b3/x.pdf', 'x.pdf', 'application/pdf', 10)$q$, 'row-level security');

select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('the coach releases it to the Backs only', $q$update public.playbooks set status = 'released', group_ids = '{67000000-0000-0000-0000-000000000001}' where id = 'b0000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_error('… groups must be the team''s', $q$update public.playbooks set group_ids = '{67000000-0000-0000-0000-000000000099}' where id = 'b0000000-0000-0000-0000-000000000001'$q$, 'own groups');

select test.act_as('10000000-0000-0000-0000-000000000072');
select test.expect_count('Paul (Backs) sees it', $q$select 1 from public.playbooks where released_at is not null$q$, 1);
select test.expect_count('… and may open the file', $q$select 1 from storage.objects where bucket_id = 'playbooks'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('Pia (not a Back) does not', $q$select 1 from public.playbooks$q$, 0);

reset role;
select test.expect_count('the Backs with a device get a push, nobody else', $q$select 1 from app.push_outbox where kind = 'playbook' and text_key = 'push.playbook'$q$, 1);
set role authenticated;

select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('released to the whole team from tomorrow', $q$update public.playbooks set group_ids = '{}', release_at = now() + interval '1 day' where id = 'b0000000-0000-0000-0000-000000000001'$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('… Pia sees it only from then on', $q$select 1 from public.playbooks$q$, 0);
reset role;
select test.expect_count('… her push waits for that day', $q$select 1 from app.push_outbox where kind = 'playbook' and user_id = '10000000-0000-0000-0000-000000000071' and send_after > now() + interval '20 hours'$q$, 1);

-- The team switches the playbook off: nobody sees it, nothing new can be added.
update public.playbooks set release_at = null where id = 'b0000000-0000-0000-0000-000000000001';
update public.teams set feature_choices = array_remove(feature_choices, 'playbook') where id = '77000000-0000-0000-0000-000000000001';
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000071');
select test.expect_count('switched off: players see nothing', $q$select 1 from public.playbooks$q$, 0);
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_error('… and coaches cannot add', $q$insert into public.playbooks (team_id, title, file_path, file_name, file_type, file_size) values ('77000000-0000-0000-0000-000000000001', 'New', 'c7000000-0000-0000-0000-000000000001/77000000-0000-0000-0000-000000000001/b4/x.pdf', 'x.pdf', 'application/pdf', 10)$q$, 'row-level security');
select test.expect_count('… and it is hidden from them too (kept until switched on again)', $q$select 1 from public.playbooks$q$, 0);
reset role;
update public.teams set feature_choices = feature_choices || array['playbook'] where id = '77000000-0000-0000-0000-000000000001';
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('switched on again, the coach deletes it', $q$delete from public.playbooks where id = 'b0000000-0000-0000-0000-000000000001'$q$, 1);
select test.expect_rows('… and its file', $q$delete from storage.objects where bucket_id = 'playbooks'$q$, 1);

\echo 'playbook tests passed'
rollback;
