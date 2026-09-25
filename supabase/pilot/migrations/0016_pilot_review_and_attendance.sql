-- Pieces 10 and 11 (decided 2026-09-25).
--
-- 10 · Asking a player to check a load entry. A coach who may see load
--      details marks an entry ("please check", optional note). The player
--      gets a push and a hint and corrects it themselves; changing the entry
--      clears the mark, or the player confirms it is right. Players can edit
--      their entries at any time anyway; the mark only points at one.
-- 11 · Confirming attendance. After a session has started, a coach who may
--      see attendance records who was actually there. The confirmation wins
--      over what the player said in every count; a player confirmed absent is
--      no longer asked "How hard was it?".

-- ---------------------------------------------------------------------------
-- 10 · Review marks on load entries
-- ---------------------------------------------------------------------------

create table public.load_entry_reviews (
  entry_id uuid primary key references public.load_entries (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  requested_by uuid references public.people (id) on delete set null,
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);
create index load_entry_reviews_person on public.load_entry_reviews (person_id);

-- The player is always the entry's owner, whatever the app sends.
create or replace function app.set_review_person() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select e.person_id into new.person_id from public.load_entries e where e.id = new.entry_id;
  if new.person_id is null then
    raise exception 'Unknown load entry.' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;
create trigger load_entry_reviews_person before insert on public.load_entry_reviews
  for each row execute function app.set_review_person();

alter table public.load_entry_reviews enable row level security;
revoke all on public.load_entry_reviews from anon, authenticated;
grant select, insert, delete on public.load_entry_reviews to authenticated;
create policy load_entry_reviews_read on public.load_entry_reviews for select to authenticated
  using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewLoadDetails'));
create policy load_entry_reviews_request on public.load_entry_reviews for insert to authenticated
  with check (
    app.coach_sees_athlete(person_id, 'viewLoadDetails')
    and (requested_by is null or app.is_me(requested_by))
  );
create policy load_entry_reviews_resolve on public.load_entry_reviews for delete to authenticated
  using (app.is_me(person_id) or app.coach_sees_athlete(person_id, 'viewLoadDetails'));

-- A corrected entry needs no more checking.
create or replace function app.clear_review_on_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.rpe, new.duration_minutes, new.load, new.date, new.training_type)
     is distinct from (old.rpe, old.duration_minutes, old.load, old.date, old.training_type) then
    delete from public.load_entry_reviews where entry_id = new.id;
  end if;
  return null;
end $$;
create trigger load_entries_clear_review after update on public.load_entries
  for each row execute function app.clear_review_on_change();

-- Push: "Please check an entry" (quiet hours apply); gone again when resolved.
alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check
  check (kind in ('changed', 'cancelled', 'reminder', 'summary', 'rate', 'review'));

create or replace function app.push_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from app.push_outbox where dedupe_key = 'review:' || old.entry_id and sent_at is null;
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after)
  select p.user_id, 'review', 'review:' || new.entry_id,
         'Please check an entry',
         coalesce(c.first_name || ' asks you to check ', 'Your coach asks you to check ')
           || e.title || ' (' || to_char(e.date, 'Dy DD Mon') || ': RPE ' || trim_scale(e.rpe)::text || ' · ' || e.duration_minutes || ' min)'
           || coalesce(' – ' || nullif(btrim(new.note), ''), ''),
         '/athlete/load',
         app.push_quiet_shift(now())
  from public.load_entries e
  join public.people p on p.id = e.person_id and p.user_id is not null
  left join public.people c on c.id = new.requested_by
  where e.id = new.entry_id
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  on conflict (dedupe_key) do update
    set body = excluded.body, send_after = excluded.send_after, sent_at = null, claimed_at = null, attempts = 0;
  return null;
end $$;
create trigger load_entry_reviews_push after insert or delete on public.load_entry_reviews
  for each row execute function app.push_review();

-- ---------------------------------------------------------------------------
-- 11 · Confirmed attendance
-- ---------------------------------------------------------------------------

create table public.attendance_confirmations (
  session_id uuid not null references public.sessions (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  present boolean not null,
  confirmed_by uuid references public.people (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  primary key (session_id, person_id)
);
create index attendance_confirmations_person on public.attendance_confirmations (person_id);

-- Only players of the session's team, and only once the session has started.
create or replace function app.check_attendance_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.sessions s
    join public.memberships m on m.team_id = s.team_id and m.role = 'athlete' and m.person_id = new.person_id
    where s.id = new.session_id
  ) then
    raise exception 'Attendance can only be confirmed for players of the team.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.sessions s where s.id = new.session_id and s.starts_at > now()) then
    raise exception 'Attendance can only be confirmed once the session has started.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger attendance_confirmations_check before insert or update on public.attendance_confirmations
  for each row execute function app.check_attendance_confirmation();

alter table public.attendance_confirmations enable row level security;
revoke all on public.attendance_confirmations from anon, authenticated;
grant select, insert, update, delete on public.attendance_confirmations to authenticated;
create policy attendance_confirmations_read on public.attendance_confirmations for select to authenticated
  using (app.is_me(person_id) or app.coach_sees_availability(session_id, person_id, 'viewAttendance'));
create policy attendance_confirmations_insert on public.attendance_confirmations for insert to authenticated
  with check (app.has_perm(app.team_of_session(session_id), 'viewAttendance') and (confirmed_by is null or app.is_me(confirmed_by)));
create policy attendance_confirmations_update on public.attendance_confirmations for update to authenticated
  using (app.has_perm(app.team_of_session(session_id), 'viewAttendance'))
  with check (app.has_perm(app.team_of_session(session_id), 'viewAttendance') and (confirmed_by is null or app.is_me(confirmed_by)));
create policy attendance_confirmations_delete on public.attendance_confirmations for delete to authenticated
  using (app.has_perm(app.team_of_session(session_id), 'viewAttendance'));

-- Confirmed absent: no "How hard was it?" push. The rating message is marked
-- as done (inserted as done if not queued yet, so it is never queued later).
create or replace function app.push_skip_rating_when_absent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select p.user_id from public.people p where p.id = new.person_id);
begin
  if new.present or v_user is null then
    return null;
  end if;
  insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after, sent_at)
  values (v_user, 'rate', new.session_id, 'rate:' || new.session_id || ':' || v_user, 'How hard was it?', '', '/athlete/home', now(), now())
  on conflict (dedupe_key) do update set sent_at = coalesce(app.push_outbox.sent_at, now());
  return null;
end $$;
create trigger attendance_confirmations_push after insert or update on public.attendance_confirmations
  for each row execute function app.push_skip_rating_when_absent();

revoke all on function
  app.set_review_person(), app.clear_review_on_change(), app.push_review(),
  app.check_attendance_confirmation(), app.push_skip_rating_when_absent()
from public, anon, authenticated;
