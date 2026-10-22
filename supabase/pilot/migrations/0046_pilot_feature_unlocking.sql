-- Unlocking features in three levels (2026-10-22, docs/plan-features-freischaltung.md).
--
-- A feature works in a team only when all three say yes:
-- 1. unlocked for the club by us (`club_entitlements`). Basic features are
--    always unlocked; paid ones (today: load) need an entitlement;
-- 2. the club's setting (`club_feature_settings`): on for all teams, off for
--    all teams, or, without a row (the default), each team decides;
-- 3. the team's own choice (`teams.feature_choices`), set by whoever may
--    manage the team's staff (the head coach).
--
-- The server keeps the result in `teams.features`, which everything else
-- already reads (access rules, push, the app). It is recomputed whenever a
-- choice, a club setting or an entitlement changes, and nightly for
-- entitlements that ran out. Switched off means locked on the server too
-- (restrictive access rules below); the data stays and returns when switched
-- on again.

-- ---------------------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------------------

create or replace function app.team_feature_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['load', 'carpools', 'polls', 'squads', 'attendance']
$$;

-- Features that need an entitlement (paid packages; in the pilot unlocked).
create or replace function app.paid_feature_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['load']
$$;

alter table public.teams drop constraint if exists teams_features_check;
alter table public.teams add constraint teams_features_check
  check (features <@ array['load', 'carpools', 'polls', 'squads', 'attendance']);
alter table public.teams add column if not exists feature_choices text[]
  check (feature_choices <@ array['load', 'carpools', 'polls', 'squads', 'attendance']);

-- ---------------------------------------------------------------------------
-- Level 1: unlocked by us
-- ---------------------------------------------------------------------------

create table if not exists public.club_entitlements (
  club_id uuid not null references public.clubs (id) on delete cascade,
  feature text not null check (feature in ('load')),
  source text not null check (source in ('pilot', 'plan', 'manual')),
  -- Last day it is unlocked; null: without end.
  valid_until date,
  created_at timestamptz not null default now(),
  primary key (club_id, feature)
);

alter table public.club_entitlements enable row level security;
revoke all on public.club_entitlements from anon, authenticated;
grant select on public.club_entitlements to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'club_entitlements' and policyname = 'club_entitlements_read') then
    create policy club_entitlements_read on public.club_entitlements for select to authenticated
      using (club_id in (select app.my_club_ids()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Level 2: the club's setting
-- ---------------------------------------------------------------------------

create table if not exists public.club_feature_settings (
  club_id uuid not null references public.clubs (id) on delete cascade,
  feature text not null check (feature in ('load', 'carpools', 'polls', 'squads', 'attendance')),
  mode text not null check (mode in ('on', 'off')),
  updated_at timestamptz not null default now(),
  primary key (club_id, feature)
);

alter table public.club_feature_settings enable row level security;
revoke all on public.club_feature_settings from anon, authenticated;
grant select, insert, delete on public.club_feature_settings to authenticated;
grant update (mode, updated_at) on public.club_feature_settings to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'club_feature_settings' and policyname = 'club_feature_settings_read') then
    create policy club_feature_settings_read on public.club_feature_settings for select to authenticated
      using (club_id in (select app.my_club_ids()));
    create policy club_feature_settings_insert on public.club_feature_settings for insert to authenticated
      with check (app.is_club_admin(club_id));
    create policy club_feature_settings_update on public.club_feature_settings for update to authenticated
      using (app.is_club_admin(club_id)) with check (app.is_club_admin(club_id));
    create policy club_feature_settings_delete on public.club_feature_settings for delete to authenticated
      using (app.is_club_admin(club_id));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The result
-- ---------------------------------------------------------------------------

create or replace function app.feature_unlocked(p_club uuid, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not (p_feature = any (app.paid_feature_keys()))
    or exists (
      select 1 from public.club_entitlements e
      where e.club_id = p_club and e.feature = p_feature and (e.valid_until is null or e.valid_until >= current_date)
    )
$$;

-- The features that work in a team of this club with these choices.
create or replace function app.effective_team_features(p_club uuid, p_choices text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(f order by f), '{}')
  from unnest(app.team_feature_keys()) f
  left join public.club_feature_settings s on s.club_id = p_club and s.feature = f
  where app.feature_unlocked(p_club, f)
    and coalesce(s.mode, 'teams') <> 'off'
    and (s.mode = 'on' or f = any (coalesce(p_choices, '{}')))
$$;

-- A team's choices when none were given: what `features` said (load or not,
-- see the age default in 0041) plus every basic feature.
create or replace function app.default_feature_choices(p_features text[]) returns text[]
language sql immutable set search_path = '' as $$
  select array(select distinct f from unnest(coalesce(p_features, '{}') || array['carpools', 'polls', 'squads', 'attendance']) f order by f)
$$;

-- Runs after the other team triggers (name order): fills the choices of a new
-- team and computes `features`. An app that still writes `features` directly
-- (versions before this migration, which know only load) switches load.
create or replace function app.compute_team_features() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.feature_choices := coalesce(new.feature_choices, app.default_feature_choices(new.features));
  elsif new.feature_choices is not distinct from old.feature_choices and new.features is distinct from old.features then
    -- The app before 0046 knows only `load` and writes it into `features`.
    new.feature_choices := array(
      select distinct f from unnest(
        array(select c from unnest(coalesce(old.feature_choices, '{}')) c where c <> 'load')
        || case when 'load' = any (coalesce(new.features, '{}')) then array['load'] else '{}'::text[] end
      ) f order by f
    );
  end if;
  new.features := app.effective_team_features(new.club_id, new.feature_choices);
  return new;
end $$;

create or replace trigger teams_zz_compute_features before insert or update on public.teams
  for each row execute function app.compute_team_features();

-- Only who may configure the team (manageStaff) changes its choices; the
-- guard from 0041 now covers the new column too.
create or replace function app.guard_team_health_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role',true)='authenticated' and auth.uid() is not null
    and (new.age_group is distinct from old.age_group or new.features is distinct from old.features or new.feature_choices is distinct from old.feature_choices)
    and not app.has_perm(old.id,'manageStaff') then raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  -- teams_health_settings opens updates to manageStaff for these fields only.
  if current_setting('role',true)='authenticated' and auth.uid() is not null
    and (new.name is distinct from old.name or new.archived_at is distinct from old.archived_at or new.default_facility_id is distinct from old.default_facility_id)
    and not (app.has_perm(old.id,'manageFacilities') or app.manages_team(old.id)) then
    raise exception 'Not allowed.' using errcode='insufficient_privilege'; end if;
  return new;
end $$;

grant update (feature_choices) on public.teams to authenticated;

-- Recomputes the teams of a club whose result changed (an unchanged choice
-- passes the guard and lets the trigger above compute).
create or replace function app.refresh_team_features(p_club uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  changed integer;
begin
  update public.teams t set feature_choices = t.feature_choices
  where (p_club is null or t.club_id = p_club)
    and t.features is distinct from app.effective_team_features(t.club_id, t.feature_choices);
  get diagnostics changed = row_count;
  return changed;
end $$;

create or replace function app.refresh_features_of_club() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.refresh_team_features(coalesce(new.club_id, old.club_id));
  return null;
end $$;

create or replace trigger club_feature_settings_refresh after insert or update or delete on public.club_feature_settings
  for each row execute function app.refresh_features_of_club();
create or replace trigger club_entitlements_refresh after insert or update or delete on public.club_entitlements
  for each row execute function app.refresh_features_of_club();

-- Our unlocking (service role only; later the payment webhook calls it).
create or replace function app.grant_feature(p_club uuid, p_feature text, p_until date, p_source text default 'manual') returns void
language sql security definer set search_path = '' as $$
  insert into public.club_entitlements (club_id, feature, source, valid_until)
  values (p_club, p_feature, p_source, p_until)
  on conflict (club_id, feature) do update set source = excluded.source, valid_until = excluded.valid_until
$$;

-- Pilot: every club, also one founded now, has the paid features until the
-- end of the season. Changed here (and for existing clubs by SQL) once
-- packages are sold.
create or replace function app.grant_pilot_features() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.club_entitlements (club_id, feature, source, valid_until)
  select new.id, f, 'pilot', date '2027-06-30' from unnest(app.paid_feature_keys()) f
  on conflict do nothing;
  return null;
end $$;

create or replace trigger clubs_pilot_features after insert on public.clubs
  for each row execute function app.grant_pilot_features();

revoke all on function app.feature_unlocked(uuid, text), app.effective_team_features(uuid, text[]),
  app.compute_team_features(), app.refresh_team_features(uuid), app.refresh_features_of_club(),
  app.grant_feature(uuid, text, date, text), app.grant_pilot_features(), app.default_feature_choices(text[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Existing clubs and teams
-- ---------------------------------------------------------------------------

-- Choices first (from what `features` said), then the entitlements, whose
-- trigger computes the result with them.
update public.teams set feature_choices = app.default_feature_choices(features) where feature_choices is null;

insert into public.club_entitlements (club_id, feature, source, valid_until)
select c.id, f, 'pilot', date '2027-06-30' from public.clubs c cross join unnest(app.paid_feature_keys()) f
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Locked when off
-- ---------------------------------------------------------------------------

create or replace function app.team_has_feature(p_team uuid, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p_feature = any (t.features) from public.teams t where t.id = p_team), false)
$$;

-- A poll goes only to teams that use polls (department and club news are not
-- switched per team).
create or replace function app.polls_allowed(p_team_ids uuid[], p_group_ids uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from unnest(coalesce(p_team_ids, '{}')) t where not app.team_has_feature(t, 'polls')
  ) and not exists (
    select 1 from public.player_groups g where g.id = any (coalesce(p_group_ids, '{}')) and not app.team_has_feature(g.team_id, 'polls')
  )
$$;

create or replace function app.message_polls_on(p_message uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select app.polls_allowed(m.team_ids, m.group_ids) from public.messages m where m.id = p_message), false)
$$;

grant execute on function app.team_has_feature(uuid, text), app.polls_allowed(uuid[], uuid[]), app.message_polls_on(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'carpools' and policyname = 'carpools_feature') then
    create policy carpools_feature on public.carpools as restrictive for insert to authenticated
      with check (app.team_has_feature(app.team_of_session(session_id), 'carpools'));
    create policy carpool_riders_feature on public.carpool_riders as restrictive for insert to authenticated
      with check (app.team_has_feature(app.team_of_session(app.carpool_session(carpool_id)), 'carpools'));
    create policy carpool_requests_feature on public.carpool_requests as restrictive for insert to authenticated
      with check (app.team_has_feature(app.team_of_session(session_id), 'carpools'));
    create policy squad_entries_feature_insert on public.squad_entries as restrictive for insert to authenticated
      with check (app.team_has_feature(app.team_of_session(session_id), 'squads'));
    create policy squad_entries_feature_update on public.squad_entries as restrictive for update to authenticated
      using (true) with check (app.team_has_feature(app.team_of_session(session_id), 'squads'));
    create policy attendance_confirmations_feature_insert on public.attendance_confirmations as restrictive for insert to authenticated
      with check (app.team_has_feature(app.team_of_session(session_id), 'attendance'));
    create policy attendance_confirmations_feature_update on public.attendance_confirmations as restrictive for update to authenticated
      using (true) with check (app.team_has_feature(app.team_of_session(session_id), 'attendance'));
    create policy messages_polls_feature on public.messages as restrictive for insert to authenticated
      with check (poll_options is null or app.polls_allowed(team_ids, group_ids));
    create policy message_votes_feature_insert on public.message_votes as restrictive for insert to authenticated
      with check (app.message_polls_on(message_id));
    create policy message_votes_feature_update on public.message_votes as restrictive for update to authenticated
      using (true) with check (app.message_polls_on(message_id));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Live updates (0045) and the nightly check of entitlements that ran out
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['club_entitlements', 'club_feature_settings'] loop
    execute format('create or replace trigger %I after insert on public.%I referencing new table as changed_new for each statement execute function app.note_insert()', t || '_note_insert', t);
    execute format('create or replace trigger %I after update on public.%I referencing old table as changed_old new table as changed_new for each statement execute function app.note_update()', t || '_note_update', t);
    execute format('create or replace trigger %I after delete on public.%I referencing old table as changed_old for each statement execute function app.note_delete()', t || '_note_delete', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('club-os-team-features', '5 0 * * *', 'select app.refresh_team_features()');
  end if;
end $$;
