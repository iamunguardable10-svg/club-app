-- Meetings as their own session type (2026-10-23, plan piece 1).
--
-- A meeting has a place (hall, room or free text in `meet_point`) and/or an
-- online link, and is not rated: no "How hard was it?" push, no load entry.

alter table public.sessions drop constraint if exists sessions_session_type_check;
alter table public.sessions add constraint sessions_session_type_check
  check (session_type in ('training', 's_and_c', 'game', 'recovery', 'other', 'meeting'));
alter table public.session_series drop constraint if exists session_series_session_type_check;
alter table public.session_series add constraint session_series_session_type_check
  check (session_type in ('training', 's_and_c', 'game', 'recovery', 'other', 'meeting'));

-- The video call link: https only, so it opens safely for everyone.
alter table public.sessions
  add column if not exists online_url text check (char_length(online_url) <= 500 and online_url ~ '^https://[^\s]+$');

-- No rating push for a meeting (the push queue is filled in several places).
create or replace function app.push_skip_meeting_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'rate' and exists (select 1 from public.sessions s where s.id = new.session_id and s.session_type = 'meeting') then
    return null;
  end if;
  return new;
end $$;

create or replace trigger push_outbox_skip_meeting_rating before insert on app.push_outbox
  for each row execute function app.push_skip_meeting_rating();

-- No load entry for a meeting.
create or replace function app.check_load_entry_not_meeting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.session_id is not null and exists (select 1 from public.sessions s where s.id = new.session_id and s.session_type = 'meeting') then
    raise exception 'A meeting is not rated.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace trigger load_entries_not_meeting before insert or update of session_id on public.load_entries
  for each row execute function app.check_load_entry_not_meeting();

revoke all on function app.push_skip_meeting_rating(), app.check_load_entry_not_meeting() from public, anon, authenticated;
