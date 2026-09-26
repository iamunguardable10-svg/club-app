-- Deleting one's own account (2026-09-26): Settings → Account → "Delete
-- account". Everything about the person goes: their person in the club with
-- memberships, answers, load, absences, plans and messages read (all cascade
-- from people), and everything of the account (settings, devices, calendar
-- link, Apple connection and its password in the Vault, sign-in). Messages a
-- coach wrote stay for the team without an author; error reports stay
-- without the account.
--
-- One guard: the only club admin of a club that has other people must make
-- someone else admin first, or nobody could run the club any more.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_secret uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.club_roles r
    join public.people p on p.id = r.person_id and p.user_id = v_user
    where r.role = 'admin'
      and not exists (select 1 from public.club_roles o where o.club_id = r.club_id and o.role = 'admin' and o.person_id <> r.person_id)
      and exists (select 1 from public.people x where x.club_id = r.club_id and x.id <> r.person_id)
  ) then
    raise exception 'You are the only admin of your club. Add another admin first (Club → Club admins → Add admin), then delete your account.'
      using errcode = 'check_violation';
  end if;

  select secret_id into v_secret from app.calendar_connections where user_id = v_user;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  delete from public.people where user_id = v_user;
  delete from auth.users where id = v_user;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
