-- Add optional default facility to teams.
--
-- Product reason:
-- Teams should be able to define a default training facility so session creation
-- later starts with the most likely location and reduces coach friction.

alter table public.teams
add column if not exists default_facility_id uuid references public.facilities(id) on delete set null;

create index if not exists idx_teams_default_facility_id on public.teams(default_facility_id);
