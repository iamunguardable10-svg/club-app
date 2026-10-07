-- Run 74: team-only rides for games. No addresses beyond the optional note.
create table public.carpools (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  driver_id uuid not null references public.people(id) on delete cascade,
  seats integer not null default 3 check (seats between 1 and 8),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique(session_id, driver_id)
);
create table public.carpool_riders (
  carpool_id uuid not null references public.carpools(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(carpool_id, person_id)
);
create table public.carpool_requests (
  session_id uuid not null references public.sessions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(session_id, person_id)
);
create index carpools_driver on public.carpools(driver_id);
create index carpool_riders_person on public.carpool_riders(person_id);
create index carpool_requests_person on public.carpool_requests(person_id);

-- Every change locks the game, serializing the cross-car rules too. The
-- carpool lock additionally protects its capacity, including seat edits.
create function app.check_carpool() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
  v_person uuid;
  v_car public.carpools;
  v_game public.sessions;
begin
  if tg_table_name = 'carpools' then
    v_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
    v_person := case when tg_op = 'DELETE' then old.driver_id else new.driver_id end;
  elsif tg_table_name = 'carpool_requests' then
    v_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
    v_person := case when tg_op = 'DELETE' then old.person_id else new.person_id end;
  else
    select * into v_car from public.carpools where id = case when tg_op = 'DELETE' then old.carpool_id else new.carpool_id end;
    -- Parent deletions cascade, including after a game has started.
    if not found and tg_op = 'DELETE' then return old; end if;
    v_session := v_car.session_id;
    v_person := case when tg_op = 'DELETE' then old.person_id else new.person_id end;
  end if;
  select * into v_game from public.sessions where id = v_session for update;
  if tg_op = 'DELETE' and (not found or not exists (select 1 from public.people where id = v_person)) then return old; end if;
  if v_game.id is null or v_game.session_type <> 'game' then
    raise exception 'Rides are only available for games.' using errcode = 'check_violation';
  end if;
  if v_game.starts_at <= now() then
    raise exception 'Rides cannot be changed after the game starts.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not exists (select 1 from public.memberships where team_id = v_game.team_id and person_id = v_person and role in ('athlete', 'coach')) then
    raise exception 'Only members of the team can arrange rides.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and tg_table_name = 'carpools' then
    if exists (select 1 from public.carpools where id = new.id) then raise unique_violation; end if;
  end if;
  if tg_op = 'INSERT' and tg_table_name = 'carpool_riders' then
    if exists (select 1 from public.carpool_riders where carpool_id = new.carpool_id and person_id = new.person_id) then raise unique_violation; end if;
  end if;
  if tg_table_name = 'carpools' then
    if new.seats not between 1 and 8 then
      raise exception 'Choose between 1 and 8 seats.' using errcode = 'check_violation';
    end if;
    if char_length(new.note) > 200 then
      raise exception 'The ride note can be at most 200 characters.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.carpool_riders r join public.carpools c on c.id = r.carpool_id where c.session_id = v_session and r.person_id = v_person) then
      raise exception 'You can ride in only one car per game.' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' and exists (select 1 from public.carpools where session_id = v_session and driver_id = v_person) then
      raise exception 'You already offer a ride for this game.' using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE' then
      perform 1 from public.carpools where id = new.id for update;
      if (select count(*) from public.carpool_riders where carpool_id = new.id) > new.seats then
        raise exception 'There are more riders than the new seat count.' using errcode = 'check_violation';
      end if;
    end if;
  else
    if exists (select 1 from public.carpools where session_id = v_session and driver_id = v_person) then
      raise exception 'A driver cannot ride in another car for this game.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.carpool_riders r join public.carpools c on c.id = r.carpool_id where c.session_id = v_session and r.person_id = v_person) then
      raise exception 'You can ride in only one car per game.' using errcode = 'check_violation';
    end if;
    if tg_table_name = 'carpool_riders' then
      select * into v_car from public.carpools where id = new.carpool_id for update;
      if (select count(*) from public.carpool_riders where carpool_id = v_car.id) >= v_car.seats then
        raise exception 'This ride has no free seats.' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger carpools_check before insert or update or delete on public.carpools for each row execute function app.check_carpool();
create trigger carpool_riders_check before insert or delete on public.carpool_riders for each row execute function app.check_carpool();
create trigger carpool_requests_check before insert or delete on public.carpool_requests for each row execute function app.check_carpool();

create function app.clear_carpool_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'carpools' then
    delete from public.carpool_requests where session_id = new.session_id and person_id = new.driver_id;
  else
    delete from public.carpool_requests where session_id = app.carpool_session(new.carpool_id) and person_id = new.person_id;
  end if;
  return null;
end $$;
create trigger carpools_clear_request after insert on public.carpools for each row execute function app.clear_carpool_request();
create trigger carpool_riders_clear_request after insert on public.carpool_riders for each row execute function app.clear_carpool_request();

create function app.carpool_session(p_car uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select session_id from public.carpools where id = p_car $$;
create function app.carpool_driver(p_car uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select driver_id from public.carpools where id = p_car $$;
create function app.in_my_carpools(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    where s.session_type = 'game' and app.is_team_member(s.team_id)
      and exists (select 1 from public.memberships m where m.team_id = s.team_id and m.person_id = p_person)
      and (exists (select 1 from public.carpools c where c.session_id = s.id and c.driver_id = p_person)
        or exists (select 1 from public.carpool_riders r join public.carpools c on c.id = r.carpool_id where c.session_id = s.id and r.person_id = p_person)
        or exists (select 1 from public.carpool_requests r where r.session_id = s.id and r.person_id = p_person))
  )
$$;
alter policy people_read on public.people using (
  app.is_me(id)
  or exists (
    select 1 from public.memberships m where m.person_id = people.id
      and ((m.role = 'coach' and app.is_team_member(m.team_id)) or (m.role = 'athlete' and app.has_perm(m.team_id, 'viewRoster')))
  )
  or exists (select 1 from public.club_roles cr where cr.person_id = people.id and app.is_club_staff(cr.club_id))
  or app.wrote_to_me(id)
  or app.in_my_carpools(id)
);

alter table public.carpools enable row level security;
alter table public.carpool_riders enable row level security;
alter table public.carpool_requests enable row level security;
revoke all on public.carpools, public.carpool_riders, public.carpool_requests from anon, authenticated;
grant select, insert, delete on public.carpools, public.carpool_riders, public.carpool_requests to authenticated;
grant update(seats, note) on public.carpools to authenticated;
create policy carpools_read on public.carpools for select to authenticated using (app.is_team_member(app.team_of_session(session_id)));
create policy carpools_insert on public.carpools for insert to authenticated with check (app.is_me(driver_id) and app.is_team_member(app.team_of_session(session_id)));
create policy carpools_update on public.carpools for update to authenticated using (app.is_me(driver_id)) with check (app.is_me(driver_id));
create policy carpools_delete on public.carpools for delete to authenticated using (app.is_me(driver_id) or app.has_perm(app.team_of_session(session_id), 'editSessions'));
create policy carpool_riders_read on public.carpool_riders for select to authenticated using (app.is_team_member(app.team_of_session(app.carpool_session(carpool_id))));
create policy carpool_riders_insert on public.carpool_riders for insert to authenticated with check (app.is_me(person_id) and app.is_team_member(app.team_of_session(app.carpool_session(carpool_id))));
create policy carpool_riders_delete on public.carpool_riders for delete to authenticated using (app.is_me(person_id) or app.is_me(app.carpool_driver(carpool_id)));
create policy carpool_requests_read on public.carpool_requests for select to authenticated using (app.is_team_member(app.team_of_session(session_id)));
create policy carpool_requests_insert on public.carpool_requests for insert to authenticated with check (app.is_me(person_id) and app.is_team_member(app.team_of_session(session_id)));
create policy carpool_requests_delete on public.carpool_requests for delete to authenticated using (app.is_me(person_id));

alter table app.push_outbox drop constraint if exists push_outbox_kind_check;
alter table app.push_outbox add constraint push_outbox_kind_check check (kind in ('changed', 'cancelled', 'reminder', 'summary', 'rate', 'review', 'report', 'digest', 'squad', 'message', 'important', 'joined', 'carpool'));
alter table public.notification_settings drop constraint if exists notification_settings_muted_kinds_check;
alter table public.notification_settings add constraint notification_settings_muted_kinds_check check (muted_kinds <@ array['changed', 'cancelled', 'reminder', 'summary', 'review', 'message', 'joined', 'carpool']::text[]);

create function app.push_carpool() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_car public.carpools;
  v_game public.sessions;
  v_name text;
  v_key text;
  v_person uuid;
begin
  if tg_table_name = 'carpools' then
    v_car := new;
    select first_name into v_name from public.people where id = new.driver_id;
    v_key := 'push.carpoolOffered';
  else
    select * into v_car from public.carpools where id = case when tg_op = 'DELETE' then old.carpool_id else new.carpool_id end;
    if not found then return null; end if;
    select first_name into v_name from public.people where id = case when tg_op = 'DELETE' then old.person_id else new.person_id end;
    v_person := case when tg_op = 'DELETE' then old.person_id else new.person_id end;
    v_key := case when tg_op = 'DELETE' then 'push.carpoolLeft' else 'push.carpoolJoined' end;
  end if;
  select * into v_game from public.sessions where id = v_car.session_id;
  if not found or v_game.starts_at <= now() or v_name is null then return null; end if;
  insert into app.push_outbox(user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct p.user_id, 'carpool', v_game.id,
    -- One pending state per rider; later joins/leaves replace it. A fresh
    -- offer has a fresh id. Network retries cannot create duplicate pushes.
    'carpool:' || v_car.id || ':' || case when tg_table_name = 'carpools' then 'offer' else v_person::text end || ':' || p.user_id,
    case when tg_table_name = 'carpools' then 'Ride offered · ' || v_name || ' has ' || v_car.seats || ' seats'
      when tg_op = 'DELETE' then 'Ride · ' || v_name || ' no longer rides with you'
      else 'Ride · ' || v_name || ' rides with you' end,
    v_game.title || ' · ' || app.push_when(v_game.starts_at),
    case when exists (select 1 from public.memberships m where m.person_id = p.id and m.team_id = v_game.team_id and m.role = 'coach') then '/coach/today' else '/athlete/calendar' end,
    app.push_quiet_shift(now()), v_key,
    jsonb_build_object('name', v_name, 'seats', v_car.seats, 'title', v_game.title, 'at', v_game.starts_at)
  from public.people p
  where p.user_id is not null
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
    and exists (select 1 from public.memberships m where m.person_id = p.id and m.team_id = v_game.team_id)
    and ((tg_table_name = 'carpools' and p.id <> v_car.driver_id and exists (select 1 from public.carpool_requests r where r.session_id = v_game.id and r.person_id = p.id))
      or (tg_table_name = 'carpool_riders' and p.id = v_car.driver_id))
  on conflict(dedupe_key) do update set title = excluded.title, body = excluded.body, text_key = excluded.text_key,
    text_params = excluded.text_params, send_after = excluded.send_after, sent_at = null, claimed_at = null, attempts = 0;
  return null;
end $$;
create trigger carpools_push after insert on public.carpools for each row execute function app.push_carpool();
create trigger carpool_riders_push after insert or delete on public.carpool_riders for each row execute function app.push_carpool();

-- A withdrawn offer tells its riders. When the game itself is deleted the
-- session row is gone already (cascade) and its own "cancelled" push is enough.
create function app.push_carpool_cancelled() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.sessions;
  v_name text;
begin
  select * into v_game from public.sessions where id = old.session_id;
  if not found or v_game.starts_at <= now() then return old; end if;
  select first_name into v_name from public.people where id = old.driver_id;
  insert into app.push_outbox(user_id, kind, session_id, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct p.user_id, 'carpool', v_game.id, 'carpool:' || old.id || ':cancelled:' || p.user_id,
    'Ride · ' || coalesce(v_name, 'The driver') || ' no longer drives',
    v_game.title || ' · ' || app.push_when(v_game.starts_at),
    case when exists (select 1 from public.memberships m where m.person_id = p.id and m.team_id = v_game.team_id and m.role = 'coach') then '/coach/today' else '/athlete/calendar' end,
    app.push_quiet_shift(now()), 'push.carpoolCancelled',
    jsonb_build_object('name', coalesce(v_name, ''), 'seats', old.seats, 'title', v_game.title, 'at', v_game.starts_at)
  from public.carpool_riders r
  join public.people p on p.id = r.person_id and p.user_id is not null
  where r.carpool_id = old.id
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = p.user_id)
  on conflict(dedupe_key) do nothing;
  return old;
end $$;
create trigger carpools_push_cancelled before delete on public.carpools for each row execute function app.push_carpool_cancelled();
revoke all on function app.check_carpool(), app.clear_carpool_request(), app.push_carpool(), app.push_carpool_cancelled() from public, anon, authenticated;
revoke all on function app.carpool_session(uuid), app.carpool_driver(uuid), app.in_my_carpools(uuid) from public, anon;
grant execute on function app.carpool_session(uuid), app.carpool_driver(uuid), app.in_my_carpools(uuid) to authenticated;
