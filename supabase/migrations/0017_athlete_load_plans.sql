-- Athlete expected load planning V1
-- Separates expected future load from completed load_entries.

create table if not exists public.athlete_load_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  plan_date date not null,
  planned_time time,
  training_type text not null check (training_type in ('team_training', 'strength', 'game', 'individual', 'recovery', 'school_sport', 'prehab')),
  expected_rpe integer not null check (expected_rpe between 1 and 10),
  expected_duration_minutes integer not null check (expected_duration_minutes between 1 and 360),
  title text,
  note text,
  status text not null default 'planned' check (status in ('planned', 'completed', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_athlete_load_plans_user_date on public.athlete_load_plans(user_id, plan_date desc);
create index if not exists idx_athlete_load_plans_team_id on public.athlete_load_plans(team_id);
create index if not exists idx_athlete_load_plans_status on public.athlete_load_plans(status);

drop trigger if exists trg_athlete_load_plans_updated_at on public.athlete_load_plans;
create trigger trg_athlete_load_plans_updated_at
before update on public.athlete_load_plans
for each row execute function public.set_updated_at();

alter table public.athlete_load_plans enable row level security;

drop policy if exists "athlete_load_plans_select_context" on public.athlete_load_plans;
drop policy if exists "athlete_load_plans_insert_own" on public.athlete_load_plans;
drop policy if exists "athlete_load_plans_update_own" on public.athlete_load_plans;
drop policy if exists "athlete_load_plans_delete_own" on public.athlete_load_plans;

create policy "athlete_load_plans_select_context"
on public.athlete_load_plans for select
to authenticated
using (
  user_id = auth.uid()
  or (
    team_id is not null
    and (
      public.is_team_staff(team_id)
      or exists (
        select 1
        from public.teams t
        where t.id = athlete_load_plans.team_id
          and public.is_department_lead(t.department_id)
      )
    )
  )
);

create policy "athlete_load_plans_insert_own"
on public.athlete_load_plans for insert
to authenticated
with check (user_id = auth.uid());

create policy "athlete_load_plans_update_own"
on public.athlete_load_plans for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "athlete_load_plans_delete_own"
on public.athlete_load_plans for delete
to authenticated
using (user_id = auth.uid());
