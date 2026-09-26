-- Tests for 0029 (deleting one's own account). Uses the push club of 05:
-- Pete (player, U20) deletes his account; Carla is the only club admin.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Pete has a device, settings, an Apple connection and answers.
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.test/pete-delete', '10000000-0000-0000-0000-000000000073', 'k', 'a') on conflict do nothing;
insert into public.notification_settings (user_id, muted_kinds) values ('10000000-0000-0000-0000-000000000073', '{}') on conflict do nothing;
set role service_role;
select public.apple_sync_connect('10000000-0000-0000-0000-000000000073', 'pete@icloud.com', 'pete-pw', 'https://h/', null);
reset role;
insert into public.club_roles (club_id, person_id, role)
select 'c7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000074', 'admin'
where not exists (select 1 from public.club_roles where person_id = 'a7000000-0000-0000-0000-000000000074' and role = 'admin');

select test.expect_error('signed out: nothing to delete', $q$select public.delete_my_account()$q$, 'Not signed in');

set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000073');
select public.delete_my_account();
reset role;

select test.expect_count('Pete is gone from the club', $q$select 1 from public.people where id = 'a7000000-0000-0000-0000-000000000073'$q$, 0);
select test.expect_count('… with his memberships', $q$select 1 from public.memberships where person_id = 'a7000000-0000-0000-0000-000000000073'$q$, 0);
select test.expect_count('… his account', $q$select 1 from auth.users where id = '10000000-0000-0000-0000-000000000073'$q$, 0);
select test.expect_count('… his devices and settings', $q$select 1 from public.push_subscriptions where user_id = '10000000-0000-0000-0000-000000000073'
  union all select 1 from public.notification_settings where user_id = '10000000-0000-0000-0000-000000000073'$q$, 0);
select test.expect_count('… and his Apple password in the Vault', $q$select 1 from vault.secrets where name = 'apple-calendar-10000000-0000-0000-0000-000000000073'$q$, 0);
select test.expect_count('the others stay', $q$select 1 from public.people where id in ('a7000000-0000-0000-0000-000000000071', 'a7000000-0000-0000-0000-000000000074')$q$, 2);

-- The only club admin cannot leave the club without an admin.
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_error('the only admin must add another admin first', $q$select public.delete_my_account()$q$, 'only admin of your club');
reset role;
select test.expect_count('… and nothing was deleted', $q$select 1 from public.people where id = 'a7000000-0000-0000-0000-000000000074'$q$, 1);

select 'all delete account checks passed' as result;
