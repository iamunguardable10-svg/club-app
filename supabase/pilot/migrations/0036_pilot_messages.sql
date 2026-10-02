-- One kind of message, to any mix of recipients (2026-10-02).
--
-- Team messages (0022), polls (0034) and club/department news (0035) become
-- one `messages` table. A message goes to any mix of teams, groups,
-- departments and the whole club, and to everyone there, only the staff or
-- only the players (`audience`). Recipients are a set of people: someone in
-- two of the teams gets the message once, one push, one read mark, one vote.
-- No replies (stage 1 of the plan).
--
-- Who may send to what:
-- - a team or its groups: roles that see attendance or plan sessions (as
--   before, app.may_message);
-- - a department: its lead and club admins, and people the lead allows
--   (message_writers, one row per person and department);
-- - the whole club: club admins, and people an admin allows (message_writers
--   with no department).
-- A message is managed (read list, reminder, closing a poll, deleting) by its
-- author and by whoever runs all of its recipients (the team's staff with
-- those rights, the department's lead, the club admins).
--
-- The old tables stay until the app that uses them is gone (0037 removes
-- them); nobody has written to them on the club server yet.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid references public.people (id) on delete set null,
  team_ids uuid[] not null default '{}',
  group_ids uuid[] not null default '{}',
  department_ids uuid[] not null default '{}',
  whole_club boolean not null default false,
  audience text not null default 'all' check (audience in ('all', 'players', 'staff')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  important boolean not null default false,
  pinned_until timestamptz,
  created_at timestamptz not null default now(),
  -- Set once: those who have not read it (a poll: not voted) were reminded.
  reminded_at timestamptz,
  poll_options text[],
  poll_multiple boolean not null default false,
  poll_closed_at timestamptz,
  -- How many chose each answer; written only by the server.
  poll_counts integer[],
  check (whole_club or cardinality(team_ids) + cardinality(group_ids) + cardinality(department_ids) > 0),
  check (
    case when important
      then pinned_until is not null and pinned_until > created_at and pinned_until <= created_at + interval '31 days'
      else pinned_until is null
    end
  )
);
create index messages_club on public.messages (club_id, created_at desc);
create index messages_author on public.messages (author_id);
create index messages_teams on public.messages using gin (team_ids);
create index messages_groups on public.messages using gin (group_ids);
create index messages_departments on public.messages using gin (department_ids);

-- Who may write to a department or the whole club besides its lead and the
-- admins. Set by the lead (department) or an admin (club).
create table public.message_writers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  -- Null: the whole club.
  department_id uuid references public.departments (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index message_writers_unique on public.message_writers (person_id, coalesce(department_id, club_id));
create index message_writers_club on public.message_writers (club_id);

-- Reads and votes now belong to messages.
alter table public.message_reads drop constraint message_reads_message_id_fkey;
alter table public.message_reads add constraint message_reads_message_id_fkey
  foreign key (message_id) references public.messages (id) on delete cascade;
alter table public.message_votes drop constraint message_votes_message_id_fkey;
alter table public.message_votes add constraint message_votes_message_id_fkey
  foreign key (message_id) references public.messages (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Who may send, who receives, who manages
-- ---------------------------------------------------------------------------

create or replace function app.may_message_department(p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.manages_department(p_department) or exists (
    select 1 from public.message_writers w join public.people p on p.id = w.person_id
    where w.department_id = p_department and p.user_id = auth.uid()
  )
$$;

create or replace function app.may_message_club(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_club_admin(p_club) or exists (
    select 1 from public.message_writers w join public.people p on p.id = w.person_id
    where w.club_id = p_club and w.department_id is null and p.user_id = auth.uid()
  )
$$;

-- Whether the signed-in user may send to all of these recipients.
create or replace function app.may_send_message(p_club uuid, p_teams uuid[], p_groups uuid[], p_departments uuid[], p_whole_club boolean)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (not p_whole_club or app.may_message_club(p_club))
    and not exists (
      select 1 from unnest(p_teams) x(id)
      where not exists (select 1 from public.teams t where t.id = x.id and t.club_id = p_club) or not app.may_message(x.id)
    )
    and not exists (
      select 1 from unnest(p_groups) x(id)
      where not exists (
        select 1 from public.player_groups g join public.teams t on t.id = g.team_id
        where g.id = x.id and t.club_id = p_club and app.may_message(g.team_id)
      )
    )
    and not exists (
      select 1 from unnest(p_departments) x(id)
      where not exists (select 1 from public.departments d where d.id = x.id and d.club_id = p_club) or not app.may_message_department(x.id)
    )
$$;

-- Everyone a message is for, each once; never its author.
create or replace function app.message_recipients(p_message uuid)
returns table (person_id uuid)
language sql stable security definer set search_path = '' as $$
  with m as (select * from public.messages where id = p_message),
  scoped_teams as (
    select t.id from public.teams t, m
    where t.club_id = m.club_id and t.archived_at is null
      and (m.whole_club or t.id = any (m.team_ids) or t.department_id = any (m.department_ids))
  ),
  group_teams as (
    select g.id as group_id, g.team_id from public.player_groups g, m
    where g.id = any (m.group_ids)
  ),
  everyone as (
    -- Players of whole teams
    select ms.person_id from public.memberships ms, m
    where m.audience <> 'staff' and ms.role = 'athlete' and ms.team_id in (select id from scoped_teams)
    union
    -- Players of the chosen groups
    select gm.person_id from public.player_group_members gm
    join group_teams gt on gt.group_id = gm.group_id
    join public.memberships ms on ms.person_id = gm.person_id and ms.team_id = gt.team_id and ms.role = 'athlete'
    cross join m
    where m.audience <> 'staff'
    union
    -- Staff of those teams (and of the groups' teams)
    select ms.person_id from public.memberships ms, m
    where m.audience <> 'players' and ms.role = 'coach'
      and (ms.team_id in (select id from scoped_teams) or ms.team_id in (select team_id from group_teams))
    union
    -- Club roles over them: all of them for the whole club, the lead for a department
    select cr.person_id from public.club_roles cr, m
    where m.audience <> 'players' and cr.club_id = m.club_id
      and (m.whole_club or cr.department_id = any (m.department_ids))
  )
  select e.person_id from everyone e, m where e.person_id is distinct from m.author_id
$$;

-- The author, or whoever runs all of its recipients.
create or replace function app.manages_message(p_message uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.messages m
    where m.id = p_message and (
      (m.author_id is not null and app.is_me(m.author_id))
      or (
        (not m.whole_club or app.is_club_admin(m.club_id))
        and not exists (select 1 from unnest(m.team_ids) x(id) where not app.may_message(x.id))
        and not exists (select 1 from unnest(m.group_ids) x(id) join public.player_groups g on g.id = x.id where not app.may_message(g.team_id))
        and not exists (select 1 from unnest(m.department_ids) x(id) where not app.manages_department(x.id))
      )
    )
  )
$$;

create or replace function app.may_read_message(p_message uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.manages_message(p_message)
    or exists (select 1 from app.message_recipients(p_message) r join public.people p on p.id = r.person_id where p.user_id = auth.uid())
$$;

create or replace function app.poll_open_for_me(p_message uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_me(p_person) and exists (
    select 1 from public.messages m
    where m.id = p_message and m.poll_options is not null and m.poll_closed_at is null
      and p_person in (select r.person_id from app.message_recipients(p_message) r)
  )
$$;

-- ---------------------------------------------------------------------------
-- Integrity
-- ---------------------------------------------------------------------------

create or replace function app.check_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.team_ids := array(select distinct x from unnest(new.team_ids) x);
    new.group_ids := array(select distinct x from unnest(new.group_ids) x);
    new.department_ids := array(select distinct x from unnest(new.department_ids) x);
    if exists (select 1 from unnest(new.team_ids) x(id) where not exists (select 1 from public.teams t where t.id = x.id and t.club_id = new.club_id))
       or exists (select 1 from unnest(new.group_ids) x(id) where not exists (
         select 1 from public.player_groups g join public.teams t on t.id = g.team_id where g.id = x.id and t.club_id = new.club_id))
       or exists (select 1 from unnest(new.department_ids) x(id) where not exists (select 1 from public.departments d where d.id = x.id and d.club_id = new.club_id)) then
      raise exception 'The recipients must belong to the club.' using errcode = 'check_violation';
    end if;
    if new.important and new.pinned_until is null then
      new.pinned_until := new.created_at + interval '7 days';
    end if;
    if new.poll_options is not null and (
      cardinality(new.poll_options) not between 2 and 6
      or exists (select 1 from unnest(new.poll_options) o(text) where length(btrim(o.text)) not between 1 and 80)
      or (select count(distinct lower(btrim(o.text))) from unnest(new.poll_options) o(text)) <> cardinality(new.poll_options)
    ) then
      raise exception 'A poll needs 2 to 6 different answers of up to 80 characters.' using errcode = 'check_violation';
    end if;
    new.poll_multiple := new.poll_options is not null and new.poll_multiple;
    new.poll_closed_at := null;
    new.reminded_at := null;
    new.poll_counts := case when new.poll_options is null then null else array_fill(0, array[cardinality(new.poll_options)]) end;
    return new;
  end if;
  if old.reminded_at is not null and new.reminded_at is distinct from old.reminded_at then
    raise exception 'Players were already reminded of this message.' using errcode = 'check_violation';
  end if;
  if new.poll_closed_at is distinct from old.poll_closed_at and (old.poll_closed_at is not null or new.poll_options is null) then
    raise exception 'This poll is already closed.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger messages_check before insert or update on public.messages
  for each row execute function app.check_message();

create or replace function app.check_message_writer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.people p where p.id = new.person_id and p.club_id = new.club_id) then
    raise exception 'This person belongs to another club.' using errcode = 'check_violation';
  end if;
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.club_id = new.club_id
  ) then
    raise exception 'This department belongs to another club.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger message_writers_check before insert or update on public.message_writers
  for each row execute function app.check_message_writer();

-- Votes: the server keeps the counts on the message.
create or replace function app.count_message_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_message uuid := coalesce(new.message_id, old.message_id);
begin
  update public.messages m
  set poll_counts = (
    select array_agg((
      select count(*)::integer from public.message_votes v where v.message_id = m.id and (i - 1)::smallint = any (v.options)
    ) order by i)
    from generate_subscripts(m.poll_options, 1) i
  )
  where m.id = v_message and m.poll_options is not null;
  return null;
end $$;

create or replace function app.check_message_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_multiple boolean;
begin
  select cardinality(m.poll_options), m.poll_multiple into v_count, v_multiple
  from public.messages m where m.id = new.message_id;
  if cardinality(new.options) < 1
     or (not v_multiple and cardinality(new.options) > 1)
     or exists (select 1 from unnest(new.options) o(i) where o.i < 0 or o.i >= v_count)
     or (select count(distinct o.i) from unnest(new.options) o(i)) <> cardinality(new.options) then
    raise exception 'Choose one of the answers.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------

alter table public.messages enable row level security;
alter table public.message_writers enable row level security;
revoke all on public.messages, public.message_writers from anon, authenticated;
grant select, insert, delete on public.messages to authenticated;
grant update (reminded_at, poll_closed_at) on public.messages to authenticated;
grant select, insert, delete on public.message_writers to authenticated;

create policy messages_read on public.messages for select to authenticated
  using (app.may_read_message(id));
create policy messages_send on public.messages for insert to authenticated
  with check (author_id is not null and app.is_me(author_id)
    and app.may_send_message(club_id, team_ids, group_ids, department_ids, whole_club));
create policy messages_manage on public.messages for update to authenticated
  using (app.manages_message(id)) with check (app.manages_message(id));
create policy messages_delete on public.messages for delete to authenticated
  using (app.manages_message(id));

drop policy message_reads_read on public.message_reads;
drop policy message_reads_mark on public.message_reads;
create policy message_reads_read on public.message_reads for select to authenticated
  using (app.is_me(person_id) or app.manages_message(message_id));
create policy message_reads_mark on public.message_reads for insert to authenticated
  with check (app.is_me(person_id) and person_id in (select r.person_id from app.message_recipients(message_id) r));

drop policy message_votes_read on public.message_votes;
create policy message_votes_read on public.message_votes for select to authenticated
  using (app.is_me(person_id) or app.manages_message(message_id));

-- Writers: everyone with a club role sees them (the club area), people see
-- their own; the lead or an admin sets them for a department, an admin for
-- the whole club.
create policy message_writers_read on public.message_writers for select to authenticated
  using (app.is_me(person_id) or app.is_club_staff(club_id));
create policy message_writers_grant on public.message_writers for insert to authenticated
  with check (case when department_id is null then app.is_club_admin(club_id) else app.manages_department(department_id) end);
create policy message_writers_revoke on public.message_writers for delete to authenticated
  using (case when department_id is null then app.is_club_admin(club_id) else app.manages_department(department_id) end);

-- ---------------------------------------------------------------------------
-- Pushes
-- ---------------------------------------------------------------------------

-- "U16 Boys · U19", "U20 (Backs)", "Basketball", "SV Ruhrtal": where a message went.
create or replace function app.message_label(p_message uuid) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(name, ' · ' order by ord, name) from (
    select c.name, 0 as ord from public.messages m join public.clubs c on c.id = m.club_id where m.id = p_message and m.whole_club
    union all
    select d.name, 1 from public.messages m join public.departments d on d.id = any (m.department_ids) where m.id = p_message
    union all
    select t.name, 2 from public.messages m join public.teams t on t.id = any (m.team_ids) where m.id = p_message
    union all
    select t.name || ' (' || g.name || ')', 3 from public.messages m
    join public.player_groups g on g.id = any (m.group_ids) join public.teams t on t.id = g.team_id where m.id = p_message
  ) names
$$;

-- New message: to every recipient with a device; a reminder: to those who
-- have not read it, or for a poll, not voted.
create or replace function app.push_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reminder boolean := tg_op = 'UPDATE';
  v_label text;
begin
  if v_reminder and (new.reminded_at is null or old.reminded_at is not null) then
    return null;
  end if;
  v_label := coalesce(app.message_label(new.id), '');
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct on (p.user_id) p.user_id,
         case when new.important then 'important' else 'message' end,
         (case when v_reminder then 'message-reminder:' else 'message:' end) || new.id || ':' || p.user_id,
         (case when v_reminder then 'Reminder: ' else '' end)
           || (case when new.important then 'Important · ' else '' end)
           || (case when new.poll_options is not null then 'Poll · ' else '' end)
           || v_label || coalesce(' · ' || a.first_name, ''),
         left(regexp_replace(new.body, '\s+', ' ', 'g'), 180),
         case when exists (select 1 from public.memberships ms where ms.person_id = p.id and ms.role = 'athlete')
           then '/athlete/messages' else '/news' end,
         app.push_quiet_shift(now()),
         'push.message',
         jsonb_build_object('team', v_label, 'author', a.first_name, 'important', new.important, 'reminder', v_reminder,
           'poll', new.poll_options is not null)
  from app.message_recipients(new.id) r
  join public.people p on p.id = r.person_id and p.user_id is not null
  left join public.people a on a.id = new.author_id
  where exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
    and p.user_id is distinct from a.user_id
    and (not v_reminder or (
      case when new.poll_options is not null
        then not exists (select 1 from public.message_votes mv where mv.message_id = new.id and mv.person_id = r.person_id)
        else not exists (select 1 from public.message_reads mr where mr.message_id = new.id and mr.person_id = r.person_id)
      end))
  on conflict (dedupe_key) do nothing;
  return null;
end $$;
create trigger messages_push after insert or update of reminded_at on public.messages
  for each row execute function app.push_message();

-- Read in the meantime: the first push is no longer needed; a reminder only
-- when it was not a poll (a poll's reminder waits for the vote).
create or replace function app.message_read_closes_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.push_outbox o set sent_at = now()
  from public.people p, public.messages m
  where p.id = new.person_id and m.id = new.message_id and o.user_id = p.user_id and o.sent_at is null
    and (o.dedupe_key = 'message:' || new.message_id || ':' || p.user_id
      or (m.poll_options is null and o.dedupe_key = 'message-reminder:' || new.message_id || ':' || p.user_id));
  return null;
end $$;

revoke all on function app.check_message(), app.check_message_writer(), app.push_message() from public, anon, authenticated;
revoke all on function app.may_message_department(uuid), app.may_message_club(uuid),
  app.may_send_message(uuid, uuid[], uuid[], uuid[], boolean), app.manages_message(uuid), app.message_label(uuid) from public, anon;
grant execute on function app.may_message_department(uuid), app.may_message_club(uuid),
  app.may_send_message(uuid, uuid[], uuid[], uuid[], boolean), app.manages_message(uuid), app.message_label(uuid) to authenticated;
