-- Club App / TeamLoad OS
-- RLS policy draft for V1
--
-- This migration implements the V1 access model documented in:
-- docs/rls-access-model.md
--
-- Core rules:
-- - Access is membership-based.
-- - Coaches and athletes do not browse unrelated departments by default.
-- - Athletes can only write their own availability and load.
-- - Coaches finalize attendance but do not edit athlete availability.
-- - Club admins manage structure but do not automatically get individual load access.
-- - Invite acceptance should eventually happen through controlled RPCs.

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships cm
    where cm.club_id = p_club_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  )
  or exists (
    select 1
    from public.team_memberships tm
    where tm.club_id = p_club_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships cm
    where cm.club_id = p_club_id
      and cm.user_id = auth.uid()
      and cm.role = 'club_admin'
      and cm.status = 'active'
  );
$$;

create or replace function public.is_department_lead(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships cm
    where cm.department_id = p_department_id
      and cm.user_id = auth.uid()
      and cm.role = 'department_lead'
      and cm.status = 'active'
  );
$$;

create or replace function public.is_department_member(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships cm
    where cm.department_id = p_department_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  )
  or exists (
    select 1
    from public.team_memberships tm
    where tm.department_id = p_department_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.is_team_staff(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.role in ('head_coach', 'assistant_coach')
      and tm.status = 'active'
  );
$$;

create or replace function public.is_team_athlete(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships tm
    where tm.team_id = p_team_id
      and tm.user_id = auth.uid()
      and tm.role = 'athlete'
      and tm.status = 'active'
  );
$$;

create or replace function public.can_manage_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.departments d
    where d.id = p_department_id
      and public.is_club_admin(d.club_id)
  )
  or public.is_department_lead(p_department_id);
$$;

create or replace function public.can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and (
        public.is_club_admin(t.club_id)
        or public.is_department_lead(t.department_id)
      )
  );
$$;

create or replace function public.can_manage_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        public.is_club_admin(s.club_id)
        or public.is_department_lead(s.department_id)
        or public.is_team_staff(s.team_id)
      )
  );
$$;

create or replace function public.can_view_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        public.is_club_admin(s.club_id)
        or public.is_department_lead(s.department_id)
        or public.is_team_member(s.team_id)
      )
  );
$$;

create or replace function public.can_view_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and (
        public.is_club_admin(t.club_id)
        or public.is_department_lead(t.department_id)
        or public.is_team_member(t.id)
      )
  );
$$;

create or replace function public.is_session_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_participants sp
    where sp.session_id = p_session_id
      and sp.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- Drop existing policies if rerun during development
-- -----------------------------------------------------------------------------

-- profiles
drop policy if exists "profiles_select_own_or_team_context" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

-- clubs
drop policy if exists "clubs_select_members" on public.clubs;
drop policy if exists "clubs_insert_authenticated" on public.clubs;
drop policy if exists "clubs_update_admin" on public.clubs;
drop policy if exists "clubs_delete_admin" on public.clubs;

-- departments
drop policy if exists "departments_select_context" on public.departments;
drop policy if exists "departments_insert_club_admin" on public.departments;
drop policy if exists "departments_update_club_admin" on public.departments;
drop policy if exists "departments_delete_club_admin" on public.departments;

-- teams
drop policy if exists "teams_select_context" on public.teams;
drop policy if exists "teams_insert_admin_or_department_lead" on public.teams;
drop policy if exists "teams_update_admin_or_department_lead" on public.teams;
drop policy if exists "teams_delete_admin_or_department_lead" on public.teams;

-- club memberships
drop policy if exists "club_memberships_select_context" on public.club_memberships;
drop policy if exists "club_memberships_insert_admin_controlled" on public.club_memberships;
drop policy if exists "club_memberships_update_admin_controlled" on public.club_memberships;
drop policy if exists "club_memberships_delete_admin" on public.club_memberships;

-- team memberships
drop policy if exists "team_memberships_select_context" on public.team_memberships;
drop policy if exists "team_memberships_insert_controlled" on public.team_memberships;
drop policy if exists "team_memberships_update_admin_or_department" on public.team_memberships;
drop policy if exists "team_memberships_delete_admin_or_department" on public.team_memberships;

-- invites
drop policy if exists "invites_select_creator_or_admin" on public.invites;
drop policy if exists "invites_insert_allowed_roles" on public.invites;
drop policy if exists "invites_update_creator_or_admin" on public.invites;
drop policy if exists "invites_delete_creator_or_admin" on public.invites;

-- facilities
drop policy if exists "facilities_select_context" on public.facilities;
drop policy if exists "facilities_insert_club_admin" on public.facilities;
drop policy if exists "facilities_update_club_admin" on public.facilities;
drop policy if exists "facilities_delete_club_admin" on public.facilities;

-- sessions
drop policy if exists "sessions_select_context" on public.sessions;
drop policy if exists "sessions_insert_allowed" on public.sessions;
drop policy if exists "sessions_update_allowed" on public.sessions;
drop policy if exists "sessions_delete_allowed" on public.sessions;

-- session participants
drop policy if exists "session_participants_select_context" on public.session_participants;
drop policy if exists "session_participants_insert_session_manager" on public.session_participants;
drop policy if exists "session_participants_update_session_manager" on public.session_participants;
drop policy if exists "session_participants_delete_session_manager" on public.session_participants;

-- availability
drop policy if exists "availability_select_context" on public.availability;
drop policy if exists "availability_insert_own" on public.availability;
drop policy if exists "availability_update_own" on public.availability;
drop policy if exists "availability_delete_own" on public.availability;

-- attendance
drop policy if exists "attendance_select_context" on public.attendance_records;
drop policy if exists "attendance_insert_session_manager" on public.attendance_records;
drop policy if exists "attendance_update_session_manager" on public.attendance_records;
drop policy if exists "attendance_delete_session_manager" on public.attendance_records;

-- load
drop policy if exists "load_select_context" on public.load_entries;
drop policy if exists "load_insert_own" on public.load_entries;
drop policy if exists "load_update_own" on public.load_entries;
drop policy if exists "load_delete_own" on public.load_entries;

-- facility bookings
drop policy if exists "facility_bookings_select_context" on public.facility_bookings;
drop policy if exists "facility_bookings_insert_session_allowed" on public.facility_bookings;
drop policy if exists "facility_bookings_update_session_allowed" on public.facility_bookings;
drop policy if exists "facility_bookings_delete_session_allowed" on public.facility_bookings;

-- activity events
drop policy if exists "activity_events_select_context" on public.activity_events;
drop policy if exists "activity_events_insert_members" on public.activity_events;
drop policy if exists "activity_events_update_none" on public.activity_events;
drop policy if exists "activity_events_delete_admin" on public.activity_events;

-- -----------------------------------------------------------------------------
-- profiles policies
-- -----------------------------------------------------------------------------

create policy "profiles_select_own_or_team_context"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.team_memberships my_tm
    join public.team_memberships other_tm on other_tm.team_id = my_tm.team_id
    where my_tm.user_id = auth.uid()
      and my_tm.status = 'active'
      and other_tm.user_id = profiles.id
      and other_tm.status = 'active'
  )
);

create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- clubs policies
-- -----------------------------------------------------------------------------

create policy "clubs_select_members"
on public.clubs for select
to authenticated
using (public.is_club_member(id));

create policy "clubs_insert_authenticated"
on public.clubs for insert
to authenticated
with check (created_by = auth.uid());

create policy "clubs_update_admin"
on public.clubs for update
to authenticated
using (public.is_club_admin(id))
with check (public.is_club_admin(id));

create policy "clubs_delete_admin"
on public.clubs for delete
to authenticated
using (public.is_club_admin(id));

-- -----------------------------------------------------------------------------
-- departments policies
-- -----------------------------------------------------------------------------

create policy "departments_select_context"
on public.departments for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_member(id)
);

create policy "departments_insert_club_admin"
on public.departments for insert
to authenticated
with check (public.is_club_admin(club_id));

create policy "departments_update_club_admin"
on public.departments for update
to authenticated
using (public.is_club_admin(club_id))
with check (public.is_club_admin(club_id));

create policy "departments_delete_club_admin"
on public.departments for delete
to authenticated
using (public.is_club_admin(club_id));

-- -----------------------------------------------------------------------------
-- teams policies
-- -----------------------------------------------------------------------------

create policy "teams_select_context"
on public.teams for select
to authenticated
using (public.can_view_team(id));

create policy "teams_insert_admin_or_department_lead"
on public.teams for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

create policy "teams_update_admin_or_department_lead"
on public.teams for update
to authenticated
using (public.can_manage_team(id))
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

create policy "teams_delete_admin_or_department_lead"
on public.teams for delete
to authenticated
using (public.can_manage_team(id));

-- -----------------------------------------------------------------------------
-- club_memberships policies
-- -----------------------------------------------------------------------------

create policy "club_memberships_select_context"
on public.club_memberships for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
);

-- Direct insert is allowed only for club admins or department leads in context.
-- Invite acceptance should later move to controlled RPCs.
create policy "club_memberships_insert_admin_controlled"
on public.club_memberships for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
);

create policy "club_memberships_update_admin_controlled"
on public.club_memberships for update
to authenticated
using (
  public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
)
with check (
  public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
);

create policy "club_memberships_delete_admin"
on public.club_memberships for delete
to authenticated
using (public.is_club_admin(club_id));

-- -----------------------------------------------------------------------------
-- team_memberships policies
-- -----------------------------------------------------------------------------

create policy "team_memberships_select_context"
on public.team_memberships for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_member(team_id)
);

-- Direct insert is allowed for admins/department leads/team staff in context.
-- Invite acceptance should later move to controlled RPCs.
create policy "team_memberships_insert_controlled"
on public.team_memberships for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
);

create policy "team_memberships_update_admin_or_department"
on public.team_memberships for update
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
)
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

create policy "team_memberships_delete_admin_or_department"
on public.team_memberships for delete
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

-- -----------------------------------------------------------------------------
-- invites policies
-- -----------------------------------------------------------------------------

create policy "invites_select_creator_or_admin"
on public.invites for select
to authenticated
using (
  created_by = auth.uid()
  or public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
  or (team_id is not null and public.is_team_staff(team_id))
);

create policy "invites_insert_allowed_roles"
on public.invites for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.is_club_admin(club_id)
    or (department_id is not null and public.is_department_lead(department_id))
    or (invite_type = 'athlete_invite' and team_id is not null and public.is_team_staff(team_id))
  )
);

create policy "invites_update_creator_or_admin"
on public.invites for update
to authenticated
using (
  created_by = auth.uid()
  or public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
)
with check (
  created_by = auth.uid()
  or public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
);

create policy "invites_delete_creator_or_admin"
on public.invites for delete
to authenticated
using (
  created_by = auth.uid()
  or public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
);

-- -----------------------------------------------------------------------------
-- facilities policies
-- -----------------------------------------------------------------------------

create policy "facilities_select_context"
on public.facilities for select
to authenticated
using (public.is_club_member(club_id));

create policy "facilities_insert_club_admin"
on public.facilities for insert
to authenticated
with check (public.is_club_admin(club_id));

create policy "facilities_update_club_admin"
on public.facilities for update
to authenticated
using (public.is_club_admin(club_id))
with check (public.is_club_admin(club_id));

create policy "facilities_delete_club_admin"
on public.facilities for delete
to authenticated
using (public.is_club_admin(club_id));

-- -----------------------------------------------------------------------------
-- sessions policies
-- -----------------------------------------------------------------------------

create policy "sessions_select_context"
on public.sessions for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_member(team_id)
);

create policy "sessions_insert_allowed"
on public.sessions for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
);

create policy "sessions_update_allowed"
on public.sessions for update
to authenticated
using (public.can_manage_session(id))
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
);

create policy "sessions_delete_allowed"
on public.sessions for delete
to authenticated
using (public.can_manage_session(id));

-- -----------------------------------------------------------------------------
-- session_participants policies
-- -----------------------------------------------------------------------------

create policy "session_participants_select_context"
on public.session_participants for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_view_session(session_id)
);

create policy "session_participants_insert_session_manager"
on public.session_participants for insert
to authenticated
with check (public.can_manage_session(session_id));

create policy "session_participants_update_session_manager"
on public.session_participants for update
to authenticated
using (public.can_manage_session(session_id))
with check (public.can_manage_session(session_id));

create policy "session_participants_delete_session_manager"
on public.session_participants for delete
to authenticated
using (public.can_manage_session(session_id));

-- -----------------------------------------------------------------------------
-- availability policies
-- -----------------------------------------------------------------------------

create policy "availability_select_context"
on public.availability for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_session(session_id)
);

create policy "availability_insert_own"
on public.availability for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_view_session(session_id)
);

create policy "availability_update_own"
on public.availability for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.can_view_session(session_id)
);

create policy "availability_delete_own"
on public.availability for delete
to authenticated
using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- attendance_records policies
-- -----------------------------------------------------------------------------

create policy "attendance_select_context"
on public.attendance_records for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_manage_session(session_id)
);

create policy "attendance_insert_session_manager"
on public.attendance_records for insert
to authenticated
with check (public.can_manage_session(session_id));

create policy "attendance_update_session_manager"
on public.attendance_records for update
to authenticated
using (public.can_manage_session(session_id))
with check (public.can_manage_session(session_id));

create policy "attendance_delete_session_manager"
on public.attendance_records for delete
to authenticated
using (public.can_manage_session(session_id));

-- -----------------------------------------------------------------------------
-- load_entries policies
-- -----------------------------------------------------------------------------

create policy "load_select_context"
on public.load_entries for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.sessions s
    where s.id = load_entries.session_id
      and (
        public.is_department_lead(s.department_id)
        or public.is_team_staff(s.team_id)
      )
  )
);

create policy "load_insert_own"
on public.load_entries for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_view_session(session_id)
);

create policy "load_update_own"
on public.load_entries for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.can_view_session(session_id)
);

create policy "load_delete_own"
on public.load_entries for delete
to authenticated
using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- facility_bookings policies
-- -----------------------------------------------------------------------------

create policy "facility_bookings_select_context"
on public.facility_bookings for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_club_member(club_id)
);

create policy "facility_bookings_insert_session_allowed"
on public.facility_bookings for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or (session_id is not null and public.can_manage_session(session_id))
);

create policy "facility_bookings_update_session_allowed"
on public.facility_bookings for update
to authenticated
using (
  public.is_club_admin(club_id)
  or (session_id is not null and public.can_manage_session(session_id))
)
with check (
  public.is_club_admin(club_id)
  or (session_id is not null and public.can_manage_session(session_id))
);

create policy "facility_bookings_delete_session_allowed"
on public.facility_bookings for delete
to authenticated
using (
  public.is_club_admin(club_id)
  or (session_id is not null and public.can_manage_session(session_id))
);

-- -----------------------------------------------------------------------------
-- activity_events policies
-- -----------------------------------------------------------------------------

create policy "activity_events_select_context"
on public.activity_events for select
to authenticated
using (
  public.is_club_admin(club_id)
  or (department_id is not null and public.is_department_lead(department_id))
  or (team_id is not null and public.is_team_member(team_id))
);

create policy "activity_events_insert_members"
on public.activity_events for insert
to authenticated
with check (
  actor_id = auth.uid()
  and (
    public.is_club_admin(club_id)
    or (department_id is not null and public.is_department_member(department_id))
    or (team_id is not null and public.is_team_member(team_id))
  )
);

-- No general update policy for activity events in V1.
-- Events should be append-only from normal app flows.
create policy "activity_events_update_none"
on public.activity_events for update
to authenticated
using (false)
with check (false);

create policy "activity_events_delete_admin"
on public.activity_events for delete
to authenticated
using (public.is_club_admin(club_id));
