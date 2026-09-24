-- English messages.
--
-- The app's interface is English (decision of 2026-09-24), so the messages
-- the database raises for people to read are English too. The functions
-- below are unchanged apart from their messages (originals in 0001, 0004).

create or replace function app.check_bookable_facility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.facility_id is not null
     and (tg_op = 'INSERT' or new.facility_id is distinct from old.facility_id)
     and not exists (
       select 1 from public.department_facilities df
       join public.teams t on t.department_id = df.department_id
       where t.id = new.team_id and df.facility_id = new.facility_id
     ) then
    raise exception 'This hall is not shared with the team''s department.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function app.check_team_default_facility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.default_facility_id is not null and not exists (
    select 1 from public.department_facilities df
    where df.department_id = new.department_id and df.facility_id = new.default_facility_id
  ) then
    raise exception 'This hall is not shared with the team''s department.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function app.protect_locked_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.locked then
    if new.name is distinct from old.name or new.locked is distinct from old.locked
       or new.team_id is distinct from old.team_id then
      raise exception 'The Head Coach role always has every right and cannot be changed.' using errcode = 'check_violation';
    end if;
  elsif tg_op = 'UPDATE' and new.locked then
    raise exception 'A role cannot be locked afterwards.' using errcode = 'check_violation';
  elsif tg_op = 'DELETE' and old.locked and exists (select 1 from public.teams where id = old.team_id) then
    raise exception 'The Head Coach role cannot be deleted.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create or replace function app.check_membership_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.coach_role_id is not null and not exists (
    select 1 from public.coach_roles r where r.id = new.coach_role_id and r.team_id = new.team_id
  ) then
    raise exception 'This role belongs to another team.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function app.assert_staff_manager() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid := coalesce(new.team_id, old.team_id);
begin
  -- A role edited on a team without any staff yet (during setup) is fine;
  -- removing the last coach is not.
  if tg_table_name = 'coach_roles'
     and not exists (select 1 from public.memberships where team_id = v_team and role = 'coach') then
    return null;
  end if;
  if exists (select 1 from public.teams where id = v_team)
     and not app.team_has_staff_manager(v_team) then
    raise exception 'The team needs at least one person who may manage staff and roles.' using errcode = 'check_violation';
  end if;
  return null;
end $$;

create or replace function app.check_availability_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.sessions s
    join public.memberships m on m.team_id = s.team_id and m.role = 'athlete'
    where s.id = new.session_id and m.person_id = new.person_id
  ) then
    raise exception 'Only players of the team can report for this session.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function app.check_staff_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.person_id = new.person_id and m.team_id = new.team_id and m.role = 'coach'
  ) then
    raise exception 'Invitations are only for members of the staff.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.people p where p.id = new.person_id and p.user_id is not null) then
    raise exception 'This person already has an account.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

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
  select t.* into v_team from public.team_join_codes c join public.teams t on t.id = c.team_id
  where c.code = upper(btrim(p_code));
  if not found then
    raise exception 'This join code does not exist.' using errcode = 'no_data_found';
  end if;

  select p.id into v_person from public.people p where p.user_id = v_user and p.club_id = v_team.club_id;
  if v_person is null then
    if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then
      raise exception 'First and last name are required.' using errcode = 'check_violation';
    end if;
    insert into public.people (club_id, user_id, first_name, last_name)
    values (v_team.club_id, v_user, btrim(p_first_name), btrim(p_last_name))
    returning id into v_person;
  end if;

  insert into public.memberships (person_id, team_id, role)
  values (v_person, v_team.id, 'athlete')
  on conflict (person_id, team_id, role) do nothing;
  return v_team.id;
end $$;

create or replace function public.accept_staff_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_invite public.staff_invites;
  v_placeholder public.people;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_invite from public.staff_invites where token = p_token for update;
  if not found or v_invite.accepted_at is not null or v_invite.expires_at < now() then
    raise exception 'This invitation is no longer valid.' using errcode = 'no_data_found';
  end if;
  select * into v_placeholder from public.people where id = v_invite.person_id for update;
  if v_placeholder.user_id is not null then
    raise exception 'This invitation has already been accepted.' using errcode = 'unique_violation';
  end if;

  select p.id into v_existing from public.people p where p.user_id = v_user and p.club_id = v_placeholder.club_id;
  if v_existing is null then
    update public.people set user_id = v_user where id = v_placeholder.id;
  else
    -- Move the placeholder's memberships over, unless the person already has
    -- that role in that team, then drop the placeholder.
    update public.memberships m set person_id = v_existing
    where m.person_id = v_placeholder.id
      and not exists (
        select 1 from public.memberships x
        where x.person_id = v_existing and x.team_id = m.team_id and x.role = m.role
      );
    delete from public.people where id = v_placeholder.id;
  end if;

  update public.staff_invites set accepted_at = now() where token = p_token;
  return v_invite.team_id;
end $$;
