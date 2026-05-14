-- Club App / TeamLoad OS
-- Allow club admins and department leads to read profile names for people in
-- the teams/departments they manage.
--
-- Without this, Admin Department team lists can see team_memberships but not the
-- corresponding profile names because the original profiles policy only covered
-- own profile and shared team context.

drop policy if exists "profiles_select_own_or_team_context" on public.profiles;

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
  or exists (
    select 1
    from public.team_memberships managed_tm
    where managed_tm.user_id = profiles.id
      and managed_tm.status = 'active'
      and (
        public.is_club_admin(managed_tm.club_id)
        or public.is_department_lead(managed_tm.department_id)
      )
  )
  or exists (
    select 1
    from public.club_memberships managed_cm
    where managed_cm.user_id = profiles.id
      and managed_cm.status = 'active'
      and (
        public.is_club_admin(managed_cm.club_id)
        or (
          managed_cm.department_id is not null
          and public.is_department_lead(managed_cm.department_id)
        )
      )
  )
);
