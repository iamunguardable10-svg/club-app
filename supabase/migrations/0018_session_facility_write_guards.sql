-- Session facility write guards
-- URL context is display-only. Session writes must be validated against
-- authenticated memberships and department-facility assignments.

create or replace function public.can_write_session_context(
  p_club_id uuid,
  p_department_id uuid,
  p_owner_team_id uuid,
  p_facility_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_owner_team_id
      and t.club_id = p_club_id
      and t.department_id = p_department_id
      and (
        public.is_club_admin(p_club_id)
        or public.is_department_lead(p_department_id)
        or public.is_team_staff(p_owner_team_id)
      )
      and (
        p_facility_id is null
        or public.is_department_facility(p_department_id, p_facility_id)
      )
  );
$$;

drop policy if exists "sessions_insert_allowed" on public.sessions;
drop policy if exists "sessions_update_allowed" on public.sessions;

create policy "sessions_insert_allowed"
on public.sessions for insert
to authenticated
with check (
  public.can_write_session_context(club_id, department_id, owner_team_id, facility_id)
);

create policy "sessions_update_allowed"
on public.sessions for update
to authenticated
using (public.can_manage_session(id))
with check (
  public.can_write_session_context(club_id, department_id, owner_team_id, facility_id)
);
