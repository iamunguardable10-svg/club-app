-- Access: join codes for athletes, invitations for staff.
--
-- Step 4 of docs/simplify-decisions.md, point 8. An account only sees club
-- data once it is linked to a person with a membership; these are the two
-- ways that happens:
-- - Athletes sign up and enter their team's join code (join_team).
-- - Staff are added by name in the staff panel (Run 7), then get a personal
--   invitation link; accepting links their account to that person
--   (accept_staff_invite).
-- The first Head Coach of a club is set up the same way, with an invitation
-- created by the setup script (supabase/pilot/setup).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Eight characters without look-alikes (no I, O, 0, 1).
create table public.team_join_codes (
  team_id uuid primary key references public.teams (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.staff_invites (
  token uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz
);

create index staff_invites_person on public.staff_invites (person_id);
create index staff_invites_team on public.staff_invites (team_id);

-- ---------------------------------------------------------------------------
-- Every team has a join code from the start
-- ---------------------------------------------------------------------------

create or replace function app.random_join_code() returns text
language sql volatile set search_path = '' as $$
  -- gen_random_uuid() draws from a strong random source and is built in,
  -- unlike pgcrypto, which lives in a different schema on Supabase.
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(bytes, i) % 32) + 1, 1), '' order by i
  )
  from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') as bytes) b,
       generate_series(0, 7) as i
$$;

create or replace function app.create_join_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_join_codes (team_id, code) values (new.id, app.random_join_code());
  return new;
end $$;

create trigger teams_join_code after insert on public.teams
  for each row execute function app.create_join_code();

insert into public.team_join_codes (team_id, code)
select t.id, app.random_join_code() from public.teams t
where not exists (select 1 from public.team_join_codes c where c.team_id = t.id);

-- An invitation is for a staff member of that team who has no account yet.
create or replace function app.check_staff_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.person_id = new.person_id and m.team_id = new.team_id and m.role = 'coach'
  ) then
    raise exception 'Einladungen gibt es nur für Personen im Trainerteam.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.people p where p.id = new.person_id and p.user_id is not null) then
    raise exception 'Diese Person hat schon ein Konto.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger staff_invites_check before insert on public.staff_invites
  for each row execute function app.check_staff_invite();

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------

alter table public.team_join_codes enable row level security;
alter table public.staff_invites enable row level security;
revoke all on public.team_join_codes, public.staff_invites from anon, authenticated;
-- Codes are created with the team; the app may only read and replace them.
grant select, update (code) on public.team_join_codes to authenticated;
grant select, insert, delete on public.staff_invites to authenticated;

create policy team_join_codes_read on public.team_join_codes for select to authenticated
  using (app.has_perm(team_id, 'manageStaff'));
create policy team_join_codes_rotate on public.team_join_codes for update to authenticated
  using (app.has_perm(team_id, 'manageStaff')) with check (app.has_perm(team_id, 'manageStaff'));

create policy staff_invites_read on public.staff_invites for select to authenticated
  using (app.has_perm(team_id, 'manageStaff'));
create policy staff_invites_create on public.staff_invites for insert to authenticated
  with check (app.has_perm(team_id, 'manageStaff') and accepted_at is null);
create policy staff_invites_revoke on public.staff_invites for delete to authenticated
  using (app.has_perm(team_id, 'manageStaff'));

-- ---------------------------------------------------------------------------
-- Joining and accepting (the only functions the app calls directly)
-- ---------------------------------------------------------------------------

-- The signed-in user joins the team behind the code as an athlete. Creates
-- their person in that club unless they already have one there.
create or replace function public.join_team(p_code text, p_first_name text, p_last_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_team public.teams;
  v_person uuid;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;
  select t.* into v_team from public.team_join_codes c join public.teams t on t.id = c.team_id
  where c.code = upper(btrim(p_code));
  if not found then
    raise exception 'Diesen Beitrittscode gibt es nicht.' using errcode = 'no_data_found';
  end if;

  select p.id into v_person from public.people p where p.user_id = v_user and p.club_id = v_team.club_id;
  if v_person is null then
    if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then
      raise exception 'Vor- und Nachname werden gebraucht.' using errcode = 'check_violation';
    end if;
    insert into public.people (club_id, user_id, first_name, last_name)
    values (v_team.club_id, v_user, btrim(p_first_name), btrim(p_last_name))
    returning id into v_person;
  end if;

  insert into public.memberships (person_id, team_id, role)
  values (v_person, v_team.id, 'athlete')
  on conflict (person_id, team_id, role) do nothing;
  return v_team.id;
end $$;

-- The signed-in user becomes the invited staff member. If they already are
-- someone in that club (coach of another team, say), the invited placeholder
-- is merged into that person instead of creating a second one.
create or replace function public.accept_staff_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_invite public.staff_invites;
  v_placeholder public.people;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Nicht angemeldet.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_invite from public.staff_invites where token = p_token for update;
  if not found or v_invite.accepted_at is not null or v_invite.expires_at < now() then
    raise exception 'Diese Einladung gilt nicht mehr.' using errcode = 'no_data_found';
  end if;
  select * into v_placeholder from public.people where id = v_invite.person_id for update;
  if v_placeholder.user_id is not null then
    raise exception 'Diese Einladung wurde schon angenommen.' using errcode = 'unique_violation';
  end if;

  select p.id into v_existing from public.people p where p.user_id = v_user and p.club_id = v_placeholder.club_id;
  if v_existing is null then
    update public.people set user_id = v_user where id = v_placeholder.id;
  else
    -- Move the placeholder's memberships over, unless the person already has
    -- that role in that team, then drop the placeholder.
    update public.memberships m set person_id = v_existing
    where m.person_id = v_placeholder.id
      and not exists (
        select 1 from public.memberships x
        where x.person_id = v_existing and x.team_id = m.team_id and x.role = m.role
      );
    delete from public.people where id = v_placeholder.id;
  end if;

  update public.staff_invites set accepted_at = now() where token = p_token;
  return v_invite.team_id;
end $$;

-- What an invitation link is for, shown before signing up. The token is a
-- random UUID, so this reveals nothing to someone without the link.
create or replace function public.invite_preview(p_token uuid)
returns table (club_name text, team_name text, first_name text, last_name text, role_name text, usable boolean)
language sql stable security definer set search_path = '' as $$
  select c.name, t.name, p.first_name, p.last_name, r.name,
         i.accepted_at is null and i.expires_at >= now() and p.user_id is null
  from public.staff_invites i
  join public.people p on p.id = i.person_id
  join public.teams t on t.id = i.team_id
  join public.clubs c on c.id = t.club_id
  left join public.memberships m on m.person_id = p.id and m.team_id = t.id and m.role = 'coach'
  left join public.coach_roles r on r.id = m.coach_role_id
  where i.token = p_token
$$;

revoke all on function public.join_team(text, text, text), public.accept_staff_invite(uuid), public.invite_preview(uuid) from public, anon;
grant execute on function public.join_team(text, text, text), public.accept_staff_invite(uuid) to authenticated;
grant execute on function public.invite_preview(uuid) to anon, authenticated;
