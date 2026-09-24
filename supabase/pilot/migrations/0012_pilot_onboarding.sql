-- Onboarding (piece 8b, 2026-09-24).
--
-- - A player's join link shows the club and team before an account exists:
--   public.join_code_preview (callable without signing in, names only).
-- - The founding page checks a founding code before an account exists:
--   public.founding_code_usable (yes or no, nothing else).
-- - join_team refuses archived teams, and join_team and accept_staff_invite
--   say plainly when the account already belongs to another club (one club
--   per account in the pilot; before, this surfaced as a unique violation).
-- - invite_preview says which kind of invitation it is (`staff` or `club`).

create or replace function public.join_code_preview(p_code text)
returns table (club_name text, team_name text, usable boolean)
language sql stable security definer set search_path = '' as $$
  select c.name, t.name, t.archived_at is null
  from public.team_join_codes j
  join public.teams t on t.id = j.team_id
  join public.clubs c on c.id = t.club_id
  where j.code = upper(btrim(p_code))
$$;

create or replace function public.founding_code_usable(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.founding_codes
    where code = upper(replace(btrim(p_code), '-', '')) and used_at is null
  )
$$;

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

drop function if exists public.invite_preview(uuid);
create function public.invite_preview(p_token uuid)
returns table (kind text, club_name text, team_name text, first_name text, last_name text, role_name text, usable boolean)
language sql stable security definer set search_path = '' as $$
  select 'staff', c.name, t.name, p.first_name, p.last_name, r.name,
         i.accepted_at is null and i.expires_at >= now() and p.user_id is null
  from public.staff_invites i
  join public.people p on p.id = i.person_id
  join public.teams t on t.id = i.team_id
  join public.clubs c on c.id = t.club_id
  left join public.memberships m on m.person_id = p.id and m.team_id = t.id and m.role = 'coach'
  left join public.coach_roles r on r.id = m.coach_role_id
  where i.token = p_token
  union all
  select 'club', c.name, coalesce(d.name, c.name), p.first_name, p.last_name,
         case cr.role when 'admin' then 'Club admin' else 'Department lead' end,
         i.accepted_at is null and i.expires_at >= now() and p.user_id is null
  from public.club_role_invites i
  join public.club_roles cr on cr.id = i.club_role_id
  join public.people p on p.id = cr.person_id
  join public.clubs c on c.id = cr.club_id
  left join public.departments d on d.id = cr.department_id
  where i.token = p_token
$$;

revoke all on function public.invite_preview(uuid) from public, anon;
grant execute on function public.invite_preview(uuid) to anon, authenticated;
revoke all on function public.join_code_preview(text), public.founding_code_usable(text) from public;
grant execute on function public.join_code_preview(text), public.founding_code_usable(text) to anon, authenticated;
