-- Calendar foundation V1
-- Expands sessions from "exactly one team" toward:
-- - one owner team
-- - optional invited / accepted teams
-- - team-internal reusable player groups
-- - session targeting by groups and individual players

alter table public.sessions
  add column if not exists owner_team_id uuid references public.teams(id) on delete cascade;

update public.sessions
set owner_team_id = team_id
where owner_team_id is null;

alter table public.sessions
  alter column owner_team_id set not null;

create index if not exists idx_sessions_owner_team_id on public.sessions(owner_team_id);

create or replace function public.sync_session_owner_team()
returns trigger
language plpgsql
as $$
begin
  if new.owner_team_id is null and new.team_id is not null then
    new.owner_team_id := new.team_id;
  end if;

  if new.team_id is null and new.owner_team_id is not null then
    new.team_id := new.owner_team_id;
  end if;

  if new.team_id is distinct from new.owner_team_id then
    raise exception 'session_owner_team_must_match_legacy_team_id';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_session_owner_team on public.sessions;
create trigger trg_sync_session_owner_team
before insert or update of team_id, owner_team_id on public.sessions
for each row execute function public.sync_session_owner_team();

create table if not exists public.session_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  relation_status text not null check (relation_status in ('owner', 'invited', 'accepted', 'declined')),
  invited_by uuid references public.profiles(id) on delete set null,
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, team_id)
);

create index if not exists idx_session_teams_session_id on public.session_teams(session_id);
create index if not exists idx_session_teams_team_id on public.session_teams(team_id);
create index if not exists idx_session_teams_relation_status on public.session_teams(relation_status);

insert into public.session_teams (session_id, team_id, relation_status)
select s.id, s.owner_team_id, 'owner'
from public.sessions s
on conflict (session_id, team_id) do nothing;

create or replace function public.ensure_owner_session_team()
returns trigger
language plpgsql
as $$
begin
  insert into public.session_teams (session_id, team_id, relation_status)
  values (new.id, new.owner_team_id, 'owner')
  on conflict (session_id, team_id) do update
    set relation_status = 'owner';

  return new;
end;
$$;

drop trigger if exists trg_ensure_owner_session_team on public.sessions;
create trigger trg_ensure_owner_session_team
after insert or update of owner_team_id on public.sessions
for each row execute function public.ensure_owner_session_team();

create table if not exists public.player_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

create index if not exists idx_player_groups_team_id on public.player_groups(team_id);

drop trigger if exists trg_player_groups_updated_at on public.player_groups;
create trigger trg_player_groups_updated_at
before update on public.player_groups
for each row execute function public.set_updated_at();

create table if not exists public.player_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.player_groups(id) on delete cascade,
  team_membership_id uuid not null references public.team_memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, team_membership_id)
);

create index if not exists idx_player_group_members_group_id on public.player_group_members(group_id);
create index if not exists idx_player_group_members_team_membership_id on public.player_group_members(team_membership_id);

create table if not exists public.session_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  group_id uuid not null references public.player_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, group_id)
);

create index if not exists idx_session_groups_session_id on public.session_groups(session_id);
create index if not exists idx_session_groups_group_id on public.session_groups(group_id);

create table if not exists public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  team_membership_id uuid not null references public.team_memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, team_membership_id)
);

create index if not exists idx_session_players_session_id on public.session_players(session_id);
create index if not exists idx_session_players_team_membership_id on public.session_players(team_membership_id);

alter table public.session_teams enable row level security;
alter table public.player_groups enable row level security;
alter table public.player_group_members enable row level security;
alter table public.session_groups enable row level security;
alter table public.session_players enable row level security;

create or replace function public.is_session_team_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_teams st
    where st.session_id = p_session_id
      and st.relation_status in ('owner', 'accepted')
      and public.is_team_member(st.team_id)
  );
$$;

create or replace function public.is_session_team_staff(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_teams st
    where st.session_id = p_session_id
      and st.relation_status in ('owner', 'invited', 'accepted')
      and public.is_team_staff(st.team_id)
  );
$$;

create or replace function public.can_manage_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        public.is_club_admin(s.club_id)
        or public.is_department_lead(s.department_id)
        or public.is_team_staff(s.owner_team_id)
      )
  );
$$;

create or replace function public.can_view_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and (
        public.is_club_admin(s.club_id)
        or public.is_department_lead(s.department_id)
        or public.is_session_team_member(s.id)
        or public.is_session_team_staff(s.id)
      )
  );
$$;

drop policy if exists "sessions_select_context" on public.sessions;
drop policy if exists "sessions_insert_allowed" on public.sessions;
drop policy if exists "sessions_update_allowed" on public.sessions;

create policy "sessions_select_context"
on public.sessions for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_session_team_member(id)
  or public.is_session_team_staff(id)
);

create policy "sessions_insert_allowed"
on public.sessions for insert
to authenticated
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(owner_team_id)
);

create policy "sessions_update_allowed"
on public.sessions for update
to authenticated
using (public.can_manage_session(id))
with check (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(owner_team_id)
);

create policy "session_teams_select_context"
on public.session_teams for select
to authenticated
using (
  public.can_view_session(session_id)
  or public.is_team_staff(team_id)
);

create policy "session_teams_insert_session_manager"
on public.session_teams for insert
to authenticated
with check (public.can_manage_session(session_id));

create policy "session_teams_update_session_manager_or_invited_team_staff"
on public.session_teams for update
to authenticated
using (
  public.can_manage_session(session_id)
  or public.is_team_staff(team_id)
)
with check (
  public.can_manage_session(session_id)
  or public.is_team_staff(team_id)
);

create policy "session_teams_delete_session_manager"
on public.session_teams for delete
to authenticated
using (public.can_manage_session(session_id));

create policy "player_groups_select_team_context"
on public.player_groups for select
to authenticated
using (public.can_view_team(team_id));

create policy "player_groups_insert_team_manager"
on public.player_groups for insert
to authenticated
with check (public.can_manage_team(team_id));

create policy "player_groups_update_team_manager"
on public.player_groups for update
to authenticated
using (public.can_manage_team(team_id))
with check (public.can_manage_team(team_id));

create policy "player_groups_delete_team_manager"
on public.player_groups for delete
to authenticated
using (public.can_manage_team(team_id));

create policy "player_group_members_select_team_context"
on public.player_group_members for select
to authenticated
using (
  exists (
    select 1
    from public.player_groups pg
    where pg.id = group_id
      and public.can_view_team(pg.team_id)
  )
);

create policy "player_group_members_insert_team_manager"
on public.player_group_members for insert
to authenticated
with check (
  exists (
    select 1
    from public.player_groups pg
    where pg.id = group_id
      and public.can_manage_team(pg.team_id)
  )
);

create policy "player_group_members_update_team_manager"
on public.player_group_members for update
to authenticated
using (
  exists (
    select 1
    from public.player_groups pg
    where pg.id = group_id
      and public.can_manage_team(pg.team_id)
  )
)
with check (
  exists (
    select 1
    from public.player_groups pg
    where pg.id = group_id
      and public.can_manage_team(pg.team_id)
  )
);

create policy "player_group_members_delete_team_manager"
on public.player_group_members for delete
to authenticated
using (
  exists (
    select 1
    from public.player_groups pg
    where pg.id = group_id
      and public.can_manage_team(pg.team_id)
  )
);

create policy "session_groups_select_context"
on public.session_groups for select
to authenticated
using (public.can_view_session(session_id));

create policy "session_groups_insert_session_manager"
on public.session_groups for insert
to authenticated
with check (public.can_manage_session(session_id));

create policy "session_groups_update_session_manager"
on public.session_groups for update
to authenticated
using (public.can_manage_session(session_id))
with check (public.can_manage_session(session_id));

create policy "session_groups_delete_session_manager"
on public.session_groups for delete
to authenticated
using (public.can_manage_session(session_id));

create policy "session_players_select_context"
on public.session_players for select
to authenticated
using (public.can_view_session(session_id));

create policy "session_players_insert_session_manager"
on public.session_players for insert
to authenticated
with check (public.can_manage_session(session_id));

create policy "session_players_update_session_manager"
on public.session_players for update
to authenticated
using (public.can_manage_session(session_id))
with check (public.can_manage_session(session_id));

create policy "session_players_delete_session_manager"
on public.session_players for delete
to authenticated
using (public.can_manage_session(session_id));

grant select, insert, update, delete on public.session_teams to authenticated;
grant select, insert, update, delete on public.player_groups to authenticated;
grant select, insert, update, delete on public.player_group_members to authenticated;
grant select, insert, update, delete on public.session_groups to authenticated;
grant select, insert, update, delete on public.session_players to authenticated;
