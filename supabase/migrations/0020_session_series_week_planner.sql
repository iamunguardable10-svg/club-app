-- Weekly session series planner
-- Series are reusable weekly templates. Concrete sessions are created only when
-- a coach / department lead confirms a weekly batch.

alter table public.sessions
  add column if not exists series_id uuid,
  add column if not exists series_week_start date;

create table if not exists public.session_series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  session_type text not null default 'training' check (session_type in ('training', 'game', 's_and_c', 'recovery', 'video', 'meeting', 'other')),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'inactive', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_series_end_after_start check (end_time > start_time)
);

alter table public.sessions
  add constraint sessions_series_id_fkey foreign key (series_id) references public.session_series(id) on delete set null;

create index if not exists idx_session_series_club_id on public.session_series(club_id);
create index if not exists idx_session_series_department_id on public.session_series(department_id);
create index if not exists idx_session_series_team_id on public.session_series(team_id);
create index if not exists idx_session_series_facility_id on public.session_series(facility_id);
create index if not exists idx_session_series_status on public.session_series(status);
create index if not exists idx_sessions_series_id on public.sessions(series_id);
create index if not exists idx_sessions_series_week_start on public.sessions(series_week_start);
create unique index if not exists idx_sessions_series_week_unique
  on public.sessions(series_id, series_week_start)
  where series_id is not null and series_week_start is not null;

create or replace function public.is_department_facility(p_department_id uuid, p_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_facilities df
    where df.department_id = p_department_id
      and df.facility_id = p_facility_id
  );
$$;

drop trigger if exists trg_session_series_updated_at on public.session_series;
create trigger trg_session_series_updated_at
before update on public.session_series
for each row execute function public.set_updated_at();

create table if not exists public.session_series_groups (
  series_id uuid not null references public.session_series(id) on delete cascade,
  group_id uuid not null references public.player_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, group_id)
);

create index if not exists idx_session_series_groups_group_id on public.session_series_groups(group_id);

create table if not exists public.session_series_week_state (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.session_series(id) on delete cascade,
  week_start date not null,
  checked boolean not null default true,
  committed_session_id uuid references public.sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, week_start)
);

create index if not exists idx_session_series_week_state_series_id on public.session_series_week_state(series_id);
create index if not exists idx_session_series_week_state_week_start on public.session_series_week_state(week_start);
create index if not exists idx_session_series_week_state_committed_session_id on public.session_series_week_state(committed_session_id);

drop trigger if exists trg_session_series_week_state_updated_at on public.session_series_week_state;
create trigger trg_session_series_week_state_updated_at
before update on public.session_series_week_state
for each row execute function public.set_updated_at();

alter table public.session_series enable row level security;
alter table public.session_series_groups enable row level security;
alter table public.session_series_week_state enable row level security;

create or replace function public.can_view_session_series(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_series ss
    where ss.id = p_series_id
      and (
        public.is_club_admin(ss.club_id)
        or public.is_department_lead(ss.department_id)
        or public.is_team_staff(ss.team_id)
        or public.is_team_member(ss.team_id)
      )
  );
$$;

create or replace function public.can_manage_session_series(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.session_series ss
    where ss.id = p_series_id
      and (
        public.is_club_admin(ss.club_id)
        or public.is_department_lead(ss.department_id)
        or public.is_team_staff(ss.team_id)
      )
  );
$$;

create or replace function public.can_write_session_series_context(
  p_club_id uuid,
  p_department_id uuid,
  p_team_id uuid,
  p_facility_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.club_id = p_club_id
      and t.department_id = p_department_id
      and (
        public.is_club_admin(p_club_id)
        or public.is_department_lead(p_department_id)
        or public.is_team_staff(p_team_id)
      )
      and (
        p_facility_id is null
        or public.is_department_facility(p_department_id, p_facility_id)
      )
  );
$$;

drop policy if exists "session_series_select_context" on public.session_series;
create policy "session_series_select_context"
on public.session_series for select
to authenticated
using (
  public.is_club_admin(club_id)
  or public.is_department_lead(department_id)
  or public.is_team_staff(team_id)
  or public.is_team_member(team_id)
);

drop policy if exists "session_series_insert_manager" on public.session_series;
create policy "session_series_insert_manager"
on public.session_series for insert
to authenticated
with check (public.can_write_session_series_context(club_id, department_id, team_id, facility_id));

drop policy if exists "session_series_update_manager" on public.session_series;
create policy "session_series_update_manager"
on public.session_series for update
to authenticated
using (public.can_manage_session_series(id))
with check (public.can_write_session_series_context(club_id, department_id, team_id, facility_id));

drop policy if exists "session_series_delete_manager" on public.session_series;
create policy "session_series_delete_manager"
on public.session_series for delete
to authenticated
using (public.can_manage_session_series(id));

drop policy if exists "session_series_groups_select_context" on public.session_series_groups;
create policy "session_series_groups_select_context"
on public.session_series_groups for select
to authenticated
using (public.can_view_session_series(series_id));

drop policy if exists "session_series_groups_insert_manager" on public.session_series_groups;
create policy "session_series_groups_insert_manager"
on public.session_series_groups for insert
to authenticated
with check (
  public.can_manage_session_series(series_id)
  and exists (
    select 1
    from public.session_series ss
    join public.player_groups pg on pg.id = group_id
    where ss.id = series_id
      and pg.team_id = ss.team_id
  )
);

drop policy if exists "session_series_groups_delete_manager" on public.session_series_groups;
create policy "session_series_groups_delete_manager"
on public.session_series_groups for delete
to authenticated
using (public.can_manage_session_series(series_id));

drop policy if exists "session_series_week_state_select_context" on public.session_series_week_state;
create policy "session_series_week_state_select_context"
on public.session_series_week_state for select
to authenticated
using (public.can_view_session_series(series_id));

drop policy if exists "session_series_week_state_insert_manager" on public.session_series_week_state;
create policy "session_series_week_state_insert_manager"
on public.session_series_week_state for insert
to authenticated
with check (public.can_manage_session_series(series_id));

drop policy if exists "session_series_week_state_update_manager" on public.session_series_week_state;
create policy "session_series_week_state_update_manager"
on public.session_series_week_state for update
to authenticated
using (public.can_manage_session_series(series_id))
with check (public.can_manage_session_series(series_id));

drop policy if exists "session_series_week_state_delete_manager" on public.session_series_week_state;
create policy "session_series_week_state_delete_manager"
on public.session_series_week_state for delete
to authenticated
using (public.can_manage_session_series(series_id));

grant select, insert, update, delete on public.session_series to authenticated;
grant select, insert, update, delete on public.session_series_groups to authenticated;
grant select, insert, update, delete on public.session_series_week_state to authenticated;
