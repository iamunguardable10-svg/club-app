-- Club App / TeamLoad OS
-- Invite and reusable team join-code functions for V1
--
-- This migration adds:
-- - team_join_codes table for reusable athlete onboarding
-- - safe invite lookup RPC
-- - safe invite accept RPC
-- - safe team-code lookup RPC
-- - safe team-code join RPC
--
-- Product model:
-- - Personal invites are used for department leads and coaches.
-- - Reusable team join codes are used for athletes.
-- - Team join codes can only create athlete memberships.

-- -----------------------------------------------------------------------------
-- Team join codes
-- -----------------------------------------------------------------------------

create table if not exists public.team_join_codes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  code text unique not null,
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_join_codes_max_uses_check check (max_uses is null or use_count <= max_uses)
);

create index if not exists idx_team_join_codes_code on public.team_join_codes(code);
create index if not exists idx_team_join_codes_team_id on public.team_join_codes(team_id);
create index if not exists idx_team_join_codes_club_id on public.team_join_codes(club_id);

create trigger set_team_join_codes_updated_at
before update on public.team_join_codes
for each row execute function public.set_updated_at();

alter table public.team_join_codes enable row level security;

-- -----------------------------------------------------------------------------
-- RLS for team_join_codes
-- -----------------------------------------------------------------------------

drop policy if exists "team_join_codes_select_managers" on public.team_join_codes;
drop policy if exists "team_join_codes_insert_team_staff" on public.team_join_codes;
drop policy if exists "team_join_codes_update_team_staff" on public.team_join_codes;
drop policy if exists "team_join_codes_delete_team_staff" on public.team_join_codes;

create policy "team_join_codes_select_managers"
on public.team_join_codes for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
);

create policy "team_join_codes_insert_team_staff"
on public.team_join_codes for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.is_club_admin(club_id)
    or public.is_department_lead(department_id)
    or public.is_team_staff(team_id)
  )
);

create policy "team_join_codes_update_team_staff"
on public.team_join_codes for update
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
)
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
);

create policy "team_join_codes_delete_team_staff"
on public.team_join_codes for delete
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
);

-- -----------------------------------------------------------------------------
-- Safe invite preview
-- -----------------------------------------------------------------------------

create or replace function public.get_invite_by_token(p_token text)
returns table (
  invite_type text,
  role text,
  status text,
  expires_at timestamptz,
  club_name text,
  department_name text,
  team_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.invite_type,
    i.role,
    case
      when i.expires_at is not null and i.expires_at < now() then 'expired'
      else i.status
    end as status,
    i.expires_at,
    c.name as club_name,
    d.name as department_name,
    t.name as team_name
  from public.invites i
  join public.clubs c on c.id = i.club_id
  left join public.departments d on d.id = i.department_id
  left join public.teams t on t.id = i.team_id
  where i.token = p_token
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Accept personal invite
-- -----------------------------------------------------------------------------

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_user_id uuid := auth.uid();
  v_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_invite
  from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    update public.invites
    set status = 'expired'
    where id = v_invite.id;

    raise exception 'invite_expired';
  end if;

  -- Department lead invite creates a club_membership.
  if v_invite.invite_type = 'department_lead_invite' then
    if v_invite.role <> 'department_lead' or v_invite.department_id is null then
      raise exception 'invalid_department_lead_invite';
    end if;

    insert into public.club_memberships (
      user_id,
      club_id,
      department_id,
      role,
      status
    )
    values (
      v_user_id,
      v_invite.club_id,
      v_invite.department_id,
      'department_lead',
      'active'
    )
    on conflict (user_id, club_id, department_id, role)
    do update set status = 'active'
    returning id into v_membership_id;

  -- Coach invite creates a team_membership when team_id is present.
  -- If team_id is null, V1 cannot create a team-level coach assignment yet.
  elsif v_invite.invite_type = 'coach_invite' then
    if v_invite.role not in ('head_coach', 'assistant_coach') then
      raise exception 'invalid_coach_role';
    end if;

    if v_invite.department_id is null or v_invite.team_id is null then
      raise exception 'coach_invite_requires_team_in_v1';
    end if;

    insert into public.team_memberships (
      user_id,
      club_id,
      department_id,
      team_id,
      role,
      status
    )
    values (
      v_user_id,
      v_invite.club_id,
      v_invite.department_id,
      v_invite.team_id,
      v_invite.role,
      'active'
    )
    on conflict (user_id, team_id, role)
    do update set status = 'active'
    returning id into v_membership_id;

  else
    raise exception 'unsupported_invite_type_for_accept_invite';
  end if;

  update public.invites
  set
    status = 'accepted',
    accepted_by = v_user_id,
    accepted_at = now()
  where id = v_invite.id;

  insert into public.activity_events (
    club_id,
    department_id,
    team_id,
    actor_id,
    event_type,
    title,
    body
  )
  values (
    v_invite.club_id,
    v_invite.department_id,
    v_invite.team_id,
    v_user_id,
    'invite_accepted',
    'Invite accepted',
    'A user accepted a personal invite.'
  );

  return jsonb_build_object(
    'ok', true,
    'invite_type', v_invite.invite_type,
    'role', v_invite.role,
    'club_id', v_invite.club_id,
    'department_id', v_invite.department_id,
    'team_id', v_invite.team_id,
    'membership_id', v_membership_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Safe team-code preview
-- -----------------------------------------------------------------------------

create or replace function public.get_team_by_join_code(p_code text)
returns table (
  status text,
  expires_at timestamptz,
  club_name text,
  department_name text,
  team_name text,
  sport text,
  season text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when tjc.is_active = false then 'inactive'
      when tjc.expires_at is not null and tjc.expires_at < now() then 'expired'
      when tjc.max_uses is not null and tjc.use_count >= tjc.max_uses then 'max_uses_reached'
      else 'active'
    end as status,
    tjc.expires_at,
    c.name as club_name,
    d.name as department_name,
    t.name as team_name,
    t.sport,
    t.season
  from public.team_join_codes tjc
  join public.clubs c on c.id = tjc.club_id
  join public.departments d on d.id = tjc.department_id
  join public.teams t on t.id = tjc.team_id
  where upper(tjc.code) = upper(p_code)
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Join team by reusable athlete code
-- -----------------------------------------------------------------------------

create or replace function public.join_team_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.team_join_codes%rowtype;
  v_user_id uuid := auth.uid();
  v_membership_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_code
  from public.team_join_codes
  where upper(code) = upper(p_code)
  for update;

  if not found then
    raise exception 'join_code_not_found';
  end if;

  if v_code.is_active = false then
    raise exception 'join_code_inactive';
  end if;

  if v_code.expires_at is not null and v_code.expires_at < now() then
    raise exception 'join_code_expired';
  end if;

  if v_code.max_uses is not null and v_code.use_count >= v_code.max_uses then
    raise exception 'join_code_max_uses_reached';
  end if;

  insert into public.team_memberships (
    user_id,
    club_id,
    department_id,
    team_id,
    role,
    status
  )
  values (
    v_user_id,
    v_code.club_id,
    v_code.department_id,
    v_code.team_id,
    'athlete',
    'active'
  )
  on conflict (user_id, team_id, role)
  do update set status = 'active'
  returning id into v_membership_id;

  update public.team_join_codes
  set use_count = use_count + 1
  where id = v_code.id;

  insert into public.activity_events (
    club_id,
    department_id,
    team_id,
    actor_id,
    event_type,
    title,
    body
  )
  values (
    v_code.club_id,
    v_code.department_id,
    v_code.team_id,
    v_user_id,
    'team_joined',
    'Athlete joined team',
    'An athlete joined through a reusable team join code.'
  );

  return jsonb_build_object(
    'ok', true,
    'role', 'athlete',
    'club_id', v_code.club_id,
    'department_id', v_code.department_id,
    'team_id', v_code.team_id,
    'membership_id', v_membership_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Generate a reusable team join code
-- -----------------------------------------------------------------------------

create or replace function public.create_team_join_code(
  p_team_id uuid,
  p_code text default null,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_user_id uuid := auth.uid();
  v_code text;
  v_row public.team_join_codes%rowtype;
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

  if p_max_uses is not null and p_max_uses <= 0 then
    raise exception 'max_uses_must_be_positive';
  end if;

  v_code := upper(coalesce(p_code, substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6)));

  insert into public.team_join_codes (
    club_id,
    department_id,
    team_id,
    code,
    created_by,
    expires_at,
    max_uses
  )
  values (
    v_team.club_id,
    v_team.department_id,
    v_team.id,
    v_code,
    v_user_id,
    p_expires_at,
    p_max_uses
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'code', v_row.code,
    'club_id', v_row.club_id,
    'department_id', v_row.department_id,
    'team_id', v_row.team_id,
    'expires_at', v_row.expires_at,
    'max_uses', v_row.max_uses
  );
end;
$$;
