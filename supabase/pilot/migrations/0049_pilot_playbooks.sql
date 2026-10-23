-- Playbooks (2026-10-23, docs/goal-2026-10-pilot-ready.md, piece 4).
--
-- Coaches upload plays, tactics or routines as a PDF or picture and release
-- them to the players when the team is ready for them: to the whole team or
-- to player groups, at once or from a date. A draft is for the staff only.
-- The file lives in the private storage bucket `playbooks` under
-- `<club>/<team>/<playbook>/<name>`; the app opens it with a short-lived
-- signed link, which needs the same right as reading the row.
--
-- `playbook` is a paid team feature (0046), unlocked for every club in the
-- pilot and switched on for the teams; who may manage sessions
-- (`editSessions`) manages the team's playbooks, every coach of the team
-- sees the drafts.

-- ---------------------------------------------------------------------------
-- The feature
-- ---------------------------------------------------------------------------

create or replace function app.team_feature_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['load', 'carpools', 'polls', 'squads', 'attendance', 'playbook']
$$;

create or replace function app.paid_feature_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['load', 'playbook']
$$;

alter table public.teams drop constraint if exists teams_features_check;
alter table public.teams add constraint teams_features_check
  check (features <@ array['load', 'carpools', 'polls', 'squads', 'attendance', 'playbook']);
alter table public.teams drop constraint if exists teams_feature_choices_check;
alter table public.teams add constraint teams_feature_choices_check
  check (feature_choices <@ array['load', 'carpools', 'polls', 'squads', 'attendance', 'playbook']);
alter table public.club_entitlements drop constraint if exists club_entitlements_feature_check;
alter table public.club_entitlements add constraint club_entitlements_feature_check check (feature in ('load', 'playbook'));
alter table public.club_feature_settings drop constraint if exists club_feature_settings_feature_check;
alter table public.club_feature_settings add constraint club_feature_settings_feature_check
  check (feature in ('load', 'carpools', 'polls', 'squads', 'attendance', 'playbook'));

-- New teams start with every basic feature and the playbook.
create or replace function app.default_feature_choices(p_features text[]) returns text[]
language sql immutable set search_path = '' as $$
  select array(select distinct f from unnest(coalesce(p_features, '{}') || array['carpools', 'polls', 'squads', 'attendance', 'playbook']) f order by f)
$$;

-- Existing teams: switched on (choices first, then the entitlement computes).
update public.teams set feature_choices = array(select distinct f from unnest(feature_choices || array['playbook']) f order by f)
where not ('playbook' = any (coalesce(feature_choices, '{}')));

insert into public.club_entitlements (club_id, feature, source, valid_until)
select c.id, 'playbook', 'pilot', date '2027-06-30' from public.clubs c
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Playbooks
-- ---------------------------------------------------------------------------

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (char_length(description) <= 500),
  category text not null default 'other' check (category in ('offense', 'defense', 'set_pieces', 'other')),
  file_path text not null check (char_length(file_path) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 120),
  file_type text not null check (file_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  file_size integer not null check (file_size between 1 and 20971520),
  status text not null default 'draft' check (status in ('draft', 'released')),
  -- Empty: the whole team.
  group_ids uuid[] not null default '{}',
  -- Released, but players see it only from then on (null: at once).
  release_at timestamptz,
  released_at timestamptz,
  position integer not null default 0,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists playbooks_team on public.playbooks (team_id, position);

-- The club follows the team, the file sits in the team's folder, groups are
-- the team's, and the release time is kept.
create or replace function app.check_playbook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select t.club_id into new.club_id from public.teams t where t.id = new.team_id;
  if new.club_id is null then raise exception 'Unknown team.' using errcode = 'foreign_key_violation'; end if;
  if new.file_path not like new.club_id || '/' || new.team_id || '/%' then
    raise exception 'The playbook file belongs in the team''s folder.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(new.group_ids) g where not exists (
    select 1 from public.player_groups pg where pg.id = g and pg.team_id = new.team_id
  )) then
    raise exception 'A playbook can only be shared with the team''s own groups.' using errcode = 'check_violation';
  end if;
  new.title := btrim(new.title);
  if new.status = 'released' and (tg_op = 'INSERT' or old.status <> 'released') then
    new.released_at := now();
  elsif new.status = 'draft' then
    new.released_at := null;
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace trigger playbooks_check before insert or update on public.playbooks
  for each row execute function app.check_playbook();

-- Players: released, its time has come, in the team and (if limited) in one of the groups.
create or replace function app.may_read_playbook(p_playbook uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.playbooks b
    where b.id = p_playbook
      and app.team_has_feature(b.team_id, 'playbook')
      and (
        app.is_team_coach(b.team_id)
        or (
          b.status = 'released' and (b.release_at is null or b.release_at <= now())
          and exists (
            select 1 from public.memberships m join public.people p on p.id = m.person_id
            where m.team_id = b.team_id and m.role = 'athlete' and p.user_id = auth.uid()
              and (cardinality(b.group_ids) = 0 or exists (
                select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (b.group_ids)
              ))
          )
        )
      )
  )
$$;

alter table public.playbooks enable row level security;
revoke all on public.playbooks from anon, authenticated;
grant select, insert, delete on public.playbooks to authenticated;
grant update (title, description, category, status, group_ids, release_at, position, file_path, file_name, file_type, file_size) on public.playbooks to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'playbooks' and policyname = 'playbooks_read') then
    create policy playbooks_read on public.playbooks for select to authenticated
      using (app.may_read_playbook(id));
    create policy playbooks_add on public.playbooks for insert to authenticated
      with check (app.has_perm(team_id, 'editSessions') and app.team_has_feature(team_id, 'playbook'));
    create policy playbooks_change on public.playbooks for update to authenticated
      using (app.has_perm(team_id, 'editSessions'))
      with check (app.has_perm(team_id, 'editSessions') and app.team_has_feature(team_id, 'playbook'));
    create policy playbooks_remove on public.playbooks for delete to authenticated
      using (app.has_perm(team_id, 'editSessions'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The files
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playbooks', 'playbooks', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- `<club>/<team>/...` of a team whose playbooks this person manages.
create or replace function app.may_manage_playbook_file(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_team uuid;
begin
  if array_length(v_parts, 1) < 4
    or v_parts[1] !~ '^[0-9a-f-]{36}$' or v_parts[2] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  v_team := v_parts[2]::uuid;
  return exists (select 1 from public.teams t where t.id = v_team and t.club_id = v_parts[1]::uuid)
    and app.has_perm(v_team, 'editSessions') and app.team_has_feature(v_team, 'playbook');
end $$;

create or replace function app.may_read_playbook_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.playbooks b where b.file_path = p_name and app.may_read_playbook(b.id))
$$;

grant execute on function app.may_read_playbook(uuid), app.may_manage_playbook_file(text), app.may_read_playbook_file(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'playbooks_files_read') then
    create policy playbooks_files_read on storage.objects for select to authenticated
      using (bucket_id = 'playbooks' and (app.may_read_playbook_file(name) or app.may_manage_playbook_file(name)));
    create policy playbooks_files_add on storage.objects for insert to authenticated
      with check (bucket_id = 'playbooks' and app.may_manage_playbook_file(name));
    create policy playbooks_files_remove on storage.objects for delete to authenticated
      using (bucket_id = 'playbooks' and app.may_manage_playbook_file(name));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Push on release
-- ---------------------------------------------------------------------------

alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check check (kind in ('changed','cancelled','reminder','summary','rate','review','report','digest','squad','message','important','joined','carpool','consent','playbook'));

-- Once per playbook and player; with a later date, at that date.
create or replace function app.push_playbook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_team text;
begin
  if new.status <> 'released' or (tg_op = 'UPDATE' and old.status = 'released' and old.group_ids = new.group_ids) then
    return null;
  end if;
  if not app.team_has_feature(new.team_id, 'playbook') then return null; end if;
  select t.name into v_team from public.teams t where t.id = new.team_id;
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'playbook', 'playbook:' || new.id || ':' || r.user_id,
    coalesce(v_team, 'Team') || ' · New playbook',
    new.title,
    '/athlete/playbook',
    greatest(app.push_quiet_shift(now()), coalesce(new.release_at, now())),
    'push.playbook',
    jsonb_build_object('team', coalesce(v_team, ''), 'title', new.title)
  from app.push_players(new.team_id, new.group_ids) r
  on conflict (dedupe_key) do nothing;
  return null;
end $$;

create or replace trigger playbooks_push after insert or update of status, group_ids on public.playbooks
  for each row execute function app.push_playbook();

revoke all on function app.check_playbook(), app.push_playbook() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live updates (0045)
-- ---------------------------------------------------------------------------

do $$
begin
  execute 'create or replace trigger playbooks_note_insert after insert on public.playbooks referencing new table as changed_new for each statement execute function app.note_insert()';
  execute 'create or replace trigger playbooks_note_update after update on public.playbooks referencing old table as changed_old new table as changed_new for each statement execute function app.note_update()';
  execute 'create or replace trigger playbooks_note_delete after delete on public.playbooks referencing old table as changed_old for each statement execute function app.note_delete()';
end $$;
