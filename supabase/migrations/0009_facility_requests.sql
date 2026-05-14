-- Structured facility requests for department-to-admin facility workflows.
--
-- Product logic:
-- - Admins can create facilities directly and should not create requests for themselves.
-- - Department leads can request a shared/global facility when they think a hall is used by multiple departments.
-- - Admins can approve the request, adjust facility details, assign departments and mark the request reviewed.
-- - Admins can reject the request. A later department-lead view can surface the rejected status.

create table if not exists public.facility_requests (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  facility_name text not null,
  facility_address text not null,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  rejection_reason text,
  created_facility_id uuid references public.facilities(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_facility_requests_club_id on public.facility_requests(club_id);
create index if not exists idx_facility_requests_department_id on public.facility_requests(department_id);
create index if not exists idx_facility_requests_status on public.facility_requests(status);
create index if not exists idx_facility_requests_created_facility_id on public.facility_requests(created_facility_id);

create trigger set_facility_requests_updated_at
before update on public.facility_requests
for each row execute function public.set_updated_at();

alter table public.facility_requests enable row level security;

drop policy if exists "facility_requests_select_admin_or_department_lead" on public.facility_requests;
drop policy if exists "facility_requests_insert_department_lead_or_admin" on public.facility_requests;
drop policy if exists "facility_requests_update_club_admin" on public.facility_requests;
drop policy if exists "facility_requests_delete_club_admin" on public.facility_requests;

create policy "facility_requests_select_admin_or_department_lead"
on public.facility_requests for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

create policy "facility_requests_insert_department_lead_or_admin"
on public.facility_requests for insert
to authenticated
with check (
  requested_by = auth.uid()
  and (
    public.is_department_lead(department_id)
    or public.is_club_admin(club_id)
  )
);

create policy "facility_requests_update_club_admin"
on public.facility_requests for update
to authenticated
using (public.is_club_admin(club_id))
with check (public.is_club_admin(club_id));

create policy "facility_requests_delete_club_admin"
on public.facility_requests for delete
to authenticated
using (public.is_club_admin(club_id));
