-- Staying signed in when the app is added to the home screen (2026-09-25).
--
-- On iPhones a web app on the home screen gets its own, empty storage, so
-- the sign-in from Safari does not come along and people had to sign in
-- again. Now the signed-in Safari page asks for a one-time code, puts it in
-- the address the home-screen app starts with, and the app trades it once
-- for a sign-in of its own (Edge Function `login-handoff`, which makes a
-- one-time sign-in token for that account; no email is sent).
--
-- The code is random (256 bits), for the account that asked only, valid for
-- 10 minutes and used once; afterwards the start address holds a dead code.

create table app.login_handoffs (
  code text primary key check (code ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index login_handoffs_user on app.login_handoffs (user_id);

-- The signed-in account's code (older unused ones of the account are dropped).
create or replace function public.create_login_handoff() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;
  delete from app.login_handoffs where user_id = v_user or created_at < now() - interval '1 day';
  insert into app.login_handoffs (code, user_id) values (v_code, v_user);
  return v_code;
end $$;

-- For the Edge Function (server key only): the account's email for a code
-- that is fresh and unused, marking it used; null otherwise.
create or replace function public.consume_login_handoff(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  update app.login_handoffs set used_at = now()
  where code = p_code and used_at is null and created_at > now() - interval '10 minutes'
  returning user_id into v_user;
  if v_user is null then
    return null;
  end if;
  return (select u.email from auth.users u where u.id = v_user);
end $$;

revoke all on function public.create_login_handoff(), public.consume_login_handoff(text) from public, anon, authenticated;
grant execute on function public.create_login_handoff() to authenticated;
grant execute on function public.consume_login_handoff(text) to service_role;
