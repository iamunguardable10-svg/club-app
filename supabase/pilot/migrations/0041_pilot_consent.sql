-- Run 77: legal acceptance, voluntary health processing, parental consent and export.
-- Additive; local tests only. Existing users are not presumed to have consented.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.people add column birth_year smallint
  check (birth_year between 1900 and extract(year from current_date)::integer);
alter table public.teams add column age_group text
  check (age_group is null or age_group in ('U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','U19','adults','mixed'));
grant update (age_group, features) on public.teams to authenticated;
-- manageStaff can configure a team; roster/load rights remain independent.
create policy teams_health_settings on public.teams for update to authenticated
  using (app.has_perm(id, 'manageStaff')) with check (app.has_perm(id, 'manageStaff'));
create or replace function app.team_age_default() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.features is null then new.features := case when new.age_group in ('U8','U9','U10','U11') then '{}'::text[] else '{load}'::text[] end; end if;
  return new;
end $$;
alter table public.teams alter column features set default null;
create trigger teams_age_default before insert on public.teams for each row execute function app.team_age_default();

-- Column grants and permissive policies combine: protect health settings even
-- when a coach has manageFacilities but lacks manageStaff.
create or replace function app.guard_team_health_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role',true)='authenticated' and auth.uid() is not null and (new.age_group is distinct from old.age_group or new.features is distinct from old.features)
    and not app.has_perm(old.id,'manageStaff') then raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  return new;
end $$;
create trigger teams_health_guard before update on public.teams for each row execute function app.guard_team_health_settings();
revoke all on function app.guard_team_health_settings() from public,anon,authenticated;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('terms','health','parent_health')),
  version text not null,
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  by_parent_name text,
  by_parent_email text,
  check (num_nonnulls(person_id, user_id) = 1),
  check ((kind = 'terms' and user_id is not null) or (kind <> 'terms' and person_id is not null)),
  check (kind <> 'parent_health' or (nullif(btrim(by_parent_name),'') is not null and nullif(btrim(by_parent_email),'') is not null)),
  check (withdrawn_at is null or withdrawn_at >= given_at)
);
create index consents_person on public.consents(person_id, kind) where withdrawn_at is null;
create index consents_user on public.consents(user_id);
alter table public.consents enable row level security;
revoke all on public.consents from public, anon, authenticated;
grant select on public.consents to authenticated;
create policy consents_own on public.consents for select to authenticated
  using (user_id = auth.uid() or app.is_me(person_id));

create table app.access_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_year smallint check (birth_year between 1900 and extract(year from current_date)::integer),
  health boolean not null default false,
  staff_16 boolean not null default false
);
create table app.parent_tokens (
  token_hash bytea primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  attempts integer not null default 0
);
create index parent_tokens_person on app.parent_tokens(person_id);
create table app.parent_withdrawals (
  token_hash bytea primary key,
  consent_id uuid not null references public.consents(id) on delete cascade
);
revoke all on app.access_consent, app.parent_tokens, app.parent_withdrawals from public, anon, authenticated;

create or replace function app.health_active(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consents c join public.people p on p.id=c.person_id
    where c.person_id=p_person and c.withdrawn_at is null and c.version='2026-10-08'
      and (c.kind='parent_health' or (c.kind='health' and p.birth_year <= extract(year from current_date)::integer-16)))
$$;
create or replace function public.health_consent_active(p_person uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_me(p_person) or app.coach_sees_athlete(p_person,'viewLoadSummary') or app.coach_sees_athlete(p_person,'viewLoadDetails')) then
    raise exception 'You may not see consent for this player.' using errcode = 'insufficient_privilege';
  end if;
  return app.health_active(p_person);
end $$;
create view public.health_consent_status with (security_barrier=true) as
  select p.id as person_id, public.health_consent_active(p.id) as active from public.people p
  where app.is_me(p.id) or app.coach_sees_athlete(p.id,'viewLoadSummary') or app.coach_sees_athlete(p.id,'viewLoadDetails');
-- people can also be visible through carpools; birth years must not travel with names.
revoke select on public.people from authenticated;
grant select (id,club_id,user_id,first_name,last_name,rsvp_mode,created_at) on public.people to authenticated;
create view public.person_birth_years with (security_barrier=true) as
  select p.id as person_id, p.birth_year from public.people p
  where app.is_me(p.id) or app.coach_sees_athlete(p.id,'viewRoster');
revoke all on public.health_consent_status, public.person_birth_years from public, anon, authenticated;
grant select on public.health_consent_status, public.person_birth_years to authenticated;

create or replace function public.record_access_consent(p_version text, p_birth_year integer default null, p_health boolean default false, p_staff_16 boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode='insufficient_privilege'; end if;
  if p_version is distinct from '2026-10-08' then raise exception 'Please accept the current terms and privacy policy.' using errcode='check_violation'; end if;
  if not coalesce(p_staff_16,false) and (p_birth_year is null or p_birth_year < 1900 or p_birth_year > extract(year from current_date)::integer) then
    raise exception 'Enter a valid birth year.' using errcode='check_violation';
  end if;
  if coalesce(p_health,false) and (p_birth_year is null or p_birth_year > extract(year from current_date)::integer-16) then
    raise exception 'A parent must consent for players under 16.' using errcode='check_violation';
  end if;
  if exists(select 1 from public.people where user_id=auth.uid() and birth_year is not null and birth_year is distinct from p_birth_year) and p_birth_year is not null then
    raise exception 'Contact the operator to correct your birth year.' using errcode='check_violation';
  end if;
  if not exists(select 1 from public.consents where user_id=auth.uid() and kind='terms' and version=p_version) then
    insert into public.consents(user_id,kind,version) values(auth.uid(),'terms',p_version);
  end if;
  insert into app.access_consent(user_id,birth_year,health,staff_16)
    values(auth.uid(),p_birth_year,coalesce(p_health,false),coalesce(p_staff_16,false))
    on conflict(user_id) do update set birth_year=coalesce(excluded.birth_year,app.access_consent.birth_year),health=excluded.health,staff_16=excluded.staff_16;
end $$;
-- Store the user's actual signup choice even when email confirmation creates no session yet.
create or replace function app.signup_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_birth integer;
begin
  if new.raw_user_meta_data->>'legal_version' = '2026-10-08' then
    v_birth := (new.raw_user_meta_data->>'birth_year')::integer;
    if v_birth is not null and (v_birth<1900 or v_birth>extract(year from current_date)::integer) then
      raise exception 'Enter a valid birth year.' using errcode='check_violation';
    end if;
    insert into public.consents(user_id,kind,version) values(new.id,'terms','2026-10-08');
    insert into app.access_consent(user_id,birth_year,health,staff_16) values(new.id,v_birth,
      coalesce((new.raw_user_meta_data->>'health_consent')::boolean,false) and v_birth<=extract(year from current_date)::integer-16,
      coalesce((new.raw_user_meta_data->>'staff_16')::boolean,false));
  end if;
  return new;
end $$;
create trigger auth_signup_consent after insert on auth.users for each row execute function app.signup_consent();
create or replace function app.assert_access_consent(p_staff boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.consents where user_id=auth.uid() and kind='terms' and version='2026-10-08') then
    raise exception 'Please accept the current terms and privacy policy.' using errcode='check_violation';
  end if;
  if not exists(select 1 from app.access_consent where user_id=auth.uid() and (case when p_staff then staff_16 else birth_year is not null end)) then
    raise exception 'Confirm your age before continuing.' using errcode='check_violation';
  end if;
end $$;
create or replace function app.apply_player_consent(p_person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v app.access_consent;
begin
  select * into v from app.access_consent where user_id=auth.uid();
  update public.people set birth_year=coalesce(birth_year,v.birth_year) where id=p_person and user_id=auth.uid();
  if v.health and not app.health_active(p_person) then
    insert into public.consents(person_id,kind,version) values(p_person,'health','2026-10-08');
  end if;
end $$;

create or replace function public.give_health_consent(p_person uuid, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_year integer;
begin
  if not app.is_me(p_person) then raise exception 'You can only change your own consent.' using errcode='insufficient_privilege'; end if;
  select birth_year into v_year from public.people where id=p_person for update;
  if v_year is null or v_year>extract(year from current_date)::integer-16 then
    raise exception 'A parent must consent for players under 16.' using errcode='check_violation'; end if;
  if p_version is distinct from '2026-10-08' then raise exception 'Please accept the current terms and privacy policy.' using errcode='check_violation'; end if;
  if not app.health_active(p_person) then insert into public.consents(person_id,kind,version) values(p_person,'health',p_version); end if;
end $$;
create or replace function app.withdraw_health(p_person uuid, p_delete_load boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.people where id=p_person for update;
  update public.consents set withdrawn_at=now() where person_id=p_person and kind in ('health','parent_health') and withdrawn_at is null;
  -- An unused request must not unlock health again after a withdrawal.
  update app.parent_tokens set used_at=coalesce(used_at,now()) where person_id=p_person;
  update app.access_consent set health=false where user_id=(select user_id from public.people where id=p_person);
  update app.push_outbox set sent_at=now() where sent_at is null and kind in ('rate','review') and user_id=(select user_id from public.people where id=p_person);
  if p_delete_load then
    delete from public.load_entries where person_id=p_person;
    delete from public.load_summaries where person_id=p_person;
  end if;
end $$;
create or replace function public.withdraw_health_consent(p_person uuid, p_delete_load boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_me(p_person) then raise exception 'You can only change your own consent.' using errcode='insufficient_privilege'; end if;
  perform app.withdraw_health(p_person,p_delete_load);
end $$;
create or replace function public.create_parent_consent_token(p_person uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_year integer;
begin
  if not app.is_me(p_person) then raise exception 'You can only change your own consent.' using errcode='insufficient_privilege'; end if;
  select birth_year into v_year from public.people where id=p_person for update;
  if v_year is null or v_year<=extract(year from current_date)::integer-16 then
    raise exception 'Parental consent links are for players under 16.' using errcode='check_violation'; end if;
  update app.parent_tokens set used_at=now() where person_id=p_person and used_at is null;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into app.parent_tokens(token_hash,person_id) values(sha256(convert_to(v_token,'UTF8')),p_person);
  return v_token;
end $$;
create or replace function public.parent_consent_preview(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('firstName',p.first_name,'team',t.name,'club',c.name)
  from app.parent_tokens x join public.people p on p.id=x.person_id
  join public.memberships m on m.person_id=p.id and m.role='athlete'
  join public.teams t on t.id=m.team_id and t.archived_at is null
  join public.clubs c on c.id=p.club_id
  where length(p_token)=64 and x.token_hash=sha256(convert_to(p_token,'UTF8')) and x.used_at is null and x.expires_at>now() and x.attempts<10
  order by m.created_at limit 1
$$;
-- Return errors as data so failed attempts commit and cannot reset their own limit.
create or replace function public.confirm_parent_consent(p_token text,p_name text,p_email text,p_guardian boolean,p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v app.parent_tokens; v_email text:=lower(btrim(coalesce(p_email,''))); v_id uuid; v_withdraw text;
begin
  select * into v from app.parent_tokens where token_hash=sha256(convert_to(p_token,'UTF8')) and length(p_token)=64;
  if found then perform 1 from public.people where id=v.person_id for update; end if;
  select * into v from app.parent_tokens where token_hash=sha256(convert_to(p_token,'UTF8')) and length(p_token)=64 for update;
  if not found or v.used_at is not null or v.expires_at<=now() then return jsonb_build_object('error','This consent link is no longer valid.'); end if;
  if v.attempts>=10 then return jsonb_build_object('error','Too many attempts. Ask the player for a new link.'); end if;
  update app.parent_tokens set attempts=attempts+1 where token_hash=v.token_hash;
  if not coalesce(p_guardian,false) or p_version is distinct from '2026-10-08' or length(btrim(coalesce(p_name,''))) not between 2 and 120 or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('error','Enter your name and email and confirm you are a guardian.'); end if;
  if exists(select 1 from public.people p join auth.users u on u.id=p.user_id where p.id=v.person_id and
    (lower(btrim(u.email))=v_email or lower(btrim(u.raw_user_meta_data->>'email'))=v_email)) then
    return jsonb_build_object('error','Use a parent email different from the child account email.'); end if;
  -- Supabase can hold additional login identities; the local shim intentionally does not.
  if to_regclass('auth.identities') is not null then
    if exists(select 1 from public.people p where p.id=v.person_id and app.child_identity_email_matches(p.user_id,v_email)) then
      return jsonb_build_object('error','Use a parent email different from the child account email.'); end if;
  end if;
  perform 1 from public.people where id=v.person_id for update;
  insert into public.consents(person_id,kind,version,by_parent_name,by_parent_email) values(v.person_id,'parent_health',p_version,btrim(p_name),v_email) returning id into v_id;
  update app.parent_tokens set used_at=now() where token_hash=v.token_hash;
  v_withdraw:=encode(extensions.gen_random_bytes(32),'hex');
  insert into app.parent_withdrawals(token_hash,consent_id) values(sha256(convert_to(v_withdraw,'UTF8')),v_id);
  insert into app.push_outbox(user_id,kind,dedupe_key,title,body,url,send_after,text_key,text_params)
    select p.user_id,'consent','consent:'||v_id,'Your parent agreed','You can now rate sessions.','/athlete/home',app.push_quiet_shift(now()),'push.parentConsent','{}'::jsonb
    from public.people p where p.id=v.person_id and p.user_id is not null and exists(select 1 from public.push_subscriptions where user_id=p.user_id);
  return jsonb_build_object('withdrawToken',v_withdraw);
end $$;
create or replace function app.child_identity_email_matches(p_user uuid,p_email text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v boolean:=false;
begin
  if to_regclass('auth.identities') is not null then
    execute 'select exists(select 1 from auth.identities where user_id=$1 and lower(btrim(identity_data->>''email''))=$2)' into v using p_user,p_email;
  end if;
  return v;
end $$;
create or replace function public.withdraw_parent_consent(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_person uuid;
begin
  select c.person_id into v_person from app.parent_withdrawals w join public.consents c on c.id=w.consent_id
    where length(p_token)=64 and w.token_hash=sha256(convert_to(p_token,'UTF8')) and c.withdrawn_at is null;
  if v_person is null then return false; end if;
  perform app.withdraw_health(v_person,false);
  return true;
end $$;

-- Enforce consent even through direct table writes and security-definer functions.
create or replace function app.require_health_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_person uuid;
begin
  if tg_table_name='availability_reasons' then v_person:=app.person_of_availability(new.availability_id);
  elsif tg_table_name='absence_reasons' then v_person:=app.person_of_absence(new.absence_id);
  else v_person:=new.person_id; end if;
  perform 1 from public.people where id=v_person for update;
  if not app.health_active(v_person) then raise exception 'Health consent is required.' using errcode='check_violation'; end if;
  return new;
end $$;
create trigger load_entries_consent before insert or update on public.load_entries for each row execute function app.require_health_consent();
create trigger load_summaries_consent before insert or update on public.load_summaries for each row execute function app.require_health_consent();
create trigger athlete_plans_consent before insert or update on public.athlete_plans for each row execute function app.require_health_consent();
create trigger availability_reasons_consent before insert or update on public.availability_reasons for each row execute function app.require_health_consent();
create trigger absence_reasons_consent before insert or update on public.absence_reasons for each row execute function app.require_health_consent();
-- Own historic data stays readable/exportable; coaches stop seeing it after withdrawal.
create policy load_entries_consent_read on public.load_entries as restrictive for select to authenticated using(app.is_me(person_id) or app.health_active(person_id));
create policy load_summaries_consent_read on public.load_summaries as restrictive for select to authenticated using(app.is_me(person_id) or app.health_active(person_id));
create policy athlete_plans_consent_read on public.athlete_plans as restrictive for select to authenticated using(app.is_me(person_id) or app.health_active(person_id));
create policy load_reviews_consent_read on public.load_entry_reviews as restrictive for select to authenticated using(app.is_me(person_id) or app.health_active(person_id));
create policy availability_reason_consent_read on public.availability_reasons as restrictive for select to authenticated using(app.is_me(app.person_of_availability(availability_id)) or app.health_active(app.person_of_availability(availability_id)));
create policy absence_reason_consent_read on public.absence_reasons as restrictive for select to authenticated using(app.is_me(app.person_of_absence(absence_id)) or app.health_active(app.person_of_absence(absence_id)));

create or replace function public.join_team(p_code text, p_first_name text, p_last_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_team public.teams;
  v_person uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  perform app.assert_access_consent(false);
  select t.* into v_team from public.team_join_codes c join public.teams t on t.id = c.team_id
  where c.code = upper(btrim(p_code));
  if not found then
    raise exception 'This join code does not exist.' using errcode = 'no_data_found';
  end if;
  if v_team.archived_at is not null then
    raise exception 'This team is no longer active.' using errcode = 'no_data_found';
  end if;

  select p.id into v_person from public.people p where p.user_id = v_user and p.club_id = v_team.club_id;
  if v_person is null then
    if exists (select 1 from public.people p where p.user_id = v_user) then
      raise exception 'Your account already belongs to another club.' using errcode = 'unique_violation';
    end if;
    if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then
      raise exception 'First and last name are required.' using errcode = 'check_violation';
    end if;
    insert into public.people (club_id, user_id, first_name, last_name)
    values (v_team.club_id, v_user, btrim(p_first_name), btrim(p_last_name))
    returning id into v_person;
  end if;

  perform app.apply_player_consent(v_person);
  insert into public.memberships (person_id, team_id, role)
  values (v_person, v_team.id, 'athlete')
  on conflict (person_id, team_id, role) do nothing;
  return v_team.id;
end $$;

create or replace function public.accept_staff_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_staff public.staff_invites;
  v_role_invite public.club_role_invites;
  v_person_id uuid;
  v_result uuid;
  v_placeholder public.people;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  perform app.assert_access_consent(true);
  select * into v_staff from public.staff_invites where token = p_token for update;
  if found then
    if v_staff.accepted_at is not null or v_staff.expires_at < now() then
      raise exception 'This invitation is no longer valid.' using errcode = 'no_data_found';
    end if;
    v_person_id := v_staff.person_id;
    v_result := v_staff.team_id;
  else
    select * into v_role_invite from public.club_role_invites where token = p_token for update;
    if not found or v_role_invite.accepted_at is not null or v_role_invite.expires_at < now() then
      raise exception 'This invitation is no longer valid.' using errcode = 'no_data_found';
    end if;
    select cr.person_id, cr.club_id into v_person_id, v_result from public.club_roles cr where cr.id = v_role_invite.club_role_id;
  end if;

  select * into v_placeholder from public.people where id = v_person_id for update;
  if v_placeholder.user_id is not null then
    raise exception 'This invitation has already been accepted.' using errcode = 'unique_violation';
  end if;

  select p.id into v_existing from public.people p where p.user_id = v_user and p.club_id = v_placeholder.club_id;
  if v_existing is null and exists (select 1 from public.people p where p.user_id = v_user) then
    raise exception 'Your account already belongs to another club.' using errcode = 'unique_violation';
  end if;
  if v_existing is null then
    update public.people set user_id = v_user where id = v_placeholder.id;
  else
    -- Move the placeholder's memberships and club roles over, unless the
    -- person already has them, then drop the placeholder.
    update public.memberships m set person_id = v_existing
    where m.person_id = v_placeholder.id
      and not exists (
        select 1 from public.memberships x
        where x.person_id = v_existing and x.team_id = m.team_id and x.role = m.role
      );
    update public.club_roles c set person_id = v_existing
    where c.person_id = v_placeholder.id
      and not exists (
        select 1 from public.club_roles x
        where x.person_id = v_existing and x.role = c.role and coalesce(x.department_id, x.club_id) = coalesce(c.department_id, c.club_id)
      );
    delete from public.people where id = v_placeholder.id;
  end if;

  if v_staff.token is not null then
    update public.staff_invites set accepted_at = now() where token = p_token;
  else
    update public.club_role_invites set accepted_at = now() where token = p_token;
  end if;
  return v_result;
end $$;

create or replace function public.found_club(
  p_code text, p_club_name text, p_city text, p_first_name text, p_last_name text,
  p_department_name text, p_team_name text, p_coach_team boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code public.founding_codes;
  v_club uuid;
  v_department uuid;
  v_team uuid;
  v_person uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  perform app.assert_access_consent(true);
  select * into v_code from public.founding_codes where code = upper(replace(btrim(p_code), '-', '')) for update;
  if not found then
    raise exception 'This founding code does not exist.' using errcode = 'no_data_found';
  end if;
  if v_code.used_at is not null then
    raise exception 'This founding code has already been used.' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from public.people where user_id = v_user) then
    raise exception 'Your account already belongs to a club.' using errcode = 'unique_violation';
  end if;
  if btrim(coalesce(p_club_name, '')) = '' or btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = ''
     or btrim(coalesce(p_department_name, '')) = '' or btrim(coalesce(p_team_name, '')) = '' then
    raise exception 'Club, department, team and your name are required.' using errcode = 'check_violation';
  end if;

  insert into public.clubs (name, city) values (btrim(p_club_name), btrim(coalesce(p_city, ''))) returning id into v_club;
  insert into public.departments (club_id, name) values (v_club, btrim(p_department_name)) returning id into v_department;
  insert into public.people (club_id, user_id, first_name, last_name)
  values (v_club, v_user, btrim(p_first_name), btrim(p_last_name)) returning id into v_person;
  insert into public.club_roles (club_id, person_id, role) values (v_club, v_person, 'admin');
  -- Role templates and the join code come from the team triggers.
  insert into public.teams (club_id, department_id, name) values (v_club, v_department, btrim(p_team_name)) returning id into v_team;
  if p_coach_team then
    insert into public.memberships (person_id, team_id, role, coach_role_id)
    select v_person, v_team, 'coach', r.id from public.coach_roles r where r.team_id = v_team and r.locked;
  end if;

  update public.founding_codes set used_at = now(), used_by = v_user, club_id = v_club where code = v_code.code;
  return v_club;
end $$;

create or replace function app.refresh_load_summaries(p_today date default (now() at time zone 'Europe/Berlin')::date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.load_summaries (person_id, acwr, chronic_full, updated_at)
  select p.id, s.acwr, s.chronic_full, now()
  from public.people p
  cross join lateral app.load_summary(p.id, p_today) s
  where app.person_has_load(p.id) and app.health_active(p.id)
    and exists (select 1 from public.load_entries e where e.person_id = p.id)
  on conflict (person_id) do update
    set acwr = excluded.acwr, chronic_full = excluded.chronic_full, updated_at = excluded.updated_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function app.push_enqueue_due(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Are you in? (no answer yet, not away, from 24 h before, not later than 2 h before)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'reminder', s.id, 'reminder:' || s.id || ':' || r.user_id,
         'Are you in?',
         t.name || ' · ' || s.title || ', ' || app.push_when(s.starts_at) || '. Tap to answer.',
         '/athlete/home',
         app.push_quiet_shift(p_now),
         'push.reminder',
         jsonb_build_object('team', t.name, 'title', s.title, 'at', s.starts_at)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.starts_at > p_now + interval '2 hours' and s.starts_at <= p_now + interval '24 hours'
    and app.push_quiet_shift(p_now) <= s.starts_at - interval '1 hour'
    and not exists (select 1 from public.availability a where a.session_id = s.id and a.person_id = r.person_id)
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
  on conflict (dedupe_key) do nothing;

  -- Coach overview, 2 h before (to coaches who may see attendance)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select c.user_id, 'summary', s.id, 'summary:' || s.id || ':' || c.user_id,
         t.name || ' · ' || s.title || ' at ' || to_char(s.starts_at at time zone 'Europe/Berlin', 'HH24:MI'),
         concat_ws(' · ',
           counts.present || ' in',
           case when counts.late > 0 then counts.late || ' late' end,
           counts.absent || ' out',
           counts.open || ' no answer'),
         '/coach/today',
         app.push_quiet_shift(p_now),
         'push.summary',
         jsonb_build_object('team', t.name, 'title', s.title, 'at', s.starts_at,
           'in', counts.present, 'late', counts.late, 'out', counts.absent, 'open', counts.open)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null
  cross join lateral (
    select distinct p.user_id
    from public.memberships m
    join public.people p on p.id = m.person_id and p.user_id is not null
    join public.coach_roles cr on cr.id = m.coach_role_id
    where m.team_id = s.team_id and m.role = 'coach'
      and (cr.locked or 'viewAttendance' = any (cr.permissions))
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  ) c
  cross join lateral (
    select count(*) filter (where a.status = 'in' or (a.status is null and not away and ap.rsvp_mode = 'auto')) as present,
           count(*) filter (where a.status = 'late') as late,
           count(*) filter (where a.status in ('out', 'missed') or (a.status is null and away)) as absent,
           count(*) filter (where a.status is null and not away and ap.rsvp_mode = 'manual') as open
    from public.memberships m
    join public.people ap on ap.id = m.person_id
    left join public.availability a on a.session_id = s.id and a.person_id = m.person_id
    cross join lateral (select app.absent_for_session(m.person_id, s.id) as away) x
    where m.team_id = s.team_id and m.role = 'athlete'
      and (cardinality(s.group_ids) = 0 or exists (
        select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (s.group_ids)
      ))
      and app.squad_status(m.person_id, s.id) is distinct from 'not_selected'
  ) counts
  where s.starts_at > p_now + interval '30 minutes' and s.starts_at <= p_now + interval '2 hours'
    and app.push_quiet_shift(p_now) < s.starts_at
  on conflict (dedupe_key) do nothing;

  -- How hard was it? Right after the end, also in quiet hours (it has priority).
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'rate', s.id, 'rate:' || s.id || ':' || r.user_id,
         'How hard was it?',
         s.title || ' (' || t.name || ') is over. Rate it in a few seconds.',
         '/athlete/home',
         p_now,
         'push.rate',
         jsonb_build_object('team', t.name, 'title', s.title)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null and 'load' = any (t.features)
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.ends_at <= p_now and s.ends_at > p_now - interval '12 hours'
    and app.health_active(r.person_id)
    and r.joined_at <= s.ends_at
    and not exists (
      select 1 from public.availability a
      where a.session_id = s.id and a.person_id = r.person_id and a.status in ('out', 'missed')
    )
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
    and not exists (select 1 from public.load_entries le where le.session_id = s.id and le.person_id = r.person_id)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function app.push_session_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.starts_at <= now()
       or (new.starts_at = old.starts_at and new.ends_at = old.ends_at
           and new.facility_id is not distinct from old.facility_id
           and new.meet_minutes_before is not distinct from old.meet_minutes_before
           and new.meet_point is not distinct from old.meet_point
           and new.venue_address is not distinct from old.venue_address
           and new.home_away is not distinct from old.home_away) then
      return null;
    end if;
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
    select r.user_id, 'changed', new.id, 'changed:' || new.id || ':' || r.user_id,
           'Session changed: ' || t.name,
           concat_ws(' · ',
             new.title || coalesce(' vs ' || new.opponent, '') || ' · now ' || app.push_when(new.starts_at) || case when new.session_type='game' then '' else '–' || to_char(new.ends_at at time zone 'Europe/Berlin', 'HH24:MI') end,
             coalesce(f.name, case when new.home_away = 'away' then coalesce(nullif(new.venue_address, ''), 'away') end),
             nullif(app.push_meet_text(new.starts_at, new.meet_minutes_before, new.meet_point), '')),
           '/athlete/calendar',
           app.push_quiet_shift(now() + interval '2 minutes'),
           'push.changed',
           jsonb_build_object('team', t.name, 'title', new.title, 'opponent', new.opponent, 'at', new.starts_at, 'ends_at', case when new.session_type='game' then null else new.ends_at end, 'session_type', new.session_type,
             'facility', f.name, 'venue', nullif(new.venue_address, ''), 'away', new.home_away = 'away',
             'meet_minutes', new.meet_minutes_before, 'meet_point', nullif(btrim(new.meet_point), ''))
    from app.push_players(new.team_id, new.group_ids) r
    join public.teams t on t.id = new.team_id
    left join public.facilities f on f.id = new.facility_id
    on conflict (dedupe_key) do update
      set title = excluded.title, body = excluded.body, send_after = excluded.send_after,
          text_key = excluded.text_key, text_params = excluded.text_params,
          sent_at = null, claimed_at = null, attempts = 0;
  else
    delete from app.push_outbox where session_id = old.id and sent_at is null;
    if old.starts_at <= now() then
      return null;
    end if;
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
    select r.user_id, 'cancelled', old.id, 'cancelled:' || old.id || ':' || r.user_id,
           'Session cancelled: ' || t.name,
           old.title || coalesce(' vs ' || old.opponent, '') || ' on ' || app.push_when(old.starts_at) || ' is cancelled.',
           '/athlete/calendar',
           app.push_quiet_shift(now()),
           'push.cancelled',
           jsonb_build_object('team', t.name, 'title', old.title, 'opponent', old.opponent, 'at', old.starts_at)
    from app.push_players(old.team_id, old.group_ids) r
    join public.teams t on t.id = old.team_id
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end $$;

alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check check (kind in ('changed','cancelled','reminder','summary','rate','review','report','digest','squad','message','important','joined','carpool','consent'));

create or replace function public.push_take_due(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  perform app.assert_dispatch_secret(p_secret);

  -- Answered in the meantime: no reminder, no rating prompt.
  update app.push_outbox o set sent_at = now()
  where o.sent_at is null and o.send_after <= now()
    and (
      (o.kind in ('rate','review') and not exists(select 1 from public.people p where p.user_id=o.user_id and app.health_active(p.id)))
      or (o.kind = 'reminder' and exists (
        select 1 from public.availability a join public.people p on p.id = a.person_id
        where a.session_id = o.session_id and p.user_id = o.user_id))
      or (o.kind = 'rate' and exists (
        select 1 from public.load_entries le join public.people p on p.id = le.person_id
        where le.session_id = o.session_id and p.user_id = o.user_id))
      or (o.kind = 'rate' and exists (
        select 1 from public.availability a join public.people p on p.id = a.person_id
        where a.session_id = o.session_id and p.user_id = o.user_id and a.status in ('out', 'missed')))
      -- Switched off on every device since.
      or not exists (select 1 from public.push_subscriptions s where s.user_id = o.user_id)
      -- Switched off for this kind (the rating prompt cannot be).
      or (o.kind <> 'rate' and exists (
        select 1 from public.notification_settings n where n.user_id = o.user_id and o.kind = any (n.muted_kinds)))
    );

  -- The person's quiet hours: wait (the rating prompt goes out anyway).
  update app.push_outbox o set send_after = app.push_quiet_until(now(), o.user_id)
  where o.sent_at is null and o.send_after <= now() and o.kind <> 'rate'
    and app.push_quiet_until(now(), o.user_id) > now();

  -- Too late after waiting.
  update app.push_outbox o set sent_at = now()
  from public.sessions s
  where s.id = o.session_id and o.sent_at is null
    and ((o.kind = 'reminder' and o.send_after > s.starts_at - interval '1 hour')
      or (o.kind = 'summary' and o.send_after >= s.starts_at));

  with due as (
    select id from app.push_outbox
    where sent_at is null and send_after <= now() and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by send_after
    limit 100
    for update skip locked
  )
  update app.push_outbox o set claimed_at = now()
  from due where o.id = due.id;

  select array_agg(id) into v_ids from app.push_outbox where claimed_at >= now() and sent_at is null;

  return jsonb_build_object(
    'vapid', jsonb_build_object(
      'public_key', (select value from app.push_config where key = 'vapid_public_key'),
      'private_key', (select value from app.push_config where key = 'vapid_private_key'),
      'subject', (select value from app.push_config where key = 'vapid_subject')
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'outbox_id', o.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
        'payload', jsonb_build_object('title', o.title, 'body', o.body, 'url', o.url, 'tag', o.kind || ':' || coalesce(o.session_id::text, o.id::text)),
        -- The dispatcher writes title and body in this language when it has the texts.
        'locale', u.raw_user_meta_data ->> 'locale', 'text_key', o.text_key, 'text_params', o.text_params
      ))
      from app.push_outbox o
      join public.push_subscriptions s on s.user_id = o.user_id
      left join auth.users u on u.id = o.user_id
      where o.id = any (coalesce(v_ids, '{}'))
    ), '[]'::jsonb)
  );
end $$;

-- Portability/access: always derives the subject from auth.uid(), never a caller ID.
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_people uuid[]; v_result jsonb; v_table text; v_rows jsonb;
begin
  if v_user is null then raise exception 'Not signed in.' using errcode='insufficient_privilege'; end if;
  select coalesce(array_agg(id),'{}') into v_people from public.people where user_id=v_user;
  v_result:=jsonb_build_object('version','2026-10-08','exported_at',now(),
    'account',(select jsonb_build_object('id',id,'email',email,'metadata',raw_user_meta_data) from auth.users where id=v_user),
    'people',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.people p where id=any(v_people)),
    'consents',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.consents c where user_id=v_user or person_id=any(v_people)),
    'messages_authored',(select coalesce(jsonb_agg(to_jsonb(m)-'poll_counts'),'[]') from public.messages m where author_id=any(v_people)),
    'push_subscriptions',(select coalesce(jsonb_agg(to_jsonb(s)-'p256dh'-'auth'),'[]') from public.push_subscriptions s where user_id=v_user),
    'calendar_connection',(select to_jsonb(c)-'secret_id' from app.calendar_connections c where user_id=v_user),
    'error_reports',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from app.error_reports r where user_id=v_user),
    'availability_reasons',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.availability_reasons r join public.availability a on a.id=r.availability_id where a.person_id=any(v_people)),
    'absence_reasons',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.absence_reasons r join public.absences a on a.id=r.absence_id where a.person_id=any(v_people)),
    'carpools',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.carpools c where driver_id=any(v_people)));
  foreach v_table in array array['memberships','club_roles','availability','absences','load_entries','load_summaries','athlete_plans','acknowledged_sessions','load_entry_reviews','attendance_confirmations','squad_entries','message_votes','message_reads','message_writers','player_group_members','carpool_riders','carpool_requests'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where person_id=any($1)',v_table) into v_rows using v_people;
    v_result:=v_result||jsonb_build_object(v_table,v_rows);
  end loop;
  foreach v_table in array array['notification_settings','calendar_sources','private_events'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where user_id=$1',v_table) into v_rows using v_user;
    v_result:=v_result||jsonb_build_object(v_table,v_rows);
  end loop;
  return v_result;
end $$;

revoke all on function app.team_age_default(),app.health_active(uuid),public.health_consent_active(uuid),
  public.record_access_consent(text,integer,boolean,boolean),app.signup_consent(),app.assert_access_consent(boolean),app.apply_player_consent(uuid),
  public.give_health_consent(uuid,text),app.withdraw_health(uuid,boolean),public.withdraw_health_consent(uuid,boolean),
  public.create_parent_consent_token(uuid),public.parent_consent_preview(text),public.confirm_parent_consent(text,text,text,boolean,text),
  app.child_identity_email_matches(uuid,text),public.withdraw_parent_consent(text),app.require_health_consent(),public.export_my_data()
from public,anon,authenticated;
grant execute on function app.health_active(uuid),public.health_consent_active(uuid),
  public.record_access_consent(text,integer,boolean,boolean),public.give_health_consent(uuid,text),public.withdraw_health_consent(uuid,boolean),
  public.create_parent_consent_token(uuid),public.export_my_data() to authenticated;
grant execute on function public.parent_consent_preview(text),public.confirm_parent_consent(text,text,text,boolean,text),public.withdraw_parent_consent(text) to anon,authenticated;

create or replace function public.save_my_birth_year(p_person uuid,p_year integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_year integer;
begin
  if not app.is_me(p_person) then raise exception 'You can only change your own consent.' using errcode='insufficient_privilege'; end if;
  select birth_year into v_year from public.people where id=p_person for update;
  if p_year is null or p_year<1900 or p_year>extract(year from current_date)::integer then raise exception 'Enter a valid birth year.' using errcode='check_violation'; end if;
  if v_year is not null and v_year<>p_year then raise exception 'Contact the operator to correct your birth year.' using errcode='check_violation'; end if;
  update public.people set birth_year=p_year where id=p_person;
end $$;
revoke all on function public.save_my_birth_year(uuid,integer) from public,anon,authenticated;
grant execute on function public.save_my_birth_year(uuid,integer) to authenticated;
