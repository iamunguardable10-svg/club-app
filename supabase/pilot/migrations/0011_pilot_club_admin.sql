-- Club administration (piece 8a, decided 2026-09-24).
--
-- - A club is founded in the app with a one-time founding code. Only the
--   platform owner creates codes (app.create_founding_code, SQL only); the
--   founder becomes club admin, optionally Head Coach of the first team.
-- - Club roles: `admin` (whole club) and `department_lead` (one department).
--   A person can hold them next to coach or athlete memberships.
-- - Admins manage departments, teams, halls and invitations in the club;
--   department leads do the same for teams of their department (not
--   departments, not other leads).
-- - In the teams they manage they get the management rights (staff, halls,
--   sessions, weekly series, groups), never player data (roster,
--   attendance, reasons, load, plans) unless they also coach the team.
-- - Teams are archived, not deleted.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.club_roles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null check (role in ('admin', 'department_lead')),
  department_id uuid references public.departments (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((role = 'admin') = (department_id is null))
);
create unique index club_roles_unique on public.club_roles (person_id, role, coalesce(department_id, club_id));
create index club_roles_club on public.club_roles (club_id);
create index club_roles_department on public.club_roles (department_id);

-- Invitation links for people added to a club role by name (like staff).
create table public.club_role_invites (
  token uuid primary key default gen_random_uuid(),
  club_role_id uuid not null references public.club_roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz
);
create index club_role_invites_role on public.club_role_invites (club_role_id);

-- One-time codes to found a club. Never readable from the app.
create table public.founding_codes (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  note text,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  club_id uuid references public.clubs (id) on delete set null
);

alter table public.teams add column archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------

create or replace function app.check_club_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.people p where p.id = new.person_id and p.club_id = new.club_id) then
    raise exception 'This person belongs to another club.' using errcode = 'check_violation';
  end if;
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.club_id = new.club_id
  ) then
    raise exception 'This department belongs to another club.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger club_roles_scope before insert or update on public.club_roles
  for each row execute function app.check_club_role();

-- A club always keeps an admin (checked at the end of the transaction, and
-- not once the club itself is gone).
create or replace function app.assert_club_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_club uuid := coalesce(new.club_id, old.club_id);
begin
  if exists (select 1 from public.clubs where id = v_club)
     and not exists (select 1 from public.club_roles where club_id = v_club and role = 'admin') then
    raise exception 'The club needs at least one admin.' using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger club_roles_keep_admin after update or delete on public.club_roles
  deferrable initially deferred for each row execute function app.assert_club_admin();

-- Teams created or changed from the app: features come from the subscription
-- (the database), never from the client; name and archiving only by those
-- who manage the team. The owner (no signed-in user) is not restricted.
create or replace function app.check_team_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.features := array['load'];
    new.archived_at := null;
    if not exists (select 1 from public.departments d where d.id = new.department_id and d.club_id = new.club_id) then
      raise exception 'This department belongs to another club.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if (new.name is distinct from old.name or new.archived_at is distinct from old.archived_at)
     and not app.manages_team(old.id) then
    raise exception 'Only the club admin or the department lead may rename or archive a team.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Who manages what
-- ---------------------------------------------------------------------------

create or replace function app.is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_roles cr join public.people p on p.id = cr.person_id
    where cr.club_id = p_club and cr.role = 'admin' and p.user_id = auth.uid()
  )
$$;

create or replace function app.is_club_staff(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_roles cr join public.people p on p.id = cr.person_id
    where cr.club_id = p_club and p.user_id = auth.uid()
  )
$$;

create or replace function app.manages_department(p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.departments d
    join public.club_roles cr on cr.club_id = d.club_id
    join public.people p on p.id = cr.person_id
    where d.id = p_department and p.user_id = auth.uid()
      and (cr.role = 'admin' or cr.department_id = d.id)
  )
$$;

create or replace function app.manages_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teams t where t.id = p_team and app.manages_department(t.department_id))
$$;

create trigger teams_write_rules before insert or update on public.teams
  for each row execute function app.check_team_write();

-- Management rights in managed teams; player data only through a coach role.
create or replace function app.team_permissions(p_team uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct perm), '{}') from (
    select unnest(case when r.locked then app.all_permissions() else r.permissions end) as perm
    from public.memberships m
    join public.people p on p.id = m.person_id
    join public.coach_roles r on r.id = m.coach_role_id
    where m.team_id = p_team and m.role = 'coach' and p.user_id = auth.uid()
    union
    select unnest(array['editSessions', 'planSeries', 'manageGroups', 'manageFacilities', 'manageStaff'])
    where app.manages_team(p_team)
  ) granted
  where perm not in ('viewLoadSummary', 'viewLoadDetails', 'viewAthletePlans') or app.team_has_load(p_team)
$$;

-- Reading the team (sessions, groups, staff, roles, series) also for those
-- who manage it. None of these helpers opens player data.
create or replace function app.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.team_id = p_team and p.user_id = auth.uid()
  ) or app.manages_team(p_team)
$$;

create or replace function app.is_team_coach(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.people p on p.id = m.person_id
    where m.team_id = p_team and m.role = 'coach' and p.user_id = auth.uid()
  ) or app.manages_team(p_team)
$$;

create or replace function app.is_club_coach(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.people p on p.id = m.person_id
    join public.teams t on t.id = m.team_id
    where t.club_id = p_club and m.role = 'coach' and p.user_id = auth.uid()
  ) or app.is_club_staff(p_club)
$$;

create or replace function app.facility_manager_department_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct t.department_id
  from public.memberships m
  join public.people p on p.id = m.person_id
  join public.teams t on t.id = m.team_id
  where m.role = 'coach' and p.user_id = auth.uid() and app.has_perm(t.id, 'manageFacilities')
  union
  select d.id from public.departments d where app.manages_department(d.id)
$$;

-- A team keeps someone who may manage its staff: a coach with the right, or
-- the club admin / department lead above it.
create or replace function app.team_has_staff_manager(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.coach_roles r on r.id = m.coach_role_id
    where m.team_id = p_team and m.role = 'coach'
      and (r.locked or 'manageStaff' = any (r.permissions))
  ) or exists (
    select 1 from public.teams t
    join public.club_roles cr on cr.club_id = t.club_id and (cr.role = 'admin' or cr.department_id = t.department_id)
    where t.id = p_team
  )
$$;

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------

alter table public.club_roles enable row level security;
alter table public.club_role_invites enable row level security;
alter table public.founding_codes enable row level security;
revoke all on public.club_roles, public.club_role_invites, public.founding_codes from anon, authenticated;
grant select, insert, delete on public.club_roles to authenticated;
grant select, insert, delete on public.club_role_invites to authenticated;

create policy club_roles_read on public.club_roles for select to authenticated
  using (app.is_me(person_id) or app.is_club_staff(club_id));
create policy club_roles_insert on public.club_roles for insert to authenticated
  with check (app.is_club_admin(club_id));
create policy club_roles_delete on public.club_roles for delete to authenticated
  using (app.is_club_admin(club_id));

create policy club_role_invites_read on public.club_role_invites for select to authenticated
  using (exists (select 1 from public.club_roles cr where cr.id = club_role_id and app.is_club_admin(cr.club_id)));
create policy club_role_invites_create on public.club_role_invites for insert to authenticated
  with check (accepted_at is null and exists (select 1 from public.club_roles cr where cr.id = club_role_id and app.is_club_admin(cr.club_id)));
create policy club_role_invites_revoke on public.club_role_invites for delete to authenticated
  using (exists (select 1 from public.club_roles cr where cr.id = club_role_id and app.is_club_admin(cr.club_id)));

-- Departments: the admin creates and renames them.
grant insert, update (name) on public.departments to authenticated;
create policy departments_create on public.departments for insert to authenticated
  with check (app.is_club_admin(club_id));
create policy departments_rename on public.departments for update to authenticated
  using (app.is_club_admin(club_id)) with check (app.is_club_admin(club_id));

-- Teams: created by whoever manages the department; renamed and archived by
-- them (enforced in app.check_team_write, since the default hall shares the
-- update policy with manageFacilities).
grant insert on public.teams to authenticated;
grant update (name, archived_at) on public.teams to authenticated;
create policy teams_create on public.teams for insert to authenticated
  with check (app.manages_department(department_id));
drop policy if exists teams_default_facility on public.teams;
create policy teams_update on public.teams for update to authenticated
  using (app.has_perm(id, 'manageFacilities') or app.manages_team(id))
  with check (app.has_perm(id, 'manageFacilities') or app.manages_team(id));

-- People: staff and club-role holders are added by name; admins and leads
-- see the club's role holders.
drop policy if exists people_add_staff on public.people;
create policy people_add_staff on public.people for insert to authenticated
  with check (
    user_id is null
    and club_id in (select app.my_club_ids())
    and (
      app.is_club_admin(club_id)
      or exists (select 1 from public.teams t where t.club_id = people.club_id and app.has_perm(t.id, 'manageStaff'))
    )
  );

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (
    app.is_me(id)
    or exists (
      select 1 from public.memberships m
      where m.person_id = people.id
        and (
          (m.role = 'coach' and app.is_team_member(m.team_id))
          or (m.role = 'athlete' and app.has_perm(m.team_id, 'viewRoster'))
        )
    )
    or exists (select 1 from public.club_roles cr where cr.person_id = people.id and app.is_club_staff(cr.club_id))
  );

-- ---------------------------------------------------------------------------
-- Founding a club
-- ---------------------------------------------------------------------------

-- For the platform owner, in the SQL editor: select app.create_founding_code('for …');
create or replace function app.create_founding_code(p_note text default null) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text;
begin
  loop
    select string_agg(
      substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(bytes, i) % 32) + 1, 1), '' order by i
    ) into v_code
    from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') as bytes) b,
         generate_series(0, 9) as i;
    exit when not exists (select 1 from public.founding_codes where code = v_code);
  end loop;
  insert into public.founding_codes (code, note) values (v_code, p_note);
  return v_code;
end $$;
revoke all on function app.create_founding_code(text) from public, anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- One invitation link for staff and club roles
-- ---------------------------------------------------------------------------

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

-- What an invitation link is for, shown before signing up. For a club role,
-- `team_name` is the department (or the club) and `role_name` the role.
drop function if exists public.invite_preview(uuid);
create function public.invite_preview(p_token uuid)
returns table (club_name text, team_name text, first_name text, last_name text, role_name text, usable boolean)
language sql stable security definer set search_path = '' as $$
  select c.name, t.name, p.first_name, p.last_name, r.name,
         i.accepted_at is null and i.expires_at >= now() and p.user_id is null
  from public.staff_invites i
  join public.people p on p.id = i.person_id
  join public.teams t on t.id = i.team_id
  join public.clubs c on c.id = t.club_id
  left join public.memberships m on m.person_id = p.id and m.team_id = t.id and m.role = 'coach'
  left join public.coach_roles r on r.id = m.coach_role_id
  where i.token = p_token
  union all
  select c.name, coalesce(d.name, c.name), p.first_name, p.last_name,
         case cr.role when 'admin' then 'Club admin' else 'Department lead' end,
         i.accepted_at is null and i.expires_at >= now() and p.user_id is null
  from public.club_role_invites i
  join public.club_roles cr on cr.id = i.club_role_id
  join public.people p on p.id = cr.person_id
  join public.clubs c on c.id = cr.club_id
  left join public.departments d on d.id = cr.department_id
  where i.token = p_token
$$;

revoke all on function public.accept_staff_invite(uuid), public.invite_preview(uuid), public.found_club(text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.accept_staff_invite(uuid), public.found_club(text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.invite_preview(uuid) to anon, authenticated;
