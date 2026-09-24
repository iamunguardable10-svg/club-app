-- English names for the role templates every new team gets, matching the
-- English interface (COACH_ROLE_TEMPLATES in src/shared/data/seed.ts).
-- Existing roles keep their names; teams can rename unlocked roles anyway.

create or replace function app.create_role_templates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.coach_roles (team_id, name, permissions, locked, created_at) values
    (new.id, 'Head Coach', app.all_permissions(), true, now()),
    (new.id, 'Assistant Coach', app.all_permissions(), false, now() + interval '1 millisecond'),
    (new.id, 'Athletic Coach', app.all_permissions(), false, now() + interval '2 milliseconds'),
    (new.id, 'Team Manager', array['viewRoster', 'viewAttendance'], false, now() + interval '3 milliseconds');
  return new;
end $$;
