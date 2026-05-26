-- Athlete load foundation V1
-- Extends load_entries from session-only reporting to bottom-up athlete logging.
-- Athletes can now log solo load before they belong to a team/session, while
-- planned team sessions still connect through session_id.

alter table public.load_entries
  alter column session_id drop not null;

alter table public.load_entries
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists entry_date date,
  add column if not exists training_type text check (training_type in ('team_training', 'strength', 'game', 'individual', 'recovery', 'school_sport', 'prehab')),
  add column if not exists source text not null default 'planned_session' check (source in ('planned_session', 'solo', 'manual'));

update public.load_entries le
set
  team_id = coalesce(le.team_id, s.team_id),
  entry_date = coalesce(le.entry_date, s.starts_at::date),
  training_type = coalesce(
    le.training_type,
    case s.session_type
      when 'game' then 'game'
      when 's_and_c' then 'strength'
      when 'recovery' then 'recovery'
      when 'other' then 'individual'
      else 'team_training'
    end
  )
from public.sessions s
where le.session_id = s.id;

update public.load_entries
set entry_date = coalesce(entry_date, submitted_at::date),
    training_type = coalesce(training_type, 'team_training');

alter table public.load_entries
  alter column entry_date set not null,
  alter column training_type set not null;

alter table public.load_entries
  drop constraint if exists load_entries_requires_session_or_solo_date;

alter table public.load_entries
  add constraint load_entries_requires_session_or_solo_date
  check (session_id is not null or (entry_date is not null and source in ('solo', 'manual')));

create index if not exists idx_load_entries_team_id on public.load_entries(team_id);
create index if not exists idx_load_entries_entry_date on public.load_entries(entry_date);
create index if not exists idx_load_entries_user_date on public.load_entries(user_id, entry_date desc);

drop policy if exists "load_select_context" on public.load_entries;
drop policy if exists "load_insert_own" on public.load_entries;
drop policy if exists "load_update_own" on public.load_entries;
drop policy if exists "load_delete_own" on public.load_entries;

create policy "load_select_context"
on public.load_entries for select
to authenticated
using (
  user_id = auth.uid()
  or (
    session_id is not null
    and exists (
      select 1
      from public.sessions s
      where s.id = load_entries.session_id
        and (
          public.is_department_lead(s.department_id)
          or public.is_team_staff(s.team_id)
        )
    )
  )
  or (
    team_id is not null
    and (
      public.is_team_staff(team_id)
      or exists (
        select 1
        from public.teams t
        where t.id = load_entries.team_id
          and public.is_department_lead(t.department_id)
      )
    )
  )
);

create policy "load_insert_own"
on public.load_entries for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    (session_id is not null and public.can_view_session(session_id))
    or (session_id is null and source in ('solo', 'manual'))
  )
);

create policy "load_update_own"
on public.load_entries for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    (session_id is not null and public.can_view_session(session_id))
    or (session_id is null and source in ('solo', 'manual'))
  )
);

create policy "load_delete_own"
on public.load_entries for delete
to authenticated
using (user_id = auth.uid());
