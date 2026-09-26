-- A player joined with the team code (2026-09-26): the coaches who can
-- remove players get a push ("U16 · New player: Mia Muster joined"), so a
-- forwarded code does not go unnoticed. Only for joining oneself (the code,
-- or "Also play in <team>"), not for players a coach adds; not to the one
-- who joined. Coaches can switch it off in Settings ("New players").

alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check
  check (kind in ('changed', 'cancelled', 'reminder', 'summary', 'rate', 'review', 'report', 'digest', 'squad', 'message', 'important', 'joined'));

alter table public.notification_settings drop constraint if exists notification_settings_muted_kinds_check;
alter table public.notification_settings add constraint notification_settings_muted_kinds_check
  check (muted_kinds <@ array['changed', 'cancelled', 'reminder', 'summary', 'review', 'message', 'joined']::text[]);

create or replace function app.push_player_joined() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_joiner uuid;
begin
  select p.user_id into v_joiner from public.people p where p.id = new.person_id;
  -- Only when the player added themselves (join code); coaches adding
  -- someone know already.
  if new.role <> 'athlete' or v_joiner is null or v_joiner is distinct from auth.uid() then
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after)
  select distinct on (c.user_id) c.user_id, 'joined',
         'joined:' || new.team_id || ':' || new.person_id || ':' || c.user_id,
         t.name || ' · New player',
         j.first_name || ' ' || j.last_name || ' joined with the team code. Not someone you know? Remove them under Team → Players.',
         '/coach/team',
         app.push_quiet_shift(now())
  from public.memberships m
  join public.coach_roles r on r.id = m.coach_role_id and (r.locked or 'manageStaff' = any (r.permissions))
  join public.people c on c.id = m.person_id and c.user_id is not null
  join public.teams t on t.id = new.team_id
  join public.people j on j.id = new.person_id
  where m.team_id = new.team_id and m.role = 'coach'
    and c.user_id <> v_joiner
    and exists (select 1 from public.push_subscriptions s where s.user_id = c.user_id)
  on conflict (dedupe_key) do nothing;
  return null;
end $$;
create trigger memberships_push_joined after insert on public.memberships
  for each row execute function app.push_player_joined();

revoke all on function app.push_player_joined() from public, anon, authenticated;
