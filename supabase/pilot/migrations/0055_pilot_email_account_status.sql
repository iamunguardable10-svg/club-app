-- E-mail first (2026-11-11, Ben): the sign-in asks for the e-mail address
-- alone, then shows "password" for an existing account or "create account"
-- for a new one, like the big apps do.
--
-- This tells whether an address has an account ('confirmed'), one still
-- waiting for its confirmation mail ('unconfirmed') or none ('none'). It
-- works before signing in. That an address has an account is all it gives
-- away, and only slowly: it shares the rate limit of the other open
-- functions (0042/0044), 20 questions per caller in ten minutes.

create or replace function public.email_account_status(p_email text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_confirmed timestamptz;
  v_found boolean := false;
begin
  perform app.rate_check('email_account_status', 20, 600);
  if p_email is null or length(btrim(p_email)) > 320 then return 'none'; end if;
  select true, u.email_confirmed_at into v_found, v_confirmed
  from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.deleted_at is null
  limit 1;
  if not coalesce(v_found, false) then return 'none'; end if;
  return case when v_confirmed is null then 'unconfirmed' else 'confirmed' end;
end $$;

revoke all on function public.email_account_status(text) from public;
grant execute on function public.email_account_status(text) to anon, authenticated;
