-- Custom coach role slots for teams.
--
-- Product logic:
-- - Head Coach and Assistant Coach remain built-in V1 roles.
-- - Clubs can add team-specific labeled coach slots such as "Strength Coach".
-- - Custom slots currently inherit assistant_coach permissions under the hood,
--   while preserving their own display label and occupancy.

create table if not exists public.team_coach_role_slots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, label)
);

create index if not exists idx_team_coach_role_slots_club_id on public.team_coach_role_slots(club_id);
create index if not exists idx_team_coach_role_slots_department_id on public.team_coach_role_slots(department_id);
create index if not exists idx_team_coach_role_slots_team_id on public.team_coach_role_slots(team_id);

create trigger set_team_coach_role_slots_updated_at
before update on public.team_coach_role_slots
for each row execute function public.set_updated_at();

alter table public.team_coach_role_slots enable row level security;

create policy "team_coach_role_slots_select_context"
on public.team_coach_role_slots for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_member(department_id)
);

create policy "team_coach_role_slots_insert_managers"
on public.team_coach_role_slots for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

create policy "team_coach_role_slots_update_managers"
on public.team_coach_role_slots for update
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
)
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

create policy "team_coach_role_slots_delete_managers"
on public.team_coach_role_slots for delete
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
);

alter table public.invites
add column if not exists coach_role_slot_id uuid references public.team_coach_role_slots(id) on delete set null;

alter table public.team_memberships
add column if not exists coach_role_slot_id uuid references public.team_coach_role_slots(id) on delete set null;

create index if not exists idx_invites_coach_role_slot_id on public.invites(coach_role_slot_id);
create index if not exists idx_team_memberships_coach_role_slot_id on public.team_memberships(coach_role_slot_id);

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
    update public.invites set status = 'expired' where id = v_invite.id;
    raise exception 'invite_expired';
  end if;

  if v_invite.invite_type = 'department_lead_invite' then
    insert into public.club_memberships (user_id, club_id, department_id, role, status)
    values (v_user_id, v_invite.club_id, v_invite.department_id, 'department_lead', 'active')
    on conflict (user_id, club_id, department_id, role) do update set status = 'active'
    returning id into v_membership_id;
  elsif v_invite.invite_type = 'coach_invite' then
    if v_invite.department_id is null or v_invite.team_id is null then
      raise exception 'coach_invite_requires_team_in_v1';
    end if;

    insert into public.team_memberships (
      user_id,
      club_id,
      department_id,
      team_id,
      role,
      status,
      coach_role_slot_id
    )
    values (
      v_user_id,
      v_invite.club_id,
      v_invite.department_id,
      v_invite.team_id,
      v_invite.role,
      'active',
      v_invite.coach_role_slot_id
    )
    on conflict (user_id, team_id, role) do update
      set
        status = 'active',
        coach_role_slot_id = excluded.coach_role_slot_id
    returning id into v_membership_id;
  else
    raise exception 'unsupported_invite_type_for_accept_invite';
  end if;

  update public.invites
  set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'ok', true,
    'invite_type', v_invite.invite_type,
    'role', v_invite.role,
    'club_id', v_invite.club_id,
    'department_id', v_invite.department_id,
    'team_id', v_invite.team_id,
    'coach_role_slot_id', v_invite.coach_role_slot_id,
    'membership_id', v_membership_id
  );
end;
$$;
