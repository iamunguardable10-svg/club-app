-- Tests for 0028 (a coach hears when a player joins with the code). Uses
-- the push club of 05: Carla (head coach, U20) and Tim (helper without
-- manageStaff) have devices; a new player joins with the U20 code.

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000079', 'push-nina@example.test');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values
  ('https://push.test/carla-join', '10000000-0000-0000-0000-000000000074', 'k', 'a'),
  ('https://push.test/tim-join', '10000000-0000-0000-0000-000000000075', 'k', 'a')
on conflict do nothing;

select code as u20_code from public.team_join_codes where team_id = '77000000-0000-0000-0000-000000000001' \gset
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000079');
select public.join_team(:'u20_code', 'Nina', 'New');
reset role;

select test.expect_count('the head coach hears that Nina joined',
  $q$select 1 from app.push_outbox where kind = 'joined' and user_id = '10000000-0000-0000-0000-000000000074'
     and title = 'U20 · New player' and body like 'Nina New joined with the team code.%' and url = '/coach/team'$q$, 1);
select test.expect_count('… a helper who cannot remove players does not',
  $q$select 1 from app.push_outbox where kind = 'joined' and user_id = '10000000-0000-0000-0000-000000000075'$q$, 0);
select test.expect_count('… nor Nina herself',
  $q$select 1 from app.push_outbox where kind = 'joined' and user_id = '10000000-0000-0000-0000-000000000079'$q$, 0);

-- A coach adding a player themselves: no notice (they know already).
insert into public.memberships (person_id, team_id, role)
values ('a7000000-0000-0000-0000-000000000073', '77000000-0000-0000-0000-000000000002', 'athlete')
on conflict do nothing;
select test.expect_count('a membership made by someone else sends nothing',
  $q$select 1 from app.push_outbox where kind = 'joined' and body like 'Pete%'$q$, 0);

-- Switched off in Settings
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000074');
select test.expect_rows('Carla can switch "New players" off',
  $q$insert into public.notification_settings (user_id, muted_kinds) values ('10000000-0000-0000-0000-000000000074', '{joined}')
     on conflict (user_id) do update set muted_kinds = excluded.muted_kinds$q$, 1);
reset role;

select 'all join notice checks passed' as result;
