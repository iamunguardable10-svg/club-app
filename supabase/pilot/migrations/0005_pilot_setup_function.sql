-- Setting up a club for the pilot.
--
-- Clubs, departments and teams are read-only for the app (0002). This
-- function creates them together with the first Head Coach, as a person
-- without an account, and returns that person's invitation token. The link
-- `<app>/join?invite=<token>` then lets them create their account and take
-- over the team; everyone else comes in through the staff panel and the
-- team's join code.
--
-- Not callable from the app: only the database owner (SQL editor, setup
-- scripts) may run it.

create or replace function app.setup_club(
  p_club_name text,
  p_city text,
  p_department_name text,
  p_team_name text,
  p_head_first_name text,
  p_head_last_name text,
  p_hall_name text default null,
  p_hall_address text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_club uuid;
  v_department uuid;
  v_team uuid;
  v_hall uuid;
  v_head uuid;
  v_token uuid;
begin
  insert into public.clubs (name, city, country) values (btrim(p_club_name), btrim(coalesce(p_city, '')), 'DE') returning id into v_club;
  insert into public.departments (club_id, name) values (v_club, btrim(p_department_name)) returning id into v_department;
  if p_hall_name is not null and btrim(p_hall_name) <> '' then
    insert into public.facilities (club_id, name, address) values (v_club, btrim(p_hall_name), btrim(coalesce(p_hall_address, ''))) returning id into v_hall;
    insert into public.department_facilities (department_id, facility_id) values (v_department, v_hall);
  end if;
  -- The team trigger adds the four role templates and a join code.
  insert into public.teams (club_id, department_id, name, default_facility_id)
  values (v_club, v_department, btrim(p_team_name), v_hall) returning id into v_team;
  insert into public.people (club_id, first_name, last_name)
  values (v_club, btrim(p_head_first_name), btrim(p_head_last_name)) returning id into v_head;
  insert into public.memberships (person_id, team_id, role, coach_role_id)
  select v_head, v_team, 'coach', r.id from public.coach_roles r where r.team_id = v_team and r.locked;
  insert into public.staff_invites (person_id, team_id) values (v_head, v_team) returning token into v_token;
  return v_token;
end $$;

revoke all on function app.setup_club(text, text, text, text, text, text, text, text) from public, anon, authenticated;
