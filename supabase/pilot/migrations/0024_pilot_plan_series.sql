-- Piece 22: own training as a weekly series (decided 2026-09-25).
--
-- A player plans own training "weekly on Mon and Thu until …": the app makes
-- one ordinary plan per day (each asks "How hard was it?" and counts in the
-- load) and marks them with a shared series id, so they can be changed or
-- deleted "this and following" together. Nothing else changes: the rules
-- for athlete_plans (own rows only; coaches with viewAthletePlans read)
-- stay as they are.

alter table public.athlete_plans add column series_id uuid;
create index athlete_plans_series on public.athlete_plans (person_id, series_id) where series_id is not null;
