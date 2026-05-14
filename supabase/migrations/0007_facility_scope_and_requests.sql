-- Facility scope and shared facility request support.
--
-- Product logic:
-- - club_shared facilities can be assigned to multiple departments.
-- - department_only facilities are owned by exactly one department context.
-- - department leads should create department-only facilities directly.
-- - shared facility creation by department leads should be reported to club admins first.

alter table public.facilities
add column if not exists scope text not null default 'club_shared'
check (scope in ('club_shared', 'department_only'));

alter table public.facilities
add column if not exists owner_department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_facilities_scope on public.facilities(scope);
create index if not exists idx_facilities_owner_department_id on public.facilities(owner_department_id);

-- Replace facility policies so department leads can create department-only facilities
-- without being allowed to create shared club facilities directly.
drop policy if exists "facilities_select_context" on public.facilities;
drop policy if exists "facilities_insert_club_admin" on public.facilities;
drop policy if exists "facilities_insert_admin_or_department_lead_scoped" on public.facilities;
drop policy if exists "facilities_update_club_admin" on public.facilities;
drop policy if exists "facilities_update_admin_or_owner_department_lead" on public.facilities;
drop policy if exists "facilities_delete_club_admin" on public.facilities;
drop policy if exists "facilities_delete_admin_or_owner_department_lead" on public.facilities;

create policy "facilities_select_context"
on public.facilities for select
to authenticated
using (
  public.is_club_admin(club_id)
  or (scope = 'club_shared' and public.is_club_member(club_id))
  or (scope = 'department_only' and owner_department_id is not null and public.is_department_member(owner_department_id))
);

create policy "facilities_insert_admin_or_department_lead_scoped"
on public.facilities for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or (
    scope = 'department_only'
    and owner_department_id is not null
    and public.is_department_lead(owner_department_id)
  )
);

create policy "facilities_update_admin_or_owner_department_lead"
on public.facilities for update
to authenticated
using (
  public.is_club_admin(club_id)
  or (
    scope = 'department_only'
    and owner_department_id is not null
    and public.is_department_lead(owner_department_id)
  )
)
with check (
  public.is_club_admin(club_id)
  or (
    scope = 'department_only'
    and owner_department_id is not null
    and public.is_department_lead(owner_department_id)
  )
);

create policy "facilities_delete_admin_or_owner_department_lead"
on public.facilities for delete
to authenticated
using (
  public.is_club_admin(club_id)
  or (
    scope = 'department_only'
    and owner_department_id is not null
    and public.is_department_lead(owner_department_id)
  )
);
