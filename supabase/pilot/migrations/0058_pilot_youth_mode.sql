-- Youth mode per team (audit 2026-11, proposal 8; Ben 2026-11-13: without the
-- faces, the ACWR chips stay). Additive: two functions replaced, one new.
--
-- 1. New teams up to U13 start with load off (until now up to U11). A coach
--    who wants it switches it on, as before.
-- 2. "Remind about consent": a coach who sees the roster sends the players
--    of the team who still lack health consent one push a day to open their
--    consent page (for under-16s: send the link to a parent). The coach never
--    sees or creates the parent link; that stays with the player.

create or replace function app.team_age_default() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.features is null then new.features := case when new.age_group in ('U8','U9','U10','U11','U12','U13') then '{}'::text[] else '{load}'::text[] end; end if;
  return new;
end $$;

create or replace function public.remind_consent(p_team uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not app.has_perm(p_team, 'viewRoster') then
    raise exception 'Your role may not see this team''s players.' using errcode = 'insufficient_privilege';
  end if;
  perform app.rate_check('remind_consent', 20, 3600);
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select p.user_id, 'consent', 'consent-remind:' || p.id || ':' || current_date,
         'Consent for your load', 'Your coach asks you to sort out consent for your training load.',
         '/settings#health-data', app.push_quiet_shift(now()), 'push.consentReminder', '{}'::jsonb
  from public.memberships m
  join public.people p on p.id = m.person_id
  join public.teams t on t.id = m.team_id
  where m.team_id = p_team and m.role = 'athlete' and t.archived_at is null
    and 'load' = any (coalesce(t.features, '{}'))
    and p.user_id is not null
    and not app.health_active(p.id)
    and exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.remind_consent(uuid) from public, anon;
grant execute on function public.remind_consent(uuid) to authenticated;
