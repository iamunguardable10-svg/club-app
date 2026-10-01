-- Polls in team messages (piece B, 2026-10-01).
--
-- A team message can carry a poll: the message text is the question, 2 to 6
-- answers, optionally several at once. The players it is for vote (and change
-- their vote) until the staff close it. Players see how many chose each answer
-- (team_messages.poll_counts, kept by the server) and only their own vote; the
-- staff who may write to the team see who voted what. The one-time reminder of
-- a poll goes to those who have not voted yet (instead of those who have not
-- read it). Answers and "several at once" are fixed once written.

alter table public.team_messages
  add column poll_options text[],
  add column poll_multiple boolean not null default false,
  add column poll_closed_at timestamptz,
  -- How many chose each answer; written only by the server.
  add column poll_counts integer[];

create table public.message_votes (
  message_id uuid not null references public.team_messages (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  -- Indexes into poll_options, from 0; one unless the poll allows several.
  options smallint[] not null,
  voted_at timestamptz not null default now(),
  primary key (message_id, person_id)
);
create index message_votes_person on public.message_votes (person_id);

-- Groups must belong to the team; a reminder only once; a pin time for
-- important messages (a week unless given); the poll's answers make sense;
-- a poll is closed once and stays closed.
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
  if tg_op = 'INSERT' and new.important and new.pinned_until is null then
    new.pinned_until := new.created_at + interval '7 days';
  end if;
  if tg_op = 'INSERT' then
    if new.poll_options is not null and (
      cardinality(new.poll_options) not between 2 and 6
      or exists (select 1 from unnest(new.poll_options) o(text) where length(btrim(o.text)) not between 1 and 80)
      or (select count(distinct lower(btrim(o.text))) from unnest(new.poll_options) o(text)) <> cardinality(new.poll_options)
    ) then
      raise exception 'A poll needs 2 to 6 different answers of up to 80 characters.' using errcode = 'check_violation';
    end if;
    new.poll_multiple := new.poll_options is not null and new.poll_multiple;
    new.poll_closed_at := null;
    new.poll_counts := case when new.poll_options is null then null else array_fill(0, array[cardinality(new.poll_options)]) end;
  end if;
  if tg_op = 'UPDATE' and new.poll_closed_at is distinct from old.poll_closed_at
     and (old.poll_closed_at is not null or new.poll_options is null) then
    raise exception 'This poll is already closed.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Votes: only one's own, only for a poll one received, only while it is open.
create or replace function app.poll_open_for_me(p_message uuid, p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_me(p_person) and exists (
    select 1 from public.team_messages t
    where t.id = p_message and t.poll_options is not null and t.poll_closed_at is null
      and p_person in (select r.person_id from app.message_recipients(p_message) r)
  )
$$;

create or replace function app.check_message_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_multiple boolean;
begin
  select cardinality(t.poll_options), t.poll_multiple into v_count, v_multiple
  from public.team_messages t where t.id = new.message_id;
  if cardinality(new.options) < 1
     or (not v_multiple and cardinality(new.options) > 1)
     or exists (select 1 from unnest(new.options) o(i) where o.i < 0 or o.i >= v_count)
     or (select count(distinct o.i) from unnest(new.options) o(i)) <> cardinality(new.options) then
    raise exception 'Choose one of the answers.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger message_votes_check before insert or update on public.message_votes
  for each row execute function app.check_message_vote();

-- Keeps team_messages.poll_counts up to date.
create or replace function app.count_message_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_message uuid := coalesce(new.message_id, old.message_id);
begin
  update public.team_messages t
  set poll_counts = (
    select array_agg((
      select count(*)::integer from public.message_votes v where v.message_id = t.id and (i - 1)::smallint = any (v.options)
    ) order by i)
    from generate_subscripts(t.poll_options, 1) i
  )
  where t.id = v_message and t.poll_options is not null;
  return null;
end $$;
create trigger message_votes_count after insert or update or delete on public.message_votes
  for each row execute function app.count_message_votes();

alter table public.message_votes enable row level security;
revoke all on public.message_votes from anon, authenticated;
grant select, insert, delete on public.message_votes to authenticated;
grant update (options, voted_at) on public.message_votes to authenticated;
grant update (poll_closed_at) on public.team_messages to authenticated;

create policy message_votes_read on public.message_votes for select to authenticated
  using (app.is_me(person_id) or exists (select 1 from public.team_messages t where t.id = message_id and app.may_message(t.team_id)));
create policy message_votes_vote on public.message_votes for insert to authenticated
  with check (app.poll_open_for_me(message_id, person_id));
create policy message_votes_change on public.message_votes for update to authenticated
  using (app.poll_open_for_me(message_id, person_id)) with check (app.poll_open_for_me(message_id, person_id));
create policy message_votes_withdraw on public.message_votes for delete to authenticated
  using (app.poll_open_for_me(message_id, person_id));

-- New message: to every recipient with a device; a reminder: to those who
-- have not read it, or for a poll, not voted.
create or replace function app.push_team_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reminder boolean := tg_op = 'UPDATE';
begin
  if v_reminder and (new.reminded_at is null or old.reminded_at is not null) then
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct on (p.user_id) p.user_id,
         case when new.important then 'important' else 'message' end,
         (case when v_reminder then 'message-reminder:' else 'message:' end) || new.id || ':' || p.user_id,
         (case when v_reminder then 'Reminder: ' else '' end)
           || (case when new.important then 'Important · ' else '' end)
           || (case when new.poll_options is not null then 'Poll · ' else '' end)
           || t.name || coalesce(' · ' || a.first_name, ''),
         left(regexp_replace(new.body, '\s+', ' ', 'g'), 180),
         '/athlete/messages',
         app.push_quiet_shift(now()),
         'push.message',
         jsonb_build_object('team', t.name, 'author', a.first_name, 'important', new.important, 'reminder', v_reminder,
           'poll', new.poll_options is not null)
  from app.message_recipients(new.id) r
  join public.people p on p.id = r.person_id and p.user_id is not null
  join public.teams t on t.id = new.team_id
  left join public.people a on a.id = new.author_id
  where exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
    and (p.id is distinct from new.author_id)
    and (not v_reminder or (
      case when new.poll_options is not null
        then not exists (select 1 from public.message_votes mv where mv.message_id = new.id and mv.person_id = r.person_id)
        else not exists (select 1 from public.message_reads mr where mr.message_id = new.id and mr.person_id = r.person_id)
      end))
  on conflict (dedupe_key) do nothing;
  return null;
end $$;

-- Voted in the meantime: no poll reminder left to send.
create or replace function app.message_vote_closes_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.push_outbox o set sent_at = now()
  from public.people p
  where p.id = new.person_id and o.user_id = p.user_id and o.sent_at is null
    and o.dedupe_key = 'message-reminder:' || new.message_id || ':' || p.user_id;
  return null;
end $$;
create trigger message_votes_close_push after insert on public.message_votes
  for each row execute function app.message_vote_closes_push();

-- Reading a poll does not close its reminder (only voting does).
create or replace function app.message_read_closes_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.push_outbox o set sent_at = now()
  from public.people p, public.team_messages t
  where p.id = new.person_id and t.id = new.message_id and o.user_id = p.user_id and o.sent_at is null
    and (o.dedupe_key = 'message:' || new.message_id || ':' || p.user_id
      or (t.poll_options is null and o.dedupe_key = 'message-reminder:' || new.message_id || ':' || p.user_id));
  return null;
end $$;

revoke all on function app.check_message_vote(), app.count_message_votes(), app.message_vote_closes_push() from public, anon, authenticated;
revoke all on function app.poll_open_for_me(uuid, uuid) from public, anon;
grant execute on function app.poll_open_for_me(uuid, uuid) to authenticated;
