-- Push notifications in the recipient's language (App languages, area 6b, 2026-09-26).
--
-- The database keeps writing each message in English (title, body): that is
-- what goes out when no other language is known or a text is missing. Next
-- to it, every message now carries a text key and its values (text_key,
-- text_params). push_take_due hands them to the dispatcher together with the
-- account's language (auth user metadata "locale", set by the app), and the
-- dispatcher writes title and body in that language from the app's text
-- files (supabase/functions/push-dispatch/push-texts.json, made by
-- `npm run push-texts`).
--
-- The functions below are the latest versions (0016, 0019, 0021, 0022, 0028,
-- 0017) with only the two new columns added. Operator messages
-- (app.push_operators) stay English.

alter table app.push_outbox add column if not exists text_key text, add column if not exists text_params jsonb;

create or replace function app.push_session_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.starts_at <= now()
       or (new.starts_at = old.starts_at and new.ends_at = old.ends_at
           and new.facility_id is not distinct from old.facility_id
           and new.meet_minutes_before is not distinct from old.meet_minutes_before
           and new.meet_point is not distinct from old.meet_point
           and new.venue_address is not distinct from old.venue_address
           and new.home_away is not distinct from old.home_away) then
      return null;
    end if;
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
    select r.user_id, 'changed', new.id, 'changed:' || new.id || ':' || r.user_id,
           'Session changed: ' || t.name,
           concat_ws(' · ',
             new.title || coalesce(' vs ' || new.opponent, '') || ' · now ' || app.push_when(new.starts_at) || '–' || to_char(new.ends_at at time zone 'Europe/Berlin', 'HH24:MI'),
             coalesce(f.name, case when new.home_away = 'away' then coalesce(nullif(new.venue_address, ''), 'away') end),
             nullif(app.push_meet_text(new.starts_at, new.meet_minutes_before, new.meet_point), '')),
           '/athlete/calendar',
           app.push_quiet_shift(now() + interval '2 minutes'),
           'push.changed',
           jsonb_build_object('team', t.name, 'title', new.title, 'opponent', new.opponent, 'at', new.starts_at, 'ends_at', new.ends_at,
             'facility', f.name, 'venue', nullif(new.venue_address, ''), 'away', new.home_away = 'away',
             'meet_minutes', new.meet_minutes_before, 'meet_point', nullif(btrim(new.meet_point), ''))
    from app.push_players(new.team_id, new.group_ids) r
    join public.teams t on t.id = new.team_id
    left join public.facilities f on f.id = new.facility_id
    on conflict (dedupe_key) do update
      set title = excluded.title, body = excluded.body, send_after = excluded.send_after,
          text_key = excluded.text_key, text_params = excluded.text_params,
          sent_at = null, claimed_at = null, attempts = 0;
  else
    delete from app.push_outbox where session_id = old.id and sent_at is null;
    if old.starts_at <= now() then
      return null;
    end if;
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
    select r.user_id, 'cancelled', old.id, 'cancelled:' || old.id || ':' || r.user_id,
           'Session cancelled: ' || t.name,
           old.title || coalesce(' vs ' || old.opponent, '') || ' on ' || app.push_when(old.starts_at) || ' is cancelled.',
           '/athlete/calendar',
           app.push_quiet_shift(now()),
           'push.cancelled',
           jsonb_build_object('team', t.name, 'title', old.title, 'opponent', old.opponent, 'at', old.starts_at)
    from app.push_players(old.team_id, old.group_ids) r
    join public.teams t on t.id = old.team_id
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end $$;

create or replace function app.push_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from app.push_outbox where dedupe_key = 'review:' || old.entry_id and sent_at is null;
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select p.user_id, 'review', 'review:' || new.entry_id,
         'Please check an entry',
         coalesce(c.first_name || ' asks you to check ', 'Your coach asks you to check ')
           || e.title || ' (' || to_char(e.date, 'Dy DD Mon') || ': RPE ' || trim_scale(e.rpe)::text || ' · ' || e.duration_minutes || ' min)'
           || coalesce(' – ' || nullif(btrim(new.note), ''), ''),
         '/athlete/load',
         app.push_quiet_shift(now()),
         'push.review',
         jsonb_build_object('coach', c.first_name, 'title', e.title, 'date', e.date, 'rpe', trim_scale(e.rpe)::text,
           'minutes', e.duration_minutes, 'note', nullif(btrim(new.note), ''))
  from public.load_entries e
  join public.people p on p.id = e.person_id and p.user_id is not null
  left join public.people c on c.id = new.requested_by
  where e.id = new.entry_id
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  on conflict (dedupe_key) do update
    set body = excluded.body, send_after = excluded.send_after, text_params = excluded.text_params,
        sent_at = null, claimed_at = null, attempts = 0;
  return null;
end $$;

create or replace function app.push_squad_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.squad_published_at is null or new.squad_published_at is not distinct from old.squad_published_at
     or new.starts_at <= now() then
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select p.user_id, 'squad', new.id, 'squad:' || new.id || ':' || p.user_id,
         case q.status when 'squad' then 'You''re in the squad' when 'reserve' then 'You''re a reserve' else 'Not in the squad this time' end,
         concat_ws(' · ',
           new.title || coalesce(' vs ' || new.opponent, ''),
           app.push_when(new.starts_at),
           case when q.status <> 'not_selected' then nullif(app.push_meet_text(new.starts_at, new.meet_minutes_before, new.meet_point), '') end),
         '/athlete/calendar',
         app.push_quiet_shift(now()),
         'push.squad',
         jsonb_build_object('status', q.status, 'title', new.title, 'opponent', new.opponent, 'at', new.starts_at,
           'meet_minutes', new.meet_minutes_before, 'meet_point', nullif(btrim(new.meet_point), ''))
  from public.squad_entries q
  join public.people p on p.id = q.person_id and p.user_id is not null
  where q.session_id = new.id and q.status is distinct from q.notified_status
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  on conflict (dedupe_key) do update
    set title = excluded.title, body = excluded.body, send_after = excluded.send_after,
        text_key = excluded.text_key, text_params = excluded.text_params, sent_at = null, claimed_at = null, attempts = 0;
  update public.squad_entries q set notified_status = q.status
  where q.session_id = new.id and q.status is distinct from q.notified_status;
  return null;
end $$;

create or replace function app.push_enqueue_due(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Are you in? (no answer yet, not away, from 24 h before, not later than 2 h before)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'reminder', s.id, 'reminder:' || s.id || ':' || r.user_id,
         'Are you in?',
         t.name || ' · ' || s.title || ', ' || app.push_when(s.starts_at) || '. Tap to answer.',
         '/athlete/home',
         app.push_quiet_shift(p_now),
         'push.reminder',
         jsonb_build_object('team', t.name, 'title', s.title, 'at', s.starts_at)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.starts_at > p_now + interval '2 hours' and s.starts_at <= p_now + interval '24 hours'
    and app.push_quiet_shift(p_now) <= s.starts_at - interval '1 hour'
    and not exists (select 1 from public.availability a where a.session_id = s.id and a.person_id = r.person_id)
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
  on conflict (dedupe_key) do nothing;

  -- Coach overview, 2 h before (to coaches who may see attendance)
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select c.user_id, 'summary', s.id, 'summary:' || s.id || ':' || c.user_id,
         t.name || ' · ' || s.title || ' at ' || to_char(s.starts_at at time zone 'Europe/Berlin', 'HH24:MI'),
         concat_ws(' · ',
           counts.present || ' in',
           case when counts.late > 0 then counts.late || ' late' end,
           counts.absent || ' out',
           counts.open || ' no answer'),
         '/coach/today',
         app.push_quiet_shift(p_now),
         'push.summary',
         jsonb_build_object('team', t.name, 'title', s.title, 'at', s.starts_at,
           'in', counts.present, 'late', counts.late, 'out', counts.absent, 'open', counts.open)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null
  cross join lateral (
    select distinct p.user_id
    from public.memberships m
    join public.people p on p.id = m.person_id and p.user_id is not null
    join public.coach_roles cr on cr.id = m.coach_role_id
    where m.team_id = s.team_id and m.role = 'coach'
      and (cr.locked or 'viewAttendance' = any (cr.permissions))
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  ) c
  cross join lateral (
    select count(*) filter (where a.status = 'in') as present,
           count(*) filter (where a.status = 'late') as late,
           count(*) filter (where a.status in ('out', 'missed') or (a.status is null and away)) as absent,
           count(*) filter (where a.status is null and not away) as open
    from public.memberships m
    left join public.availability a on a.session_id = s.id and a.person_id = m.person_id
    cross join lateral (select app.absent_for_session(m.person_id, s.id) as away) x
    where m.team_id = s.team_id and m.role = 'athlete'
      and (cardinality(s.group_ids) = 0 or exists (
        select 1 from public.player_group_members g where g.person_id = m.person_id and g.group_id = any (s.group_ids)
      ))
      and app.squad_status(m.person_id, s.id) is distinct from 'not_selected'
  ) counts
  where s.starts_at > p_now + interval '30 minutes' and s.starts_at <= p_now + interval '2 hours'
    and app.push_quiet_shift(p_now) < s.starts_at
  on conflict (dedupe_key) do nothing;

  -- How hard was it? Right after the end, also in quiet hours (it has priority).
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select r.user_id, 'rate', s.id, 'rate:' || s.id || ':' || r.user_id,
         'How hard was it?',
         s.title || ' (' || t.name || ') is over. Rate it in a few seconds.',
         '/athlete/home',
         p_now,
         'push.rate',
         jsonb_build_object('team', t.name, 'title', s.title)
  from public.sessions s
  join public.teams t on t.id = s.team_id and t.archived_at is null and 'load' = any (t.features)
  cross join lateral app.push_players(s.team_id, s.group_ids) r
  where s.ends_at <= p_now and s.ends_at > p_now - interval '12 hours'
    and r.joined_at <= s.ends_at
    and not exists (
      select 1 from public.availability a
      where a.session_id = s.id and a.person_id = r.person_id and a.status in ('out', 'missed')
    )
    and not app.absent_for_session(r.person_id, s.id)
    and app.squad_status(r.person_id, s.id) is distinct from 'not_selected'
    and not exists (select 1 from public.load_entries le where le.session_id = s.id and le.person_id = r.person_id)
  on conflict (dedupe_key) do nothing;
end $$;

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
           || t.name || coalesce(' · ' || a.first_name, ''),
         left(regexp_replace(new.body, '\s+', ' ', 'g'), 180),
         '/athlete/messages',
         app.push_quiet_shift(now()),
         'push.message',
         jsonb_build_object('team', t.name, 'author', a.first_name, 'important', new.important, 'reminder', v_reminder)
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
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct on (c.user_id) c.user_id, 'joined',
         'joined:' || new.team_id || ':' || new.person_id || ':' || c.user_id,
         t.name || ' · New player',
         j.first_name || ' ' || j.last_name || ' joined with the team code. Not someone you know? Remove them under Team → Players.',
         '/coach/team',
         app.push_quiet_shift(now()),
         'push.joined',
         jsonb_build_object('team', t.name, 'name', j.first_name || ' ' || j.last_name)
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
        'payload', jsonb_build_object('title', o.title, 'body', o.body, 'url', o.url, 'tag', o.kind || ':' || coalesce(o.session_id::text, o.id::text)),
        -- The dispatcher writes title and body in this language when it has the texts.
        'locale', u.raw_user_meta_data ->> 'locale', 'text_key', o.text_key, 'text_params', o.text_params
      ))
      from app.push_outbox o
      join public.push_subscriptions s on s.user_id = o.user_id
      left join auth.users u on u.id = o.user_id
      where o.id = any (coalesce(v_ids, '{}'))
    ), '[]'::jsonb)
  );
end $$;
