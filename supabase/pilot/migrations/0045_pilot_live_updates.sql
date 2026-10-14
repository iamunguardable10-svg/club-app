-- Live updates (2026-10-14).
--
-- Until now every open app reloaded all tables every half minute. Now each
-- change counts up a small version per club and table in
-- `public.data_changes`. The app listens to that table (Supabase Realtime)
-- and reloads only the tables whose version moved, within a second or two of
-- the change; a cheap read of the versions every half minute covers a lost
-- connection.
--
-- The versions say only that something in a table of one's own club changed,
-- never what: members read the rows of their clubs, nobody writes them
-- directly (the triggers below run as definer).

create table if not exists public.data_changes (
  club_id uuid not null,
  table_name text not null,
  version bigint not null default 1,
  changed_at timestamptz not null default now(),
  primary key (club_id, table_name)
);

alter table public.data_changes enable row level security;
revoke all on public.data_changes from anon, authenticated;
grant select on public.data_changes to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'data_changes' and policyname = 'data_changes_read') then
    create policy data_changes_read on public.data_changes
      for select to authenticated
      using (club_id in (select app.my_club_ids()));
  end if;
end $$;

-- The clubs a changed row belongs to. Rows that only point at a parent take
-- the parent's club; when the parent is already gone (deleted in the same
-- statement), the person or account is tried, and otherwise the parent's own
-- change is the one that counts (the app reloads a parent's children with it).
create or replace function app.change_clubs(p_table text, r jsonb) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when p_table = 'clubs' then (r->>'id')::uuid end,
    (r->>'club_id')::uuid,
    (select t.club_id from public.teams t where t.id = (r->>'team_id')::uuid),
    (select s.club_id from public.sessions s where s.id = (r->>'session_id')::uuid),
    (select m.club_id from public.messages m where m.id = (r->>'message_id')::uuid),
    (select ss.club_id from public.session_series ss where ss.id = (r->>'series_id')::uuid),
    (select cr.club_id from public.club_roles cr where cr.id = (r->>'club_role_id')::uuid),
    (select d.club_id from public.departments d where d.id = (r->>'department_id')::uuid),
    (select t.club_id from public.player_groups g join public.teams t on t.id = g.team_id where g.id = (r->>'group_id')::uuid),
    (select s.club_id from public.carpools c join public.sessions s on s.id = c.session_id where c.id = (r->>'carpool_id')::uuid),
    (select p.club_id from public.load_entries e join public.people p on p.id = e.person_id where e.id = (r->>'entry_id')::uuid),
    (select p.club_id from public.absences a join public.people p on p.id = a.person_id where a.id = (r->>'absence_id')::uuid),
    (select p.club_id from public.availability a join public.people p on p.id = a.person_id where a.id = (r->>'availability_id')::uuid),
    (select p.club_id from public.people p where p.id = (r->>'person_id')::uuid)
  ) as club_id
  where p_table <> 'private_events'
  union
  -- Rows of an account (not of a person): every club the account is in.
  select p.club_id from public.people p
  where p_table = 'private_events' and p.user_id = (r->>'user_id')::uuid
$$;

revoke all on function app.change_clubs(text, jsonb) from public, anon, authenticated;

-- One count per club and table and statement, however many rows it touched.
-- `changed_old` does not exist on an insert trigger (and `changed_new` not on
-- a delete one), so each kind has its own function.
create or replace function app.note_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.data_changes as d (club_id, table_name)
  select distinct c, tg_table_name
  from changed_new r cross join lateral app.change_clubs(tg_table_name, to_jsonb(r)) c
  where c is not null
  on conflict (club_id, table_name) do update set version = d.version + 1, changed_at = now();
  return null;
end $$;

create or replace function app.note_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.data_changes as d (club_id, table_name)
  select distinct c, tg_table_name
  from (select to_jsonb(n) as r from changed_new n union all select to_jsonb(o) from changed_old o) rows_changed
  cross join lateral app.change_clubs(tg_table_name, rows_changed.r) c
  where c is not null
  on conflict (club_id, table_name) do update set version = d.version + 1, changed_at = now();
  return null;
end $$;

create or replace function app.note_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.data_changes as d (club_id, table_name)
  select distinct c, tg_table_name
  from changed_old r cross join lateral app.change_clubs(tg_table_name, to_jsonb(r)) c
  where c is not null
  on conflict (club_id, table_name) do update set version = d.version + 1, changed_at = now();
  return null;
end $$;

revoke all on function app.note_insert() from public, anon, authenticated;
revoke all on function app.note_update() from public, anon, authenticated;
revoke all on function app.note_delete() from public, anon, authenticated;

-- The tables the app loads (src/shared/data/remote/tables.ts), without views.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clubs', 'departments', 'facilities', 'teams', 'team_join_codes', 'department_facilities',
    'consents', 'people', 'coach_roles', 'memberships', 'club_roles', 'club_role_invites',
    'staff_invites', 'player_groups', 'player_group_members', 'session_series', 'sessions',
    'session_series_week_states', 'availability', 'availability_reasons', 'load_entries',
    'load_entry_reviews', 'attendance_confirmations', 'absences', 'absence_reasons',
    'carpools', 'carpool_riders', 'carpool_requests', 'squad_entries', 'messages',
    'message_reads', 'message_votes', 'message_writers', 'load_summaries', 'athlete_plans',
    'acknowledged_sessions', 'private_events'
  ] loop
    execute format('create or replace trigger %I after insert on public.%I referencing new table as changed_new for each statement execute function app.note_insert()', t || '_note_insert', t);
    execute format('create or replace trigger %I after update on public.%I referencing old table as changed_old new table as changed_new for each statement execute function app.note_update()', t || '_note_update', t);
    execute format('create or replace trigger %I after delete on public.%I referencing old table as changed_old for each statement execute function app.note_delete()', t || '_note_delete', t);
  end loop;
end $$;

-- Realtime sends changes of this table (only) to members who may read them.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'data_changes') then
    alter publication supabase_realtime add table public.data_changes;
  end if;
end $$;
