-- Player profile (2026-10-24, docs/goal-2026-10-pilot-ready.md, piece 3; Ben: "Größe,
-- Nummer und was ein Trainer braucht").
--
-- Per team (a player can wear another number in another team): jersey number
-- and position. The player and the coaches who see the roster see them (as
-- players do not see their teammates, 0002); the player sets their own, a
-- coach who manages the groups can set them too. A number is worn by one
-- player of the team at a time.
--
-- Per person: height and strong side (hand or foot). Only the person and the
-- coaches who see the roster see them; only the person sets them.

create table if not exists public.team_player_details (
  team_id uuid not null references public.teams (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  jersey_number smallint check (jersey_number between 0 and 99),
  position text check (char_length(btrim(position)) between 1 and 30),
  updated_at timestamptz not null default now(),
  primary key (team_id, person_id)
);

create unique index if not exists team_player_details_number on public.team_player_details (team_id, jersey_number) where jersey_number is not null;

-- Only for players of that team.
create or replace function app.check_team_player_details() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships m where m.team_id = new.team_id and m.person_id = new.person_id and m.role = 'athlete') then
    raise exception 'Only a player of the team has a number and position there.' using errcode = 'check_violation';
  end if;
  new.position := nullif(btrim(new.position), '');
  new.updated_at := now();
  return new;
end $$;

create or replace trigger team_player_details_check before insert or update on public.team_player_details
  for each row execute function app.check_team_player_details();

create table if not exists public.person_details (
  person_id uuid primary key references public.people (id) on delete cascade,
  height_cm smallint check (height_cm between 100 and 230),
  strong_side text check (strong_side in ('left', 'right', 'both')),
  updated_at timestamptz not null default now()
);

alter table public.team_player_details enable row level security;
alter table public.person_details enable row level security;
revoke all on public.team_player_details, public.person_details from anon, authenticated;
grant select, insert, update, delete on public.team_player_details, public.person_details to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_player_details' and policyname = 'team_player_details_read') then
    create policy team_player_details_read on public.team_player_details for select to authenticated
      using (app.is_me(person_id) or app.has_perm(team_id, 'viewRoster'));
    create policy team_player_details_add on public.team_player_details for insert to authenticated
      with check (app.is_me(person_id) or app.has_perm(team_id, 'manageGroups'));
    create policy team_player_details_change on public.team_player_details for update to authenticated
      using (app.is_me(person_id) or app.has_perm(team_id, 'manageGroups'))
      with check (app.is_me(person_id) or app.has_perm(team_id, 'manageGroups'));
    create policy team_player_details_remove on public.team_player_details for delete to authenticated
      using (app.is_me(person_id) or app.has_perm(team_id, 'manageGroups'));

    create policy person_details_read on public.person_details for select to authenticated
      using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewRoster'));
    create policy person_details_add on public.person_details for insert to authenticated
      with check (app.is_me(person_id));
    create policy person_details_change on public.person_details for update to authenticated
      using (app.is_me(person_id)) with check (app.is_me(person_id));
    create policy person_details_remove on public.person_details for delete to authenticated
      using (app.is_me(person_id));
  end if;
end $$;

-- Leaving the team frees the number.
create or replace function app.drop_team_player_details() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'athlete' then
    delete from public.team_player_details d where d.team_id = old.team_id and d.person_id = old.person_id;
  end if;
  return null;
end $$;

create or replace trigger memberships_drop_player_details after delete on public.memberships
  for each row execute function app.drop_team_player_details();

revoke all on function app.check_team_player_details(), app.drop_team_player_details() from public, anon, authenticated;

-- Live updates (0045).
do $$
begin
  execute 'create or replace trigger team_player_details_note_insert after insert on public.team_player_details referencing new table as changed_new for each statement execute function app.note_insert()';
  execute 'create or replace trigger team_player_details_note_update after update on public.team_player_details referencing old table as changed_old new table as changed_new for each statement execute function app.note_update()';
  execute 'create or replace trigger team_player_details_note_delete after delete on public.team_player_details referencing old table as changed_old for each statement execute function app.note_delete()';
  execute 'create or replace trigger person_details_note_insert after insert on public.person_details referencing new table as changed_new for each statement execute function app.note_insert()';
  execute 'create or replace trigger person_details_note_update after update on public.person_details referencing old table as changed_old new table as changed_new for each statement execute function app.note_update()';
  execute 'create or replace trigger person_details_note_delete after delete on public.person_details referencing old table as changed_old for each statement execute function app.note_delete()';
end $$;
