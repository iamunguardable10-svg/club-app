-- Taken shirt numbers (field test 2026-11-20). A player cannot read the other
-- players' numbers (RLS: coaches with viewRoster only), so the app could not
-- see that a number was worn already, and the server refused it with a
-- general "Not saved". Now:
-- - the check trigger names the reason ("already taken");
-- - `join_code_numbers(code)`: the numbers taken in the team of a join code,
--   for the player card before joining (rate-limited like the code preview);
-- - `team_taken_numbers(team)`: the same for anyone in the team.
-- Numbers only, never names. Additive: one function replaced with the same
-- signature, two new functions.

create or replace function app.check_team_player_details() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships m where m.team_id = new.team_id and m.person_id = new.person_id and m.role = 'athlete') then
    raise exception 'Only a player of the team has a number and position there.' using errcode = 'check_violation';
  end if;
  if new.jersey_number is not null and exists (
    select 1 from public.team_player_details d
    where d.team_id = new.team_id and d.jersey_number = new.jersey_number and d.person_id <> new.person_id
  ) then
    raise exception 'This number is already taken in the team.' using errcode = 'unique_violation';
  end if;
  new.position := nullif(btrim(new.position), '');
  new.updated_at := now();
  return new;
end $$;

create or replace function public.join_code_numbers(p_code text)
returns smallint[]
language plpgsql volatile security definer set search_path = '' as $$
declare v_numbers smallint[];
begin
  perform app.rate_check('join_code_numbers', 300, 600);
  select coalesce(array_agg(d.jersey_number order by d.jersey_number), '{}')
    into v_numbers
    from public.team_join_codes c
    join public.teams t on t.id = c.team_id
    join public.team_player_details d on d.team_id = t.id
    where c.code = upper(btrim(p_code)) and t.archived_at is null and d.jersey_number is not null;
  return v_numbers;
end $$;

create or replace function public.team_taken_numbers(p_team uuid)
returns smallint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(d.jersey_number order by d.jersey_number), '{}')
  from public.team_player_details d
  where d.team_id = p_team and d.jersey_number is not null
    and not app.is_me(d.person_id)
    and exists (
      select 1 from public.memberships m join public.people p on p.id = m.person_id
      where m.team_id = p_team and p.user_id = auth.uid()
    )
$$;

revoke all on function public.join_code_numbers(text), public.team_taken_numbers(uuid) from public;
grant execute on function public.join_code_numbers(text) to anon, authenticated;
grant execute on function public.team_taken_numbers(uuid) to authenticated;
