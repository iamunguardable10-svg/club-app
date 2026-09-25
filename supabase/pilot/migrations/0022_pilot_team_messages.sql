-- Piece 17: team messages (decided 2026-09-25).
--
-- Announcements from the staff to a team or some of its groups; no replies
-- (not a chat). "Important" ones are pinned and their push cannot be
-- switched off. A message counts as read as soon as the player has seen it
-- (opened the messages page), not by tapping a button; the staff see
-- "read 14/18" and who has not read it, and can remind those once.
-- Who writes: roles that see attendance or plan sessions (so the team
-- manager too).

create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  -- Empty: the whole team.
  group_ids uuid[] not null default '{}',
  author_id uuid references public.people (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  important boolean not null default false,
  created_at timestamptz not null default now(),
  -- Set once by the staff: unread players get a reminder.
  reminded_at timestamptz
);
create index team_messages_team on public.team_messages (team_id, created_at desc);
create index team_messages_author on public.team_messages (author_id);

create table public.message_reads (
  message_id uuid not null references public.team_messages (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, person_id)
);
create index message_reads_person on public.message_reads (person_id);

-- Staff who may write to (and see the reading of) a team's messages.
create or replace function app.may_message(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_perm(p_team, 'viewAttendance') or app.has_perm(p_team, 'editSessions')
$$;

-- Players a message is for: the team's players, or those in its groups.
create or replace function app.message_recipients(p_message uuid)
returns table (person_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.person_id
  from public.team_messages t
  join public.memberships m on m.team_id = t.team_id and m.role = 'athlete'
  where t.id = p_message
    and (cardinality(t.group_ids) = 0 or exists (
      select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (t.group_ids)
    ))
$$;

create or replace function app.may_read_message(p_message uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_messages t
    where t.id = p_message and (
      app.is_team_coach(t.team_id)
      or exists (select 1 from app.message_recipients(p_message) r join public.people p on p.id = r.person_id where p.user_id = auth.uid())
    )
  )
$$;

alter table public.team_messages enable row level security;
alter table public.message_reads enable row level security;
revoke all on public.team_messages, public.message_reads from anon, authenticated;
grant select, insert, delete on public.team_messages to authenticated;
grant update (reminded_at) on public.team_messages to authenticated;
grant select, insert on public.message_reads to authenticated;

create policy team_messages_read on public.team_messages for select to authenticated
  using (app.may_read_message(id));
create policy team_messages_post on public.team_messages for insert to authenticated
  with check (app.may_message(team_id) and author_id is not null and app.is_me(author_id));
create policy team_messages_remind on public.team_messages for update to authenticated
  using (app.may_message(team_id)) with check (app.may_message(team_id));
create policy team_messages_delete on public.team_messages for delete to authenticated
  using (app.may_message(team_id));

create policy message_reads_read on public.message_reads for select to authenticated
  using (app.is_me(person_id) or exists (select 1 from public.team_messages t where t.id = message_id and app.may_message(t.team_id)));
create policy message_reads_mark on public.message_reads for insert to authenticated
  with check (app.is_me(person_id) and person_id in (select r.person_id from app.message_recipients(message_id) r));

-- Groups must belong to the team; a reminder only once.
create or replace function app.check_team_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.group_ids) g(id)
    where not exists (select 1 from public.player_groups pg where pg.id = g.id and pg.team_id = new.team_id)
  ) then
    raise exception 'The groups must belong to the team.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.reminded_at is not null and new.reminded_at is distinct from old.reminded_at then
    raise exception 'Players were already reminded of this message.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger team_messages_check before insert or update on public.team_messages
  for each row execute function app.check_team_message();

-- ---------------------------------------------------------------------------
-- Pushes
-- ---------------------------------------------------------------------------

alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check
  check (kind in ('changed', 'cancelled', 'reminder', 'summary', 'rate', 'review', 'report', 'digest', 'squad', 'message', 'important'));

-- Team messages can be switched off, important ones not ('important' is not allowed here).
alter table public.notification_settings drop constraint if exists notification_settings_muted_kinds_check;
alter table public.notification_settings add constraint notification_settings_muted_kinds_check
  check (muted_kinds <@ array['changed', 'cancelled', 'reminder', 'summary', 'review', 'message']::text[]);

-- New message: to every recipient with a device; a reminder: to those who have not read it.
create or replace function app.push_team_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reminder boolean := tg_op = 'UPDATE';
begin
  if v_reminder and (new.reminded_at is null or old.reminded_at is not null) then
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after)
  select distinct on (p.user_id) p.user_id,
         case when new.important then 'important' else 'message' end,
         (case when v_reminder then 'message-reminder:' else 'message:' end) || new.id || ':' || p.user_id,
         (case when v_reminder then 'Reminder: ' else '' end)
           || (case when new.important then 'Important · ' else '' end)
           || t.name || coalesce(' · ' || a.first_name, ''),
         left(regexp_replace(new.body, '\s+', ' ', 'g'), 180),
         '/athlete/messages',
         app.push_quiet_shift(now())
  from app.message_recipients(new.id) r
  join public.people p on p.id = r.person_id and p.user_id is not null
  join public.teams t on t.id = new.team_id
  left join public.people a on a.id = new.author_id
  where exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
    and (p.id is distinct from new.author_id)
    and (not v_reminder or not exists (select 1 from public.message_reads mr where mr.message_id = new.id and mr.person_id = r.person_id))
  on conflict (dedupe_key) do nothing;
  return null;
end $$;
create trigger team_messages_push after insert or update of reminded_at on public.team_messages
  for each row execute function app.push_team_message();

-- Read in the meantime: no reminder left to send.
create or replace function app.message_read_closes_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.push_outbox o set sent_at = now()
  from public.people p
  where p.id = new.person_id and o.user_id = p.user_id and o.sent_at is null
    and o.dedupe_key in ('message-reminder:' || new.message_id || ':' || p.user_id, 'message:' || new.message_id || ':' || p.user_id);
  return null;
end $$;
create trigger message_reads_close_push after insert on public.message_reads
  for each row execute function app.message_read_closes_push();

revoke all on function app.check_team_message(), app.push_team_message(), app.message_read_closes_push() from public, anon, authenticated;
revoke all on function app.may_message(uuid), app.message_recipients(uuid), app.may_read_message(uuid) from public, anon;
grant execute on function app.may_message(uuid), app.message_recipients(uuid), app.may_read_message(uuid) to authenticated;
