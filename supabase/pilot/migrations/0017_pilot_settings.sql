-- Piece 12: settings for everyone (decided 2026-09-25).
--
-- - Notifications per person: each kind can be switched off except "How hard
--   was it?" (the load data depends on it), and the quiet hours can be moved
--   or switched off (default 22:00–07:00; the rating prompt ignores them as
--   before). Both are applied when a message is sent, so a change also
--   applies to messages already waiting.
-- - The club admin renames the club and deletes departments without teams.
-- - A player leaves a team themselves (same effect as being removed by the
--   staff: past reports and load stay, rejoining works with the join code).

-- ---------------------------------------------------------------------------
-- Notification settings
-- ---------------------------------------------------------------------------

create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  muted_kinds text[] not null default '{}'
    check (muted_kinds <@ array['changed', 'cancelled', 'reminder', 'summary', 'review']::text[]),
  quiet_from smallint default 22 check (quiet_from between 0 and 23),
  quiet_to smallint default 7 check (quiet_to between 0 and 23),
  updated_at timestamptz not null default now(),
  -- Both hours or none (no quiet hours); the same hour twice is no window.
  check ((quiet_from is null) = (quiet_to is null) and (quiet_from is null or quiet_from <> quiet_to))
);

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon, authenticated;
grant select, insert, update on public.notification_settings to authenticated;
create policy notification_settings_own_read on public.notification_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_settings_own_insert on public.notification_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_settings_own_update on public.notification_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Messages are no longer shifted when they are queued; the quiet hours are
-- the person's own and applied when sending (push_take_due below).
create or replace function app.push_quiet_shift(p_at timestamptz) returns timestamptz
language sql immutable set search_path = '' as $$
  select p_at
$$;

-- When the person's quiet hours (club time) end if p_at is inside them,
-- otherwise p_at. No settings row: 22:00–07:00.
create or replace function app.push_quiet_until(p_at timestamptz, p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  with cfg as (
    select n.quiet_from as q_from, n.quiet_to as q_to from public.notification_settings n where n.user_id = p_user
    union all
    select 22::smallint, 7::smallint where not exists (select 1 from public.notification_settings n where n.user_id = p_user)
  ), t as (
    select p_at at time zone 'Europe/Berlin' as local, extract(hour from p_at at time zone 'Europe/Berlin')::int as h, q_from, q_to from cfg
  )
  select case
    when q_from is null then p_at
    when q_from < q_to and h >= q_from and h < q_to
      then (local::date + make_time(q_to, 0, 0)) at time zone 'Europe/Berlin'
    when q_from > q_to and h >= q_from
      then ((local::date + 1) + make_time(q_to, 0, 0)) at time zone 'Europe/Berlin'
    when q_from > q_to and h < q_to
      then (local::date + make_time(q_to, 0, 0)) at time zone 'Europe/Berlin'
    else p_at
  end
  from t
$$;

-- As in 0013, plus the person's settings: switched-off kinds are dropped,
-- quiet hours make a message wait, and a message that would arrive too late
-- after waiting is dropped ("Are you in?" within the last hour before the
-- session, the coach overview after its start).
create or replace function public.push_take_due(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  perform app.assert_dispatch_secret(p_secret);

  -- Answered in the meantime: no reminder, no rating prompt.
  update app.push_outbox o set sent_at = now()
  where o.sent_at is null and o.send_after <= now()
    and (
      (o.kind = 'reminder' and exists (
        select 1 from public.availability a join public.people p on p.id = a.person_id
        where a.session_id = o.session_id and p.user_id = o.user_id))
      or (o.kind = 'rate' and exists (
        select 1 from public.load_entries le join public.people p on p.id = le.person_id
        where le.session_id = o.session_id and p.user_id = o.user_id))
      or (o.kind = 'rate' and exists (
        select 1 from public.availability a join public.people p on p.id = a.person_id
        where a.session_id = o.session_id and p.user_id = o.user_id and a.status in ('out', 'missed')))
      -- Switched off on every device since.
      or not exists (select 1 from public.push_subscriptions s where s.user_id = o.user_id)
      -- Switched off for this kind (the rating prompt cannot be).
      or (o.kind <> 'rate' and exists (
        select 1 from public.notification_settings n where n.user_id = o.user_id and o.kind = any (n.muted_kinds)))
    );

  -- The person's quiet hours: wait (the rating prompt goes out anyway).
  update app.push_outbox o set send_after = app.push_quiet_until(now(), o.user_id)
  where o.sent_at is null and o.send_after <= now() and o.kind <> 'rate'
    and app.push_quiet_until(now(), o.user_id) > now();

  -- Too late after waiting.
  update app.push_outbox o set sent_at = now()
  from public.sessions s
  where s.id = o.session_id and o.sent_at is null
    and ((o.kind = 'reminder' and o.send_after > s.starts_at - interval '1 hour')
      or (o.kind = 'summary' and o.send_after >= s.starts_at));

  with due as (
    select id from app.push_outbox
    where sent_at is null and send_after <= now() and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by send_after
    limit 100
    for update skip locked
  )
  update app.push_outbox o set claimed_at = now()
  from due where o.id = due.id;

  select array_agg(id) into v_ids from app.push_outbox where claimed_at >= now() and sent_at is null;

  return jsonb_build_object(
    'vapid', jsonb_build_object(
      'public_key', (select value from app.push_config where key = 'vapid_public_key'),
      'private_key', (select value from app.push_config where key = 'vapid_private_key'),
      'subject', (select value from app.push_config where key = 'vapid_subject')
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'outbox_id', o.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
        'payload', jsonb_build_object('title', o.title, 'body', o.body, 'url', o.url, 'tag', o.kind || ':' || coalesce(o.session_id::text, o.id::text))
      ))
      from app.push_outbox o
      join public.push_subscriptions s on s.user_id = o.user_id
      where o.id = any (coalesce(v_ids, '{}'))
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Club: rename (admin)
-- ---------------------------------------------------------------------------

alter table public.clubs add constraint clubs_name_not_blank check (btrim(name) <> '' and length(name) <= 80);
grant update (name) on public.clubs to authenticated;
create policy clubs_rename on public.clubs for update to authenticated
  using (app.is_club_admin(id)) with check (app.is_club_admin(id));

-- ---------------------------------------------------------------------------
-- Departments: delete (admin), only without teams
-- ---------------------------------------------------------------------------

-- Teams, their sessions and history hang on the department (cascade), so a
-- department with teams, archived ones included, stays. Deleting the whole
-- club (outside the app) still cascades: the club row is gone by then.
create or replace function app.check_department_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.clubs c where c.id = old.club_id)
     and exists (select 1 from public.teams t where t.department_id = old.id) then
    raise exception 'Only a department without teams can be deleted.' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger departments_delete_check before delete on public.departments
  for each row execute function app.check_department_delete();

grant delete on public.departments to authenticated;
create policy departments_delete on public.departments for delete to authenticated
  using (app.is_club_admin(club_id));

-- ---------------------------------------------------------------------------
-- Memberships: a player leaves a team
-- ---------------------------------------------------------------------------

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    (role in ('coach', 'athlete') and app.has_perm(team_id, 'manageStaff'))
    or (role = 'athlete' and app.is_me(person_id))
  );

revoke all on function app.push_quiet_until(timestamptz, uuid), app.check_department_delete() from public, anon, authenticated;
