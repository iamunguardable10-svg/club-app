create or replace function public.get_invite_preview(p_token text)
returns table (
  status text,
  role text,
  club_name text,
  department_name text,
  team_name text,
  coach_role_label text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.status,
    i.role,
    c.name as club_name,
    d.name as department_name,
    t.name as team_name,
    s.label as coach_role_label,
    i.expires_at
  from public.invites i
  join public.clubs c on c.id = i.club_id
  left join public.departments d on d.id = i.department_id
  left join public.teams t on t.id = i.team_id
  left join public.team_coach_role_slots s on s.id = i.coach_role_slot_id
  where i.token = p_token
  limit 1;
$$;
