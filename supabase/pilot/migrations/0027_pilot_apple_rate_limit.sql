-- Piece 20 follow-up: limits on the Apple Calendar function (2026-09-26).
--
-- Connecting checks an Apple ID and password with iCloud. Without a limit,
-- any account could use Club OS to try many Apple IDs and passwords (and
-- iCloud might then block the function for everyone). Now each account gets
-- 5 connection attempts per hour and 60 syncs ("Sync now", choosing
-- calendars) per hour. The 15-minute sync is not counted.

create table app.apple_calendar_calls (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('connect', 'sync')),
  at timestamptz not null default now()
);
create index apple_calendar_calls_recent on app.apple_calendar_calls (user_id, kind, at);

-- Counts one call and says whether it may go ahead (for the Edge Function).
create or replace function public.apple_calendar_allow(p_user uuid, p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer := case p_kind when 'connect' then 5 when 'sync' then 60 end;
begin
  if v_limit is null then
    raise exception 'Unknown kind.';
  end if;
  delete from app.apple_calendar_calls where at < now() - interval '1 day';
  if (select count(*) from app.apple_calendar_calls
      where user_id = p_user and kind = p_kind and at > now() - interval '1 hour') >= v_limit then
    return false;
  end if;
  insert into app.apple_calendar_calls (user_id, kind) values (p_user, p_kind);
  return true;
end $$;

revoke all on function public.apple_calendar_allow(uuid, text) from public, anon, authenticated;
grant execute on function public.apple_calendar_allow(uuid, text) to service_role;
