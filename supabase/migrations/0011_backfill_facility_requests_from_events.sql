-- Transitional bridge from legacy activity_events-based facility reports
-- to structured facility_requests.
--
-- The app now reads/administers facility requests from public.facility_requests.
-- Existing department workspace code may still emit activity_events while the UI is being migrated.
-- This keeps those requests actionable without parsing text in React.

create or replace function public.extract_facility_request_address(p_body text)
returns text
language sql
immutable
as $$
  select coalesce((regexp_match(coalesce(p_body, ''), ' at "([^"]+)" may be used'))[1], 'Unknown address');
$$;

create or replace function public.extract_facility_request_name(p_title text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(coalesce(p_title, ''), '^Shared facility request:\s*', '', 'i')), '');
$$;

insert into public.facility_requests (
  club_id,
  department_id,
  requested_by,
  facility_name,
  facility_address,
  status,
  created_at,
  updated_at
)
select
  ae.club_id,
  ae.department_id,
  ae.actor_id,
  coalesce(public.extract_facility_request_name(ae.title), 'Shared facility'),
  public.extract_facility_request_address(ae.body),
  'open',
  ae.created_at,
  ae.created_at
from public.activity_events ae
where ae.event_type = 'facility_request.shared'
  and ae.department_id is not null
  and not exists (
    select 1
    from public.facility_requests fr
    where fr.club_id = ae.club_id
      and fr.department_id = ae.department_id
      and fr.facility_name = coalesce(public.extract_facility_request_name(ae.title), 'Shared facility')
      and fr.facility_address = public.extract_facility_request_address(ae.body)
      and fr.created_at = ae.created_at
  );

create or replace function public.mirror_facility_request_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facility_name text;
  v_facility_address text;
begin
  if new.event_type <> 'facility_request.shared' or new.department_id is null then
    return new;
  end if;

  v_facility_name := coalesce(public.extract_facility_request_name(new.title), 'Shared facility');
  v_facility_address := public.extract_facility_request_address(new.body);

  if not exists (
    select 1
    from public.facility_requests fr
    where fr.club_id = new.club_id
      and fr.department_id = new.department_id
      and fr.facility_name = v_facility_name
      and fr.facility_address = v_facility_address
      and fr.status = 'open'
  ) then
    insert into public.facility_requests (
      club_id,
      department_id,
      requested_by,
      facility_name,
      facility_address,
      status,
      created_at,
      updated_at
    )
    values (
      new.club_id,
      new.department_id,
      new.actor_id,
      v_facility_name,
      v_facility_address,
      'open',
      new.created_at,
      new.created_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists mirror_facility_request_event_trigger on public.activity_events;
create trigger mirror_facility_request_event_trigger
after insert on public.activity_events
for each row execute function public.mirror_facility_request_event();
