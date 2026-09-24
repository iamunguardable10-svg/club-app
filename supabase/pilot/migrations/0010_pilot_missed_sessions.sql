-- "How hard was it?" (piece 4, decided 2026-09-24): after every team session
-- a player is asked to rate it. "I didn't take part" is saved as its own
-- availability status, `missed`: said afterwards, shown to coaches as an
-- absence with its own label, not as a cancellation (`out`, said beforehand).
--
-- Also: a player can only say they missed a session once it has started.

alter table public.availability drop constraint if exists availability_status_check;
alter table public.availability add constraint availability_status_check
  check (status in ('in', 'late', 'out', 'missed'));

create or replace function app.check_missed_after_start() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'missed' and exists (
    select 1 from public.sessions s where s.id = new.session_id and s.starts_at > now()
  ) then
    raise exception 'You can only say you did not take part once the session has started.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger availability_missed_after_start before insert or update of status on public.availability
  for each row execute function app.check_missed_after_start();
