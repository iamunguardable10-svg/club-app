-- Pilot schema, tables and integrity rules.
--
-- Derived from the local data model (src/shared/data/schema.ts), which is
-- what the app speaks; see docs/simplify-decisions.md, point 8. The schema
-- under supabase/migrations is the pre-pilot one and stays as reference only.
--
-- Access rules (row-level security) are in 0002_pilot_rls.sql. Nothing in
-- this file is readable or writable for app users until that file has run.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------

-- Must match COACH_PERMISSIONS in src/shared/data/schema.ts.
create or replace function app.all_permissions() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'viewRoster', 'viewAttendance', 'viewAbsenceReasons', 'viewLoadSummary', 'viewLoadDetails',
    'viewAthletePlans', 'editSessions', 'planSeries', 'manageGroups', 'manageFacilities', 'manageStaff'
  ]
$$;

-- ---------------------------------------------------------------------------
-- Club structure
-- ---------------------------------------------------------------------------

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  city text not null default '',
  country text not null default '',
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (btrim(name) <> '')
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  address text not null default '',
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  default_facility_id uuid references public.facilities (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.department_facilities (
  department_id uuid not null references public.departments (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  primary key (department_id, facility_id)
);

-- ---------------------------------------------------------------------------
-- People and roles
-- ---------------------------------------------------------------------------

-- A person exists before they have an account (staff added by name, athletes
-- before joining); `user_id` links them once they sign in.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  created_at timestamptz not null default now()
);

create table public.coach_roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  permissions text[] not null default '{}' check (permissions <@ app.all_permissions()),
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index coach_roles_team_name on public.coach_roles (team_id, lower(name));
-- At most one locked (Head Coach) role per team.
create unique index coach_roles_one_locked on public.coach_roles (team_id) where locked;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  role text not null check (role in ('coach', 'athlete')),
  coach_role_id uuid references public.coach_roles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (person_id, team_id, role),
  check (role = 'coach' or coach_role_id is null)
);

create table public.player_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (btrim(name) <> '')
);

create table public.player_group_members (
  group_id uuid not null references public.player_groups (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (group_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------

create table public.session_series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  session_type text not null check (session_type in ('training', 's_and_c', 'game', 'recovery', 'other')),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  facility_id uuid references public.facilities (id) on delete set null,
  group_ids uuid[] not null default '{}',
  active_from date,
  active_until date,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  session_type text not null check (session_type in ('training', 's_and_c', 'game', 'recovery', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  facility_id uuid references public.facilities (id) on delete set null,
  group_ids uuid[] not null default '{}',
  series_id uuid references public.session_series (id) on delete set null,
  series_week_start date,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index sessions_team_starts on public.sessions (team_id, starts_at);
create index sessions_facility_starts on public.sessions (facility_id, starts_at);

create table public.session_series_week_states (
  series_id uuid not null references public.session_series (id) on delete cascade,
  week_start date not null,
  checked boolean not null,
  committed_session_id uuid references public.sessions (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (series_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Athlete data
-- ---------------------------------------------------------------------------

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  status text not null check (status in ('in', 'late', 'out')),
  late_minutes integer check (late_minutes is null or late_minutes between 0 and 600),
  reported_at timestamptz not null default now(),
  unique (session_id, person_id)
);

-- Why someone is not coming is often about health. It lives in its own table
-- so it can be shared more narrowly than the status (viewAbsenceReasons
-- versus viewAttendance); row-level security has no per-column rules.
create table public.availability_reasons (
  availability_id uuid primary key references public.availability (id) on delete cascade,
  reason text not null
);

create table public.load_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  date date not null,
  starts_at timestamptz,
  title text not null,
  training_type text not null,
  rpe numeric not null check (rpe between 0 and 10),
  duration_minutes integer not null check (duration_minutes between 0 and 1440),
  load numeric not null check (load >= 0),
  note text,
  source text not null check (source in ('planned_session', 'solo', 'manual')),
  created_at timestamptz not null default now()
);

create index load_entries_person_date on public.load_entries (person_id, date);

-- The ACWR traffic light without the entries it comes from, for roles with
-- viewLoadSummary only. Written by the athlete's app whenever their entries
-- change or the app opens (it depends on today's date, so it can age).
create table public.load_summaries (
  person_id uuid primary key references public.people (id) on delete cascade,
  acwr double precision,
  chronic_full boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.athlete_plans (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  title text not null,
  date date not null,
  starts_at timestamptz,
  training_type text not null,
  expected_rpe numeric not null check (expected_rpe between 0 and 10),
  expected_duration_minutes integer not null check (expected_duration_minutes between 0 and 1440),
  note text,
  created_at timestamptz not null default now()
);

create table public.acknowledged_sessions (
  person_id uuid not null references public.people (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  primary key (person_id, session_id)
);

-- ---------------------------------------------------------------------------
-- Integrity rules that hold no matter who writes
-- ---------------------------------------------------------------------------

-- Sessions and series carry club and department for the calendars; they are
-- always taken from the team, never from the client.
create or replace function app.scope_from_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.club_id, t.department_id into new.club_id, new.department_id
  from public.teams t where t.id = new.team_id;
  return new;
end $$;

create trigger sessions_scope before insert or update of team_id, club_id, department_id on public.sessions
  for each row execute function app.scope_from_team();
create trigger session_series_scope before insert or update of team_id, club_id, department_id on public.session_series
  for each row execute function app.scope_from_team();

-- A session or series may only be put into a hall its team's department can
-- book. Checked when the hall is set or changed, so moving an existing
-- session in time never fails because a hall was unshared later.
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
    raise exception 'Diese Halle ist für die Abteilung des Teams nicht freigegeben.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger sessions_bookable before insert or update of facility_id, team_id on public.sessions
  for each row execute function app.check_bookable_facility();
create trigger session_series_bookable before insert or update of facility_id, team_id on public.session_series
  for each row execute function app.check_bookable_facility();

create or replace function app.check_team_default_facility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.default_facility_id is not null and not exists (
    select 1 from public.department_facilities df
    where df.department_id = new.department_id and df.facility_id = new.default_facility_id
  ) then
    raise exception 'Diese Halle ist für die Abteilung des Teams nicht freigegeben.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger teams_default_facility before insert or update of default_facility_id, department_id on public.teams
  for each row execute function app.check_team_default_facility();

-- Unsharing a hall with a department clears it as default for that
-- department's teams (existing sessions keep it).
create or replace function app.clear_defaults_on_unshare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.teams set default_facility_id = null
  where department_id = old.department_id and default_facility_id = old.facility_id;
  return old;
end $$;

create trigger department_facilities_unshare after delete on public.department_facilities
  for each row execute function app.clear_defaults_on_unshare();

-- Every team starts with the four role templates. Must match
-- COACH_ROLE_TEMPLATES in src/shared/data/seed.ts.
create or replace function app.create_role_templates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.coach_roles (team_id, name, permissions, locked, created_at) values
    (new.id, 'Head Coach', app.all_permissions(), true, now()),
    (new.id, 'Co-Trainer', app.all_permissions(), false, now() + interval '1 millisecond'),
    (new.id, 'Athletiktrainer', app.all_permissions(), false, now() + interval '2 milliseconds'),
    (new.id, 'Betreuer', array['viewRoster', 'viewAttendance'], false, now() + interval '3 milliseconds');
  return new;
end $$;

create trigger teams_role_templates after insert on public.teams
  for each row execute function app.create_role_templates();

-- Rights that need another one are completed on write, as in the data layer
-- (COACH_PERMISSION_REQUIRES). Locked roles always hold everything.
create or replace function app.normalize_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.locked then
    new.permissions := app.all_permissions();
  else
    if 'viewAbsenceReasons' = any (new.permissions) and not 'viewAttendance' = any (new.permissions) then
      new.permissions := array_append(new.permissions, 'viewAttendance');
    end if;
    if 'viewLoadDetails' = any (new.permissions) and not 'viewLoadSummary' = any (new.permissions) then
      new.permissions := array_append(new.permissions, 'viewLoadSummary');
    end if;
  end if;
  new.name := btrim(new.name);
  return new;
end $$;

create trigger coach_roles_normalize before insert or update on public.coach_roles
  for each row execute function app.normalize_role();

-- The Head Coach role can be neither changed nor removed, except together
-- with its team.
create or replace function app.protect_locked_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.locked then
    if new.name is distinct from old.name or new.locked is distinct from old.locked
       or new.team_id is distinct from old.team_id then
      raise exception 'Die Rolle Head Coach hat immer alle Rechte und lässt sich nicht ändern.' using errcode = 'check_violation';
    end if;
  elsif tg_op = 'UPDATE' and new.locked then
    raise exception 'Eine Rolle lässt sich nicht nachträglich sperren.' using errcode = 'check_violation';
  elsif tg_op = 'DELETE' and old.locked and exists (select 1 from public.teams where id = old.team_id) then
    raise exception 'Die Rolle Head Coach lässt sich nicht löschen.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;

create trigger coach_roles_protect before update or delete on public.coach_roles
  for each row execute function app.protect_locked_role();

-- A coach membership's role must belong to the same team.
create or replace function app.check_membership_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.coach_role_id is not null and not exists (
    select 1 from public.coach_roles r where r.id = new.coach_role_id and r.team_id = new.team_id
  ) then
    raise exception 'Diese Rolle gehört zu einem anderen Team.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger memberships_role_team before insert or update on public.memberships
  for each row execute function app.check_membership_role();

-- A team always keeps someone who may manage its staff. Checked after every
-- change to memberships or roles, at the end of the statement, and skipped
-- once the team itself is gone.
create or replace function app.team_has_staff_manager(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    join public.coach_roles r on r.id = m.coach_role_id
    where m.team_id = p_team and m.role = 'coach'
      and (r.locked or 'manageStaff' = any (r.permissions))
  )
$$;

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
    raise exception 'Das Team braucht mindestens eine Person, die Trainerrollen verwalten darf.' using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger memberships_keep_staff_manager after insert or update or delete on public.memberships
  deferrable initially deferred for each row execute function app.assert_staff_manager();
create constraint trigger coach_roles_keep_staff_manager after update or delete on public.coach_roles
  deferrable initially deferred for each row execute function app.assert_staff_manager();

-- A person's own availability report must be for a session of a team they
-- are an athlete in.
create or replace function app.check_availability_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.sessions s
    join public.memberships m on m.team_id = s.team_id and m.role = 'athlete'
    where s.id = new.session_id and m.person_id = new.person_id
  ) then
    raise exception 'Nur Spieler des Teams können sich für diese Einheit melden.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger availability_member before insert or update of session_id, person_id on public.availability
  for each row execute function app.check_availability_member();
