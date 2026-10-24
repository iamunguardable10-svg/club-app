-- Team logos (2026-10-24, Ben): the club or the coach puts the team's logo
-- in, and it shows on the player cards, also before joining.
--
-- A logo is not private (it is on every shirt), so the bucket is public:
-- one file per team at `<club>/<team>.png`, read by its plain link, which
-- the join code profile hands out before signing in. Putting, replacing and
-- removing it is for whoever configures the team (manageStaff) or runs it
-- (club admin, department lead). `teams.logo_at` says there is one, and when
-- it was put, so a new one gets a new link.

alter table public.teams add column if not exists logo_at timestamptz;
grant update (logo_at) on public.teams to authenticated;

-- The guard from 0052, now also for the logo (configures or runs the team).
create or replace function app.guard_team_health_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role',true)='authenticated' and auth.uid() is not null
    and (new.age_group is distinct from old.age_group or new.features is distinct from old.features or new.feature_choices is distinct from old.feature_choices
      or new.fixed_numbers is distinct from old.fixed_numbers)
    and not app.has_perm(old.id,'manageStaff') then raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  if current_setting('role',true)='authenticated' and auth.uid() is not null
    and new.logo_at is distinct from old.logo_at
    and not (app.has_perm(old.id,'manageStaff') or app.manages_team(old.id)) then
    raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  -- teams_health_settings opens updates to manageStaff for these fields only.
  if current_setting('role',true)='authenticated' and auth.uid() is not null
    and (new.name is distinct from old.name or new.archived_at is distinct from old.archived_at or new.default_facility_id is distinct from old.default_facility_id)
    and not (app.has_perm(old.id,'manageFacilities') or app.manages_team(old.id)) then
    raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  return new;
end $$;

-- `<club>/<team>.png` of a team of that club, for who configures or runs it.
create or replace function app.may_write_team_logo(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_team uuid;
begin
  if array_length(v_parts, 1) <> 2 or v_parts[1] !~ '^[0-9a-f-]{36}$' or v_parts[2] !~ '^[0-9a-f-]{36}\.png$' then return false; end if;
  v_team := split_part(v_parts[2], '.', 1)::uuid;
  return exists (select 1 from public.teams t where t.id = v_team and t.club_id = v_parts[1]::uuid)
    and (app.has_perm(v_team, 'manageStaff') or app.manages_team(v_team));
end $$;

grant execute on function app.may_write_team_logo(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 262144, array['image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'team_logos_read') then
    -- Public anyway; reading the row is what replacing a file needs.
    create policy team_logos_read on storage.objects for select to authenticated
      using (bucket_id = 'team-logos' and app.may_write_team_logo(name));
    create policy team_logos_add on storage.objects for insert to authenticated
      with check (bucket_id = 'team-logos' and app.may_write_team_logo(name));
    create policy team_logos_change on storage.objects for update to authenticated
      using (bucket_id = 'team-logos' and app.may_write_team_logo(name))
      with check (bucket_id = 'team-logos' and app.may_write_team_logo(name));
    create policy team_logos_remove on storage.objects for delete to authenticated
      using (bucket_id = 'team-logos' and app.may_write_team_logo(name));
  end if;
end $$;

-- The join code profile (0053) also tells the logo and the department, for the card before joining.
drop function if exists public.join_code_profile(text);
create function public.join_code_profile(p_code text)
returns table (sport text, fixed_numbers boolean, department_name text, logo text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('join_code_profile', 300, 600);
  return query
    select d.sport, t.fixed_numbers, d.name,
      case when t.logo_at is null then null
        else t.club_id::text || '/' || t.id::text || '.png?v=' || floor(extract(epoch from t.logo_at))::bigint::text end
    from public.team_join_codes c
    join public.teams t on t.id = c.team_id
    join public.departments d on d.id = t.department_id
    where c.code = upper(btrim(p_code)) and t.archived_at is null;
end $$;

revoke all on function public.join_code_profile(text) from public;
grant execute on function public.join_code_profile(text) to anon, authenticated;
