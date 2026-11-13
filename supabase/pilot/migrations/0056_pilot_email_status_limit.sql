-- Beta with youth teams (2026-11-13): many players sign up the same evening,
-- on mobile data, where one public IP is often shared by many phones. 20
-- questions per caller in ten minutes (0055) could stop a whole team; 60
-- still keeps guessing slow. Same function, only the limit changes.

create or replace function public.email_account_status(p_email text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_confirmed timestamptz;
  v_found boolean := false;
begin
  perform app.rate_check('email_account_status', 60, 600);
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
