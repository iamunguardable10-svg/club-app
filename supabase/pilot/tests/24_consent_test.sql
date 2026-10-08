-- Run 77: new users have no presumed consent. Reuses only the existing test helpers.
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claims','',false);
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000241','child@example.test','{"email":"alias@example.test"}'),
 ('10000000-0000-0000-0000-000000000242','adult@example.test','{}');
insert into public.people(id,club_id,user_id,first_name,last_name,birth_year) values
 ('a0000000-0000-0000-0000-000000000241','c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000241','Child','Consent',extract(year from current_date)::integer-14),
 ('a0000000-0000-0000-0000-000000000242','c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000242','Adult','Consent',1990);
insert into public.memberships(person_id,team_id,role) values
 ('a0000000-0000-0000-0000-000000000241','70000000-0000-0000-0000-000000000016','athlete'),
 ('a0000000-0000-0000-0000-000000000242','70000000-0000-0000-0000-000000000016','athlete');
insert into public.push_subscriptions(endpoint,user_id,p256dh,auth) values ('https://push.test/consent','10000000-0000-0000-0000-000000000241','secret-key','secret-auth');
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000241');
select test.expect_error('join requires terms', $q$select public.join_team('TEST2345','Child','Consent')$q$, 'terms');
select public.record_access_consent('2026-10-08',extract(year from current_date)::integer-14,false,false);
select test.expect_count('child sees only their own consent', $q$select 1 from public.consents$q$,1);
select test.expect_error('cannot forge health consent', $q$insert into public.consents(person_id,kind,version) values ('a0000000-0000-0000-0000-000000000241','health','2026-10-08')$q$,'permission denied');
select test.expect_error('cannot alter consent history', $q$update public.consents set withdrawn_at=now()$q$,'permission denied');
select test.expect_error('minor cannot self-consent', $q$select public.give_health_consent('a0000000-0000-0000-0000-000000000241','2026-10-08')$q$,'parent');
select test.expect_error('RPE without consent refused', $q$insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source) values ('a0000000-0000-0000-0000-000000000241',current_date,'Run','conditioning',5,30,150,'solo')$q$,'consent');
select test.expect_error('summary without consent refused', $q$insert into public.load_summaries(person_id,acwr,chronic_full) values ('a0000000-0000-0000-0000-000000000241',1,true)$q$,'consent');
select test.expect_error('plan without consent refused', $q$insert into public.athlete_plans(person_id,date,title,training_type,expected_rpe,expected_duration_minutes) values ('a0000000-0000-0000-0000-000000000241',current_date,'Run','conditioning',5,30)$q$,'consent');
insert into public.availability(id,person_id,session_id,status) values ('ab000000-0000-0000-0000-000000000241','a0000000-0000-0000-0000-000000000241','50000000-0000-0000-0000-000000000016','out');
select test.expect_error('out reason without consent refused', $q$insert into public.availability_reasons(availability_id,reason) values ('ab000000-0000-0000-0000-000000000241','injured')$q$,'consent');
insert into public.absences(id,person_id,from_date,to_date) values ('ab100000-0000-0000-0000-000000000241','a0000000-0000-0000-0000-000000000241',current_date,current_date+1);
select test.expect_error('injury reason without consent refused', $q$insert into public.absence_reasons(absence_id,kind,note) values ('ab100000-0000-0000-0000-000000000241','injured','ankle')$q$,'consent');
select public.create_parent_consent_token('a0000000-0000-0000-0000-000000000241') as token \gset
reset role;
select test.expect_count('only a 32-byte token hash stored', 'select 1 from app.parent_tokens where octet_length(token_hash)=32 and token_hash=sha256(convert_to('||quote_literal(:'token')||',''UTF8''))',1);
set role anon;
select test.expect_error('anon cannot read consent records', 'select 1 from public.consents','permission denied');
select test.expect_count('valid preview contains first name/team/club only','select 1 where public.parent_consent_preview('||quote_literal(:'token')||') = ''{"firstName":"Child","team":"U16","club":"TV Test"}''::jsonb',1);
select test.expect_count('child email rejected despite whitespace/case','select 1 where public.confirm_parent_consent('||quote_literal(:'token')||',''Parent Name'','' CHILD@EXAMPLE.TEST '',true,''2026-10-08'')->>''error'' like ''Use a parent%''',1);
select test.expect_count('child alternate account email rejected','select 1 where public.confirm_parent_consent('||quote_literal(:'token')||',''Parent Name'','' ALIAS@EXAMPLE.TEST '',true,''2026-10-08'')->>''error'' like ''Use a parent%''',1);
select public.confirm_parent_consent(:'token','Parent Name','parent@example.test',true,'2026-10-08')->>'withdrawToken' as withdrawal \gset
select test.expect_count('used preview hidden','select 1 where public.parent_consent_preview('||quote_literal(:'token')||') is null',1);
select test.expect_count('token cannot be reused','select 1 where public.confirm_parent_consent('||quote_literal(:'token')||',''Parent Name'',''parent@example.test'',true,''2026-10-08'')->>''error'' like ''This consent%''',1);
reset role;
select test.expect_count('child push enqueued','select 1 from app.push_outbox where kind=''consent'' and user_id=''10000000-0000-0000-0000-000000000241'' and text_key=''push.parentConsent''',1);
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000241');
select test.expect_count('parental consent active',$q$select 1 where public.health_consent_active('a0000000-0000-0000-0000-000000000241')$q$,1);
insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source) values ('a0000000-0000-0000-0000-000000000241',current_date,'Run','conditioning',5,30,150,'solo');
select test.expect_count('export only own people',$q$select 1 where jsonb_array_length(public.export_my_data()->'people')=1 and public.export_my_data()->'people'->0->>'first_name'='Child'$q$,1);
select test.expect_count('export includes own load and excludes push keys',$q$select 1 where jsonb_array_length(public.export_my_data()->'load_entries')=1 and not ((public.export_my_data()->'push_subscriptions'->0) ?| array['p256dh','auth'])$q$,1);
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_count('coach sees no parent contact rows',$q$select 1 from public.consents where person_id='a0000000-0000-0000-0000-000000000241'$q$,0);
select test.expect_count('coach sees status',$q$select 1 where public.health_consent_active('a0000000-0000-0000-0000-000000000241')$q$,1);
select test.expect_count('coach sees birth year',$q$select 1 from public.person_birth_years where person_id='a0000000-0000-0000-0000-000000000241' and birth_year=extract(year from current_date)::integer-14$q$,1);
select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_error('roster-only coach cannot see status',$q$select public.health_consent_active('a0000000-0000-0000-0000-000000000241')$q$,'may not see');
select test.expect_error('birth year not exposed by names table',$q$select birth_year from public.people$q$,'permission denied');
reset role;
set role anon;
select test.expect_count('parent can withdraw once','select 1 where public.withdraw_parent_consent('||quote_literal(:'withdrawal')||')',1);
select test.expect_count('withdrawal link replay harmless','select 1 where not public.withdraw_parent_consent('||quote_literal(:'withdrawal')||')',1);
reset role;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000241');
select test.expect_error('withdrawal stops RPE writes',$q$insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source) values ('a0000000-0000-0000-0000-000000000241',current_date,'Run','conditioning',5,30,150,'solo')$q$,'consent');
select test.expect_count('own historic entries still exportable',$q$select 1 where jsonb_array_length(public.export_my_data()->'load_entries')=1$q$,1);
select public.create_parent_consent_token('a0000000-0000-0000-0000-000000000241') as expired \gset
reset role;
update app.parent_tokens set expires_at=now()-interval '1 second' where token_hash=sha256(convert_to(:'expired','UTF8'));
set role anon;
select test.expect_count('expired request rejected','select 1 where public.confirm_parent_consent('||quote_literal(:'expired')||',''Parent'',''p@example.test'',true,''2026-10-08'')->>''error'' like ''This consent%''',1);
reset role;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000241');
select public.create_parent_consent_token('a0000000-0000-0000-0000-000000000241') as limited \gset
reset role;
set role anon;
select public.confirm_parent_consent(:'limited','Parent','child@example.test',true,'2026-10-08') from generate_series(1,10);
select test.expect_count('per-token rate limit persists across bad attempts','select 1 where public.confirm_parent_consent('||quote_literal(:'limited')||',''Parent'',''p@example.test'',true,''2026-10-08'')->>''error'' like ''Too many%''',1);
reset role;
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000001');
select test.expect_count('coach loses historic health data after withdrawal',$q$select 1 from public.load_entries where person_id='a0000000-0000-0000-0000-000000000241'$q$,0);
select test.act_as('10000000-0000-0000-0000-000000000242');
select public.give_health_consent('a0000000-0000-0000-0000-000000000242','2026-10-08');
insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source) values ('a0000000-0000-0000-0000-000000000242',current_date,'Run','conditioning',5,30,150,'solo');
select test.expect_count('adult export excludes child data',$q$select 1 where public.export_my_data()->'load_entries'->0->>'person_id'='a0000000-0000-0000-0000-000000000242' and jsonb_array_length(public.export_my_data()->'consents')=1$q$,1);
select public.withdraw_health_consent('a0000000-0000-0000-0000-000000000242',true);
select test.expect_count('withdraw + deletion erases load',$q$select 1 from public.load_entries where person_id='a0000000-0000-0000-0000-000000000242'$q$,0);
select test.expect_error('adult withdrawal stops inserts',$q$insert into public.load_entries(person_id,date,title,training_type,rpe,duration_minutes,load,source) values ('a0000000-0000-0000-0000-000000000242',current_date,'Run','conditioning',5,30,150,'solo')$q$,'consent');
reset role;
select set_config('request.jwt.claims','',false);
insert into public.teams(club_id,department_id,name,age_group) values ('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Consent U8','U8'),('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Consent U12','U12');
select test.expect_count('U8 defaults load off',$q$select 1 from public.teams where name='Consent U8' and features='{}'$q$,1);
select test.expect_count('U12 defaults load on',$q$select 1 from public.teams where name='Consent U12' and features='{load}'$q$,1);
select test.expect_error('invalid age group refused',$q$update public.teams set age_group='U7' where name='Consent U8'$q$,'check');
-- A manageFacilities-only coach may update the facility, never health settings.
update public.coach_roles set permissions='{viewRoster,manageFacilities}' where team_id='70000000-0000-0000-0000-000000000016' and name='Team Manager';
set role authenticated;
select test.act_as('10000000-0000-0000-0000-000000000005');
select test.expect_error('facility right cannot change age/load',$q$update public.teams set age_group='U14' where id='70000000-0000-0000-0000-000000000016'$q$,'Not allowed');
reset role;
rollback;
\echo 'all consent checks passed'
