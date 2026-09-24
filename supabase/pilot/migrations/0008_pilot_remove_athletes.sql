-- Players can be removed from a team (decided 2026-09-24): by anyone whose
-- role on that team may manage the staff (`manageStaff`), the same right that
-- adds and removes coaches.
--
-- What goes: the player's membership in this team and their places in this
-- team's groups. What stays: the person, their availability reports and load
-- entries (their own history, and the team's past attendance). Without the
-- membership, the team's staff can no longer see them.
--
-- A removed player can join again with the team's join code; replacing the
-- code keeps them out.

-- One delete policy for both kinds of membership, instead of a second
-- permissive policy next to the first (the performance advisor flags those).
drop policy if exists memberships_staff_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (role in ('coach', 'athlete') and app.has_perm(team_id, 'manageStaff'));

-- Leaving the team also leaves its groups. Security definer: the groups are
-- cleaned up even when the remover may manage staff but not groups.
create or replace function app.athlete_left_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'athlete' then
    delete from public.player_group_members gm
    using public.player_groups g
    where g.id = gm.group_id and g.team_id = old.team_id and gm.person_id = old.person_id;
  end if;
  return old;
end $$;

create trigger memberships_athlete_left after delete on public.memberships
  for each row execute function app.athlete_left_team();
