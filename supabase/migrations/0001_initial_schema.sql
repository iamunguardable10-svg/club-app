-- Club App / TeamLoad OS
-- Initial Supabase/PostgreSQL schema draft
--
-- This migration defines the V1 foundation:
-- - clubs, departments, teams
-- - membership-based roles
-- - invites
-- - sessions
-- - availability
-- - attendance
-- - load entries
-- - simple facilities
-- - simple activity events
--
-- Important principle:
-- Do not store one global user role. Access is derived from memberships.

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Updated-at helper
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Enum-like check helpers are implemented as text + check constraints for V1.
-- This keeps iteration easier than PostgreSQL enums during early product changes.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  avatar_url text,
  birth_year integer,
  primary_sport text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- clubs
-- -----------------------------------------------------------------------------

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  country text,
  city text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_clubs_updated_at
before update on public.clubs
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- departments
-- -----------------------------------------------------------------------------

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  sport text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name)
);

create index if not exists idx_departments_club_id on public.departments(club_id);

create trigger set_departments_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- teams
-- -----------------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  sport text,
  season text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, name, season)
);

create index if not exists idx_teams_club_id on public.teams(club_id);
create index if not exists idx_teams_department_id on public.teams(department_id);

create trigger set_teams_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- club_memberships
-- High-level club/department roles: club_admin, department_lead
-- -----------------------------------------------------------------------------

create table if not exists public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  role text not null check (role in ('club_admin', 'department_lead')),
  status text not null default 'active' check (status in ('active', 'inactive', 'invited')),
  created_at timestamptz not null default now(),
  constraint club_admin_has_no_department check (
    (role = 'club_admin' and department_id is null)
    or
    (role = 'department_lead' and department_id is not null)
  ),
  unique (user_id, club_id, department_id, role)
);

create index if not exists idx_club_memberships_user_id on public.club_memberships(user_id);
create index if not exists idx_club_memberships_club_id on public.club_memberships(club_id);
create index if not exists idx_club_memberships_department_id on public.club_memberships(department_id);

-- -----------------------------------------------------------------------------
-- team_memberships
-- Team-level roles: head_coach, assistant_coach, athlete
-- -----------------------------------------------------------------------------

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  role text not null check (role in ('head_coach', 'assistant_coach', 'athlete')),
  status text not null default 'active' check (status in ('active', 'inactive', 'invited')),
  joined_at timestamptz not null default now(),
  unique (user_id, team_id, role)
);

create index if not exists idx_team_memberships_user_id on public.team_memberships(user_id);
create index if not exists idx_team_memberships_club_id on public.team_memberships(club_id);
create index if not exists idx_team_memberships_department_id on public.team_memberships(department_id);
create index if not exists idx_team_memberships_team_id on public.team_memberships(team_id);

-- -----------------------------------------------------------------------------
-- invites
-- -----------------------------------------------------------------------------

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  role text not null check (role in ('department_lead', 'head_coach', 'assistant_coach', 'athlete')),
  invite_type text not null check (invite_type in ('department_lead_invite', 'coach_invite', 'athlete_invite')),
  created_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint invite_context_matches_type check (
    (invite_type = 'department_lead_invite' and role = 'department_lead' and department_id is not null and team_id is null)
    or
    (invite_type = 'coach_invite' and role in ('head_coach', 'assistant_coach') and department_id is not null)
    or
    (invite_type = 'athlete_invite' and role = 'athlete' and department_id is not null and team_id is not null)
  )
);

create index if not exists idx_invites_token on public.invites(token);
create index if not exists idx_invites_club_id on public.invites(club_id);
create index if not exists idx_invites_department_id on public.invites(department_id);
create index if not exists idx_invites_team_id on public.invites(team_id);
create index if not exists idx_invites_status on public.invites(status);

-- -----------------------------------------------------------------------------
-- facilities
-- Simple V1 facility model. Facilities belong to clubs.
-- -----------------------------------------------------------------------------

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, name)
);

create index if not exists idx_facilities_club_id on public.facilities(club_id);

create trigger set_facilities_updated_at
before update on public.facilities
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- sessions
-- V1 rule: one session belongs to one team.
-- -----------------------------------------------------------------------------

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  session_type text not null check (session_type in ('training', 'game', 's_and_c', 'recovery', 'video', 'meeting', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  facility_id uuid references public.facilities(id) on delete set null,
  location_text text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_ends_after_start check (ends_at is null or ends_at > starts_at)
);

create index if not exists idx_sessions_club_id on public.sessions(club_id);
create index if not exists idx_sessions_department_id on public.sessions(department_id);
create index if not exists idx_sessions_team_id on public.sessions(team_id);
create index if not exists idx_sessions_starts_at on public.sessions(starts_at);
create index if not exists idx_sessions_facility_id on public.sessions(facility_id);

create trigger set_sessions_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- session_participants
-- Planned participants. Generated from active memberships when sessions are made.
-- -----------------------------------------------------------------------------

create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_membership_id uuid references public.team_memberships(id) on delete set null,
  role text not null default 'athlete' check (role in ('athlete', 'head_coach', 'assistant_coach')),
  created_at timestamptz not null default now(),
  unique (session_id, user_id, role)
);

create index if not exists idx_session_participants_session_id on public.session_participants(session_id);
create index if not exists idx_session_participants_user_id on public.session_participants(user_id);

-- -----------------------------------------------------------------------------
-- availability
-- Athlete pre-session status.
-- -----------------------------------------------------------------------------

create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'expected' check (status in ('expected', 'late', 'maybe', 'out')),
  reason text,
  late_minutes integer check (late_minutes is null or late_minutes >= 0),
  note text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_availability_session_id on public.availability(session_id);
create index if not exists idx_availability_user_id on public.availability(user_id);
create index if not exists idx_availability_status on public.availability(status);

create trigger set_availability_updated_at
before update on public.availability
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- attendance_records
-- Coach-finalized attendance.
-- -----------------------------------------------------------------------------

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  final_status text not null check (final_status in ('present', 'late', 'partial', 'excused_absent', 'unexcused_absent')),
  minutes_participated integer check (minutes_participated is null or minutes_participated >= 0),
  note text,
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_attendance_records_session_id on public.attendance_records(session_id);
create index if not exists idx_attendance_records_user_id on public.attendance_records(user_id);
create index if not exists idx_attendance_records_final_status on public.attendance_records(final_status);

-- -----------------------------------------------------------------------------
-- load_entries
-- Athlete load report. V1: session_load = RPE * duration_minutes.
-- -----------------------------------------------------------------------------

create table if not exists public.load_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rpe integer not null check (rpe between 1 and 10),
  duration_minutes integer not null check (duration_minutes >= 0),
  session_load integer generated always as (rpe * duration_minutes) stored,
  note text,
  submitted_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_load_entries_session_id on public.load_entries(session_id);
create index if not exists idx_load_entries_user_id on public.load_entries(user_id);

-- -----------------------------------------------------------------------------
-- facility_bookings
-- Simple V1 booking/conflict model.
-- -----------------------------------------------------------------------------

create table if not exists public.facility_bookings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint facility_booking_ends_after_start check (ends_at > starts_at)
);

create index if not exists idx_facility_bookings_club_id on public.facility_bookings(club_id);
create index if not exists idx_facility_bookings_facility_id on public.facility_bookings(facility_id);
create index if not exists idx_facility_bookings_session_id on public.facility_bookings(session_id);
create index if not exists idx_facility_bookings_time_range on public.facility_bookings(facility_id, starts_at, ends_at);

-- -----------------------------------------------------------------------------
-- activity_events
-- Lightweight in-app signals. Not a full notification engine.
-- -----------------------------------------------------------------------------

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_events_club_id on public.activity_events(club_id);
create index if not exists idx_activity_events_department_id on public.activity_events(department_id);
create index if not exists idx_activity_events_team_id on public.activity_events(team_id);
create index if not exists idx_activity_events_created_at on public.activity_events(created_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security placeholder
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.departments enable row level security;
alter table public.teams enable row level security;
alter table public.club_memberships enable row level security;
alter table public.team_memberships enable row level security;
alter table public.invites enable row level security;
alter table public.facilities enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.availability enable row level security;
alter table public.attendance_records enable row level security;
alter table public.load_entries enable row level security;
alter table public.facility_bookings enable row level security;
alter table public.activity_events enable row level security;

-- Policies are intentionally not finalized in this first schema migration draft.
-- They should be added in a dedicated migration after reviewing access rules.
