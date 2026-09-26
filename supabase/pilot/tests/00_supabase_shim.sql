-- Local stand-in for the parts of Supabase the pilot schema relies on.
--
-- ONLY for testing the migrations against a plain Postgres (see
-- supabase/pilot/README.md). Never run this against the Supabase project: it
-- already has these roles, the auth schema and auth.uid().

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  -- What the app keeps with the account (the app language, area 6b).
  raw_user_meta_data jsonb
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

-- pg_net stand-in (piece 7): records the calls instead of sending them.
create schema if not exists net;
create table if not exists net.calls (id bigserial primary key, url text, body jsonb, headers jsonb, at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$
  insert into net.calls (url, body, headers) values (url, body, headers) returning id
$$;

-- Supabase Vault stand-in (piece 20): same functions and view, stored in
-- plain text (tests only; the project encrypts).
create schema if not exists vault;
create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $$
  insert into vault.secrets (name, description, secret) values (new_name, coalesce(new_description, ''), new_secret) returning id
$$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
    description = coalesce(new_description, description), updated_at = now() where id = secret_id
$$;
create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at, updated_at from vault.secrets;
