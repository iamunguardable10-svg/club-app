-- Club OS
-- Atomic reusable athlete join-code lookup/creation.
-- Keeps team join-code reuse server-side instead of duplicating access checks in the client.

create or replace function public.get_or_create_team_join_code(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_user_id uuid := auth.uid();
  v_existing public.team_join_codes%rowtype;
  v_code text;
  v_row public.team_join_codes%rowtype;
  v_attempt integer := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_team
  from public.teams
  where id = p_team_id;

  if not found then
    raise exception 'team_not_found';
  end if;

  if not (
    public.is_club_admin(v_team.club_id)
    or public.is_department_lead(v_team.department_id)
    or public.is_team_staff(v_team.id)
  ) then
    raise exception 'not_allowed_to_create_join_code';
  end if;

  select *
  into v_existing
  from public.team_join_codes
  where team_id = v_team.id
    and is_active = true
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses)
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', v_existing.code,
      'reused', true
    );
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));

    begin
      insert into public.team_join_codes (
        club_id,
        department_id,
        team_id,
        code,
        created_by
      )
      values (
        v_team.club_id,
        v_team.department_id,
        v_team.id,
        v_code,
        v_user_id
      )
      returning * into v_row;

      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'code', v_row.code,
    'reused', false
  );
end;
$$;

grant execute on function public.get_or_create_team_join_code(uuid) to authenticated;

-- Explicit execute grants for the join-code flow used by /join/[code].
-- These functions are defined in 0003; this migration states the required access contract
-- for the now-live join page without rewriting historical migrations.
grant execute on function public.get_team_by_join_code(text) to anon, authenticated;
grant execute on function public.join_team_by_code(text) to authenticated;
