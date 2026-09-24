-- Local stand-in for the parts of Supabase the pilot schema relies on.
--
-- ONLY for testing the migrations against a plain Postgres (see
-- supabase/pilot/README.md). Never run this against the Supabase project: it
-- already has these roles, the auth schema and auth.uid().

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- Supabase reads the user id from the request's JWT claims; the tests set
-- the same setting with `set_config('request.jwt.claims', ...)`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  -- A pooled connection keeps an empty setting after a request; Supabase
  -- reads that as "nobody", so this does too.
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
