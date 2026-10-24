-- Fixed jersey numbers per team, and the sport of a department (2026-10-24, Ben).
--
-- Not every team has fixed numbers (training groups, youth teams that hand
-- out shirts per game): `teams.fixed_numbers` says whether the app asks for
-- one. On by default; whoever configures the team (manageStaff) switches it.
--
-- `departments.sport` names the sport, so the app suggests fitting
-- positions and limits playing minutes sensibly (a basketball game is not a
-- football game). Optional: without it the app guesses from the name.

alter table public.teams add column if not exists fixed_numbers boolean not null default true;
grant update (fixed_numbers) on public.teams to authenticated;

alter table public.departments add column if not exists sport text
  check (sport is null or sport in ('football', 'basketball', 'handball', 'volleyball', 'hockey', 'tennis', 'tableTennis', 'athletics', 'swimming', 'gymnastics'));
-- Who may update a department at all: club admins (`departments_rename`, 0011)
-- and the department's lead (`departments_news_rule`, 0035).
grant update (sport) on public.departments to authenticated;

-- The guard from 0041/0046, now also for fixed numbers (team configuration: manageStaff).
create or replace function app.guard_team_health_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role',true)='authenticated' and auth.uid() is not null
    and (new.age_group is distinct from old.age_group or new.features is distinct from old.features or new.feature_choices is distinct from old.feature_choices
      or new.fixed_numbers is distinct from old.fixed_numbers)
    and not app.has_perm(old.id,'manageStaff') then raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  -- teams_health_settings opens updates to manageStaff for these fields only.
  if current_setting('role',true)='authenticated' and auth.uid() is not null
    and (new.name is distinct from old.name or new.archived_at is distinct from old.archived_at or new.default_facility_id is distinct from old.default_facility_id)
    and not (app.has_perm(old.id,'manageFacilities') or app.manages_team(old.id)) then
    raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  return new;
end $$;
