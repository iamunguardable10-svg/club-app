-- What the profile step asks a joining player (2026-10-24): the team's sport
-- (for fitting positions) and whether it has fixed numbers. Works before
-- signing in, like the join code preview, and is rate-limited the same way.

create or replace function public.join_code_profile(p_code text)
returns table (sport text, fixed_numbers boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('join_code_profile', 300, 600);
  return query
    select d.sport, t.fixed_numbers
    from public.team_join_codes c
    join public.teams t on t.id = c.team_id
    join public.departments d on d.id = t.department_id
    where c.code = upper(btrim(p_code)) and t.archived_at is null;
end $$;

revoke all on function public.join_code_profile(text) from public;
grant execute on function public.join_code_profile(text) to anon, authenticated;
