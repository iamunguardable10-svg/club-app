-- Piece 14: what players need to know beyond time and hall (decided
-- 2026-09-25).
--
-- - Sessions and series: a note, a meeting time (minutes before the start)
--   and a meeting point.
-- - Games: opponent, home or away, and for away games the address (an away
--   venue is not one of the club's halls, so the hall may be empty).
-- - "Session changed" now also goes out when the meeting time, meeting point,
--   venue or home/away changes, and says when and where to meet. A changed
--   note alone sends nothing (too chatty); players see it in the app.

alter table public.sessions
  add column notes text check (length(notes) <= 1000),
  add column meet_minutes_before smallint check (meet_minutes_before between 1 and 240),
  add column meet_point text check (length(meet_point) <= 120),
  add column opponent text check (length(opponent) <= 80),
  add column home_away text check (home_away in ('home', 'away')),
  add column venue_address text check (length(venue_address) <= 200);

-- Game details only on games; an address only for away games.
alter table public.sessions add constraint sessions_game_details check (
  session_type = 'game' or (opponent is null and home_away is null and venue_address is null)
);
alter table public.sessions add constraint sessions_venue_only_away check (
  venue_address is null or home_away = 'away'
);

alter table public.session_series
  add column notes text check (length(notes) <= 1000),
  add column meet_minutes_before smallint check (meet_minutes_before between 1 and 240),
  add column meet_point text check (length(meet_point) <= 120);

-- "Meet 17:15 at Car park" / "Meet 17:15" / "Meet at Car park" / ''.
create or replace function app.push_meet_text(p_starts_at timestamptz, p_minutes smallint, p_point text) returns text
language sql stable set search_path = '' as $$
  select case
    when p_minutes is null and nullif(btrim(p_point), '') is null then ''
    else 'Meet'
      || case when p_minutes is not null then ' ' || to_char((p_starts_at - make_interval(mins => p_minutes)) at time zone 'Europe/Berlin', 'HH24:MI') else '' end
      || case when nullif(btrim(p_point), '') is not null then ' at ' || btrim(p_point) else '' end
  end
$$;

-- As in 0013, plus meeting and venue.
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
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
    select r.user_id, 'changed', new.id, 'changed:' || new.id || ':' || r.user_id,
           'Session changed: ' || t.name,
           concat_ws(' · ',
             new.title || coalesce(' vs ' || new.opponent, '') || ' · now ' || app.push_when(new.starts_at) || '–' || to_char(new.ends_at at time zone 'Europe/Berlin', 'HH24:MI'),
             coalesce(f.name, case when new.home_away = 'away' then coalesce(nullif(new.venue_address, ''), 'away') end),
             nullif(app.push_meet_text(new.starts_at, new.meet_minutes_before, new.meet_point), '')),
           '/athlete/calendar',
           app.push_quiet_shift(now() + interval '2 minutes')
    from app.push_players(new.team_id, new.group_ids) r
    join public.teams t on t.id = new.team_id
    left join public.facilities f on f.id = new.facility_id
    on conflict (dedupe_key) do update
      set title = excluded.title, body = excluded.body, send_after = excluded.send_after,
          sent_at = null, claimed_at = null, attempts = 0;
  else
    delete from app.push_outbox where session_id = old.id and sent_at is null;
    if old.starts_at <= now() then
      return null;
    end if;
    insert into app.push_outbox (user_id, kind, session_id, dedupe_key, title, body, url, send_after)
    select r.user_id, 'cancelled', old.id, 'cancelled:' || old.id || ':' || r.user_id,
           'Session cancelled: ' || t.name,
           old.title || coalesce(' vs ' || old.opponent, '') || ' on ' || app.push_when(old.starts_at) || ' is cancelled.',
           '/athlete/calendar',
           app.push_quiet_shift(now())
    from app.push_players(old.team_id, old.group_ids) r
    join public.teams t on t.id = old.team_id
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end $$;

revoke all on function app.push_meet_text(timestamptz, smallint, text) from public, anon, authenticated;
