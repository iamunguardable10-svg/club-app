-- Club App / TeamLoad OS
-- Facility scoping for departments and default facilities for teams.
--
-- Product goal:
-- - club_admin creates global facilities
-- - department_lead selects which facilities belong to their department
-- - coaches primarily see department-scoped facilities
-- - teams can have a default facility to reduce session creation friction

-- -----------------------------------------------------------------------------
-- Add optional default facility to teams
-- -----------------------------------------------------------------------------

alter table public.teams
add column if not exists default_facility_id uuid references public.facilities(id) on delete set null;

create index if not exists idx_teams_default_facility_id on public.teams(default_facility_id);

-- -----------------------------------------------------------------------------
-- Department facilities join table
-- -----------------------------------------------------------------------------

create table if not exists public.department_facilities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (department_id, facility_id)
);

create index if not exists idx_department_facilities_club_id on public.department_facilities(club_id);
create index if not exists idx_department_facilities_department_id on public.department_facilities(department_id);
create index if not exists idx_department_facilities_facility_id on public.department_facilities(facility_id);

alter table public.department_facilities enable row level security;

-- -----------------------------------------------------------------------------
-- RLS policies for department_facilities
-- -----------------------------------------------------------------------------

drop policy if exists "department_facilities_select_context" on public.department_facilities;
drop policy if exists "department_facilities_insert_admin_or_department_lead" on public.department_facilities;
drop policy if exists "department_facilities_update_admin_or_department_lead" on public.department_facilities;
drop policy if exists "department_facilities_delete_admin_or_department_lead" on public.department_facilities;

create policy "department_facilities_select_context"
on public.department_facilities for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_department_member(department_id)
);

create policy "department_facilities_insert_admin_or_department_lead"
on public.department_facilities for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.is_club_admin(club_id)
    or public.is_department_lead(department_id)
  )
);

create policy "department_facilities_update_admin_or_department_lead"
on public.department_facilities for update
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
)
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

create policy "department_facilities_delete_admin_or_department_lead"
on public.department_facilities for delete
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

-- -----------------------------------------------------------------------------
-- Helper function: check whether a facility belongs to a department
-- -----------------------------------------------------------------------------

create or replace function public.is_department_facility(p_department_id uuid, p_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_facilities df
    where df.department_id = p_department_id
      and df.facility_id = p_facility_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Note
-- -----------------------------------------------------------------------------

-- Existing teams update RLS already allows club_admin or department_lead to update teams.
-- Therefore default_facility_id can be set by those roles through the existing teams policies.
-- A stricter future policy can ensure default_facility_id must be department-scoped.
