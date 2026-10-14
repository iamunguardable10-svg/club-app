-- Rate limits for everything that can be called over the API and is worth
-- trying many times (2026-10-14).
--
-- A sliding ("floating") window per caller: the account when signed in,
-- otherwise the client IP the API gateway forwards. Each bucket keeps two
-- counters per caller (this window and the one before) and weights the
-- previous one by how much of it still overlaps, so a burst at a window
-- border cannot double the limit. Only upserts, no row ever needs deleting.
--
-- A call that ends in an error rolls back its own count (Postgres has no
-- autonomous transactions), so only calls that go through are counted. That
-- is enough here: the limits are against spam and mass use, and every secret
-- that could be guessed is far too large to try out (join codes 32^8, founding
-- codes 32^10, links 128 bits and more); the previews that answer "no such
-- code" without an error are counted.
--
-- Calls without API request headers (the database itself, cron, tests that
-- do not set them) are not limited: they never come from the internet.
--
-- The limited public functions are wrappers: the original bodies were moved
-- unchanged to app.<name>_unlimited, and the public function checks the
-- limit first, then calls it. A later `create or replace public.<name>`
-- must keep the check (or call app.rate_allow itself).

create table app.rate_windows (
  bucket text not null,
  caller text not null,
  window_start bigint not null,
  current_count integer not null default 0,
  previous_count integer not null default 0,
  primary key (bucket, caller)
);
alter table app.rate_windows enable row level security;
revoke all on app.rate_windows from public, anon, authenticated;

-- Who is calling: the account, else the client IP from the gateway headers,
-- else null (not an API call).
create or replace function app.rate_caller() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_ip text;
begin
  if auth.uid() is not null then
    return 'user:' || auth.uid()::text;
  end if;
  if v_headers is null then
    return null;
  end if;
  v_ip := coalesce(
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(v_headers ->> 'x-real-ip', ''),
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
  return 'ip:' || v_ip;
end $$;

-- Counts one call in `bucket` and says whether it is within `p_limit` calls
-- per `p_window_seconds` (sliding window). Always true without a caller.
create or replace function app.rate_allow(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_caller text := app.rate_caller();
  v_now double precision := extract(epoch from clock_timestamp());
  v_window bigint := floor(v_now / p_window_seconds)::bigint;
  v_row app.rate_windows;
  v_weight double precision;
begin
  if v_caller is null then
    return true;
  end if;
  insert into app.rate_windows as w (bucket, caller, window_start, current_count, previous_count)
  values (p_bucket, v_caller, v_window, 1, 0)
  on conflict (bucket, caller) do update set
    previous_count = case
      when w.window_start = v_window then w.previous_count
      when w.window_start = v_window - 1 then w.current_count
      else 0 end,
    current_count = case when w.window_start = v_window then w.current_count + 1 else 1 end,
    window_start = v_window
  returning * into v_row;
  -- Share of the previous window that still lies inside the sliding window.
  v_weight := 1 - (v_now - v_window * p_window_seconds) / p_window_seconds;
  return v_row.previous_count * v_weight + v_row.current_count <= p_limit;
end $$;

-- Raises the one message the app knows (serverMessages.ts) when over the limit.
create or replace function app.rate_check(p_bucket text, p_limit integer, p_window_seconds integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.rate_allow(p_bucket, p_limit, p_window_seconds) then
    raise exception 'Too many attempts. Please wait a few minutes and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
end $$;

revoke all on function app.rate_caller(), app.rate_allow(text, integer, integer), app.rate_check(text, integer, integer)
  from public, anon, authenticated;

-- Move the originals out of the API, unchanged.
alter function public.join_code_preview(text) rename to join_code_preview_unlimited;
alter function public.join_code_preview_unlimited(text) set schema app;
alter function public.founding_code_usable(text) rename to founding_code_usable_unlimited;
alter function public.founding_code_usable_unlimited(text) set schema app;
alter function public.invite_preview(uuid) rename to invite_preview_unlimited;
alter function public.invite_preview_unlimited(uuid) set schema app;
alter function public.parent_consent_preview(text) rename to parent_consent_preview_unlimited;
alter function public.parent_consent_preview_unlimited(text) set schema app;
alter function public.confirm_parent_consent(text, text, text, boolean, text) rename to confirm_parent_consent_unlimited;
alter function public.confirm_parent_consent_unlimited(text, text, text, boolean, text) set schema app;
alter function public.withdraw_parent_consent(text) rename to withdraw_parent_consent_unlimited;
alter function public.withdraw_parent_consent_unlimited(text) set schema app;
alter function public.join_team(text, text, text) rename to join_team_unlimited;
alter function public.join_team_unlimited(text, text, text) set schema app;
alter function public.found_club(text, text, text, text, text, text, text, boolean) rename to found_club_unlimited;
alter function public.found_club_unlimited(text, text, text, text, text, text, text, boolean) set schema app;
alter function public.accept_staff_invite(uuid) rename to accept_staff_invite_unlimited;
alter function public.accept_staff_invite_unlimited(uuid) set schema app;
alter function public.create_parent_consent_token(uuid) rename to create_parent_consent_token_unlimited;
alter function public.create_parent_consent_token_unlimited(uuid) set schema app;
alter function public.remind_open_players(uuid) rename to remind_open_players_unlimited;
alter function public.remind_open_players_unlimited(uuid) set schema app;
alter function public.create_login_handoff() rename to create_login_handoff_unlimited;
alter function public.create_login_handoff_unlimited() set schema app;

revoke all on function
  app.join_code_preview_unlimited(text), app.founding_code_usable_unlimited(text), app.invite_preview_unlimited(uuid),
  app.parent_consent_preview_unlimited(text), app.confirm_parent_consent_unlimited(text, text, text, boolean, text),
  app.withdraw_parent_consent_unlimited(text), app.join_team_unlimited(text, text, text),
  app.found_club_unlimited(text, text, text, text, text, text, text, boolean), app.accept_staff_invite_unlimited(uuid),
  app.create_parent_consent_token_unlimited(uuid), app.remind_open_players_unlimited(uuid), app.create_login_handoff_unlimited()
  from public, anon, authenticated;

-- Codes and links typed or opened before signing in: per IP.
create function public.join_code_preview(p_code text)
returns table (club_name text, team_name text, usable boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('join_code_preview', 30, 600);
  return query select * from app.join_code_preview_unlimited(p_code);
end $$;

create function public.founding_code_usable(p_code text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('founding_code', 10, 3600);
  return app.founding_code_usable_unlimited(p_code);
end $$;

create function public.invite_preview(p_token uuid)
returns table (kind text, club_name text, team_name text, first_name text, last_name text, role_name text, usable boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('invite_preview', 30, 600);
  return query select * from app.invite_preview_unlimited(p_token);
end $$;

create function public.parent_consent_preview(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('parent_consent', 20, 3600);
  return app.parent_consent_preview_unlimited(p_token);
end $$;

create function public.confirm_parent_consent(p_token text, p_name text, p_email text, p_guardian boolean, p_version text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('parent_consent', 20, 3600);
  return app.confirm_parent_consent_unlimited(p_token, p_name, p_email, p_guardian, p_version);
end $$;

create function public.withdraw_parent_consent(p_token text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('parent_consent', 20, 3600);
  return app.withdraw_parent_consent_unlimited(p_token);
end $$;

-- Signed-in actions: per account.
create function public.join_team(p_code text, p_first_name text, p_last_name text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('join_team', 10, 3600);
  return app.join_team_unlimited(p_code, p_first_name, p_last_name);
end $$;

create function public.found_club(p_code text, p_club_name text, p_city text, p_first_name text, p_last_name text,
  p_department_name text, p_team_name text, p_coach_team boolean default false) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('found_club', 5, 86400);
  return app.found_club_unlimited(p_code, p_club_name, p_city, p_first_name, p_last_name, p_department_name, p_team_name, p_coach_team);
end $$;

create function public.accept_staff_invite(p_token uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('accept_invite', 10, 3600);
  return app.accept_staff_invite_unlimited(p_token);
end $$;

create function public.create_parent_consent_token(p_person uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('parent_link', 10, 86400);
  return app.create_parent_consent_token_unlimited(p_person);
end $$;

-- Each reminder sends pushes to the open players.
create function public.remind_open_players(p_session uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('remind_open', 20, 3600);
  return app.remind_open_players_unlimited(p_session);
end $$;

create function public.create_login_handoff() returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('login_handoff', 20, 3600);
  return app.create_login_handoff_unlimited();
end $$;

revoke all on function
  public.join_code_preview(text), public.founding_code_usable(text), public.invite_preview(uuid),
  public.parent_consent_preview(text), public.confirm_parent_consent(text, text, text, boolean, text),
  public.withdraw_parent_consent(text), public.join_team(text, text, text),
  public.found_club(text, text, text, text, text, text, text, boolean), public.accept_staff_invite(uuid),
  public.create_parent_consent_token(uuid), public.remind_open_players(uuid), public.create_login_handoff()
  from public;
grant execute on function
  public.join_code_preview(text), public.founding_code_usable(text), public.invite_preview(uuid),
  public.parent_consent_preview(text), public.confirm_parent_consent(text, text, text, boolean, text),
  public.withdraw_parent_consent(text)
  to anon, authenticated;
grant execute on function
  public.join_team(text, text, text), public.found_club(text, text, text, text, text, text, text, boolean),
  public.accept_staff_invite(uuid), public.create_parent_consent_token(uuid), public.remind_open_players(uuid),
  public.create_login_handoff()
  to authenticated;

-- Messages reach whole teams or clubs and send pushes: 30 per hour per account.
create or replace function app.limit_message_posts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.rate_check('post_message', 30, 3600);
  return new;
end $$;
revoke all on function app.limit_message_posts() from public, anon, authenticated;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function app.limit_message_posts();

-- Carpool offers notify the team as well.
create or replace function app.limit_carpool_offers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.rate_check('carpool_offer', 20, 3600);
  return new;
end $$;
revoke all on function app.limit_carpool_offers() from public, anon, authenticated;
create trigger carpools_rate_limit before insert on public.carpools
  for each row execute function app.limit_carpool_offers();

-- Supabase's helper event trigger needs no API access.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
