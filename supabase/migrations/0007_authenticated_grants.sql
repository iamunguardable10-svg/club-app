-- Club App / TeamLoad OS
-- Grants for Supabase authenticated clients.
--
-- RLS policies decide row-level access, but authenticated users still need
-- table/function privileges first. Without these grants, Supabase returns:
-- "permission denied for table ..."

-- -----------------------------------------------------------------------------
-- Schema usage
-- -----------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant usage on schema public to anon;

-- -----------------------------------------------------------------------------
-- Table privileges
-- -----------------------------------------------------------------------------

-- Broad table privileges are intentional here. Actual access is restricted by RLS.
-- This is the normal Supabase pattern: grant table operations, enforce data access
-- through row level security policies.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- Apply the same defaults to future tables created in public.

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant select on tables to anon;

-- -----------------------------------------------------------------------------
-- Sequence privileges
-- -----------------------------------------------------------------------------

grant usage, select on all sequences in schema public to authenticated;

grant usage, select on all sequences in schema public to anon;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to anon;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to anon;

alter default privileges in schema public
  grant execute on functions to authenticated;

alter default privileges in schema public
  grant execute on functions to anon;
