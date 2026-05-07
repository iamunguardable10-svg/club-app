-- Club App / TeamLoad OS
-- Initial club setup RPC for guided admin onboarding.
--
-- Product goal:
-- - an authenticated user creates a club
-- - the same user immediately becomes club_admin
-- - multiple departments can be created
-- - multiple global facilities can be created
-- - optional teams can be created in one selected department

create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.create_initial_club_setup(
  p_club_name text,
  p_city text default null,
  p_country text default null,
  p_department_names text[] default '{}',
  p_facility_names text[] default '{}',
  p_team_department_name text default null,
  p_team_names text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_club_id uuid;
  v_club_slug text;
  v_base_slug text;
  v_slug_suffix integer := 0;
  v_department_name text;
  v_department_id uuid;
  v_selected_department_id uuid;
  v_facility_name text;
  v_team_name text;
  v_created_departments jsonb := '[]'::jsonb;
  v_created_facilities jsonb := '[]'::jsonb;
  v_created_teams jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_club_name is null or length(trim(p_club_name)) < 2 then
    raise exception 'club_name_required';
  end if;

  if array_length(p_department_names, 1) is null then
    raise exception 'at_least_one_department_required';
  end if;

  v_base_slug := public.slugify(p_club_name);

  if v_base_slug = '' then
    v_base_slug := 'club';
  end if;

  v_club_slug := v_base_slug;

  while exists (select 1 from public.clubs where slug = v_club_slug) loop
    v_slug_suffix := v_slug_suffix + 1;
    v_club_slug := v_base_slug || '-' || v_slug_suffix::text;
  end loop;

  insert into public.clubs (
    name,
    slug,
    city,
    country,
    created_by
  )
  values (
    trim(p_club_name),
    v_club_slug,
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_country, '')), ''),
    v_user_id
  )
  returning id into v_club_id;

  insert into public.club_memberships (
    user_id,
    club_id,
    department_id,
    role,
    status
  )
  values (
    v_user_id,
    v_club_id,
    null,
    'club_admin',
    'active'
  );

  foreach v_department_name in array p_department_names loop
    if nullif(trim(v_department_name), '') is not null then
      insert into public.departments (
        club_id,
        name,
        sport
      )
      values (
        v_club_id,
        trim(v_department_name),
        trim(v_department_name)
      )
      on conflict (club_id, name) do update set name = excluded.name
      returning id into v_department_id;

      v_created_departments := v_created_departments || jsonb_build_object(
        'id', v_department_id,
        'name', trim(v_department_name)
      );

      if p_team_department_name is not null and lower(trim(v_department_name)) = lower(trim(p_team_department_name)) then
        v_selected_department_id := v_department_id;
      end if;
    end if;
  end loop;

  foreach v_facility_name in array p_facility_names loop
    if nullif(trim(v_facility_name), '') is not null then
      insert into public.facilities (
        club_id,
        name
      )
      values (
        v_club_id,
        trim(v_facility_name)
      )
      on conflict (club_id, name) do update set name = excluded.name
      returning id into v_department_id;

      v_created_facilities := v_created_facilities || jsonb_build_object(
        'id', v_department_id,
        'name', trim(v_facility_name)
      );
    end if;
  end loop;

  if p_team_department_name is not null and array_length(p_team_names, 1) is not null then
    if v_selected_department_id is null then
      raise exception 'team_department_not_found';
    end if;

    foreach v_team_name in array p_team_names loop
      if nullif(trim(v_team_name), '') is not null then
        insert into public.teams (
          club_id,
          department_id,
          name,
          sport,
          season
        )
        values (
          v_club_id,
          v_selected_department_id,
          trim(v_team_name),
          p_team_department_name,
          null
        )
        on conflict (department_id, name, season) do update set name = excluded.name
        returning id into v_department_id;

        v_created_teams := v_created_teams || jsonb_build_object(
          'id', v_department_id,
          'name', trim(v_team_name)
        );
      end if;
    end loop;
  end if;

  insert into public.activity_events (
    club_id,
    actor_id,
    event_type,
    title,
    body
  )
  values (
    v_club_id,
    v_user_id,
    'club_created',
    'Club created',
    'Initial club setup was completed.'
  );

  return jsonb_build_object(
    'ok', true,
    'club_id', v_club_id,
    'club_slug', v_club_slug,
    'departments', v_created_departments,
    'facilities', v_created_facilities,
    'teams', v_created_teams
  );
end;
$$;
