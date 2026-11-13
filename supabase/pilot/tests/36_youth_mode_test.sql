-- Youth mode (0058): consent reminders from the coach.
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claims','',false);
update public.teams set feature_choices = array(select distinct f from unnest(coalesce(feature_choices,'{}') || array['load']) f) where id='70000000-0000-0000-0000-000000000016';
insert into auth.users(id,email) values ('10000000-0000-0000-0000-000000000361','youth@example.test'),('10000000-0000-0000-0000-000000000362','nopush@example.test');
insert into public.people(id,club_id,user_id,first_name,last_name,birth_year) values
 ('a0000000-0000-0000-0000-000000000361','c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000361','Young','Player',extract(year from current_date)::integer-13),
 ('a0000000-0000-0000-0000-000000000362','c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000362','No','Push',extract(year from current_date)::integer-13);
insert into public.memberships(person_id,team_id,role) values
 ('a0000000-0000-0000-0000-000000000361','70000000-0000-0000-0000-000000000016','athlete'),
 ('a0000000-0000-0000-0000-000000000362','70000000-0000-0000-0000-000000000016','athlete');
insert into public.push_subscriptions(endpoint,user_id,p256dh,auth) values ('https://push.test/youth','10000000-0000-0000-0000-000000000361','k','a');
select test.expect_count('the team tracks load', $q$select 1 from public.teams where id='70000000-0000-0000-0000-000000000016' and 'load' = any(features)$q$, 1);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select public.remind_consent('70000000-0000-0000-0000-000000000016') as first \gset
reset role;
select test.expect_count('the player without consent and with push is reminded', $q$select 1 from app.push_outbox where kind='consent' and text_key='push.consentReminder' and user_id='10000000-0000-0000-0000-000000000361'$q$, 1);
select test.expect_count('nobody without a device gets a row', $q$select 1 from app.push_outbox where text_key='push.consentReminder' and user_id='10000000-0000-0000-0000-000000000362'$q$, 0);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_count('once a day: a second tap adds nobody', $q$select 1 where public.remind_consent('70000000-0000-0000-0000-000000000016') = 0$q$, 1);
select test.act_as('10000000-0000-0000-0000-000000000011');
select test.expect_error('someone from another club cannot', $q$select public.remind_consent('70000000-0000-0000-0000-000000000016')$q$, 'may not');
select test.act_as('10000000-0000-0000-0000-000000000361');
select test.expect_error('a player cannot', $q$select public.remind_consent('70000000-0000-0000-0000-000000000016')$q$, 'may not');
reset role;
rollback;
\echo 'youth mode checks passed'
