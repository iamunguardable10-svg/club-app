-- Carpools: the driver sets when and where the car leaves (2026-10-22).
--
-- `depart_at` must lie before the game and at most 24 hours earlier;
-- `meet_point` is the place's name or address, picked on a map or typed;
-- with a pin, `meet_lat`/`meet_lng` (both or neither) give the exact spot,
-- so the others can open it in Google Maps. Riders get a push when the
-- driver changes the departure or the meeting point.

alter table public.carpools
  add column if not exists depart_at timestamptz,
  add column if not exists meet_point text check (char_length(meet_point) <= 120),
  add column if not exists meet_lat double precision check (meet_lat between -90 and 90),
  add column if not exists meet_lng double precision check (meet_lng between -180 and 180);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carpools_meet_pin_check') then
    alter table public.carpools add constraint carpools_meet_pin_check check ((meet_lat is null) = (meet_lng is null));
  end if;
end $$;

grant update (depart_at, meet_point, meet_lat, meet_lng) on public.carpools to authenticated;

create or replace function app.check_carpool_departure() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz;
begin
  if new.depart_at is null then return new; end if;
  select starts_at into v_start from public.sessions where id = new.session_id;
  if new.depart_at >= v_start or new.depart_at < v_start - interval '24 hours' then
    raise exception 'The departure must be before the game and at most 24 hours earlier.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace trigger carpools_departure before insert or update of depart_at on public.carpools
  for each row execute function app.check_carpool_departure();

-- A changed departure or meeting point tells the riders (one pending push per
-- rider and ride; a later change replaces it).
create or replace function app.push_carpool_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.sessions;
  v_name text;
begin
  if new.depart_at is not distinct from old.depart_at and new.meet_point is not distinct from old.meet_point
    and new.meet_lat is not distinct from old.meet_lat and new.meet_lng is not distinct from old.meet_lng then return null; end if;
  select * into v_game from public.sessions where id = new.session_id;
  if not found or v_game.starts_at <= now() then return null; end if;
  select first_name into v_name from public.people where id = new.driver_id;
  insert into app.push_outbox(user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct p.user_id, 'carpool', v_game.id, 'carpool:' || new.id || ':changed:' || p.user_id,
    'Ride · ' || coalesce(v_name, 'The driver') || ' changed the departure',
    concat_ws(' · ', v_game.title, case when new.depart_at is not null then 'Departure ' || app.push_when(new.depart_at) end, new.meet_point),
    case when exists (select 1 from public.memberships m where m.person_id = p.id and m.team_id = v_game.team_id and m.role = 'coach') then '/coach/today' else '/athlete/calendar' end,
    app.push_quiet_shift(now()), 'push.carpoolChanged',
    jsonb_build_object('name', coalesce(v_name, ''), 'title', v_game.title, 'at', v_game.starts_at, 'depart_at', new.depart_at, 'meet_point', new.meet_point)
  from public.carpool_riders r
  join public.people p on p.id = r.person_id and p.user_id is not null
  where r.carpool_id = new.id
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  on conflict(dedupe_key) do update set title = excluded.title, body = excluded.body, text_key = excluded.text_key,
    text_params = excluded.text_params, send_after = excluded.send_after, sent_at = null, claimed_at = null, attempts = 0;
  return null;
end $$;

create or replace trigger carpools_push_changed after update of depart_at, meet_point, meet_lat, meet_lng on public.carpools
  for each row execute function app.push_carpool_changed();

revoke all on function app.check_carpool_departure(), app.push_carpool_changed() from public, anon, authenticated;
