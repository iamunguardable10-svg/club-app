-- From the live test of the messages (Run 68). Three things the app could
-- not know from what it may read:
--
-- 1. Who wrote a message. A department lead is not in the players' teams,
--    so players (and coaches) saw "Coach" instead of their name. Now
--    everyone who may read a message may also read its author's name.
-- 2. How many a message reaches before sending. A department lead does not
--    see the players (by design), so "Goes to 1 person" for a message to
--    the whole department. message_reach() counts on the server, only for
--    what the caller may send to, and returns only the number.
-- 3. Read and vote counts of sent messages, for the same reason:
--    message_stats has them for the messages the caller runs. Numbers only;
--    names stay with those who may see the team.

-- Recipients of a message that is not written yet: the same rules as for a
-- sent one (0036, two teams count once, the author never gets their own).
create or replace function app.recipients_for(
  p_club uuid, p_author uuid, p_teams uuid[], p_groups uuid[], p_departments uuid[], p_whole_club boolean, p_audience text
)
returns table (person_id uuid)
language sql stable security definer set search_path = '' as $$
  with scoped_teams as (
    select t.id from public.teams t
    where t.club_id = p_club and t.archived_at is null
      and (p_whole_club or t.id = any (p_teams) or t.department_id = any (p_departments))
  ),
  group_teams as (
    select g.id as group_id, g.team_id from public.player_groups g
    join public.teams t on t.id = g.team_id and t.club_id = p_club
    where g.id = any (p_groups)
  ),
  everyone as (
    -- Players of whole teams
    select ms.person_id from public.memberships ms
    where p_audience <> 'staff' and ms.role = 'athlete' and ms.team_id in (select id from scoped_teams)
    union
    -- Players of the chosen groups
    select gm.person_id from public.player_group_members gm
    join group_teams gt on gt.group_id = gm.group_id
    join public.memberships ms on ms.person_id = gm.person_id and ms.team_id = gt.team_id and ms.role = 'athlete'
    where p_audience <> 'staff'
    union
    -- Staff of those teams (and of the groups' teams)
    select ms.person_id from public.memberships ms
    where p_audience <> 'players' and ms.role = 'coach'
      and (ms.team_id in (select id from scoped_teams) or ms.team_id in (select team_id from group_teams))
    union
    -- Club roles over them: all of them for the whole club, the lead for a department
    select cr.person_id from public.club_roles cr
    where p_audience <> 'players' and cr.club_id = p_club
      and (p_whole_club or cr.department_id = any (p_departments))
  )
  select e.person_id from everyone e where e.person_id is distinct from p_author
$$;

create or replace function app.message_recipients(p_message uuid)
returns table (person_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.person_id
  from public.messages m
  cross join lateral app.recipients_for(m.club_id, m.author_id, m.team_ids, m.group_ids, m.department_ids, m.whole_club, m.audience) r
  where m.id = p_message
$$;

-- 1. Authors
create or replace function app.wrote_to_me(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.messages m
    where m.author_id = p_person
      and m.club_id in (select p.club_id from public.people p where p.user_id = auth.uid())
      and app.may_read_message(m.id)
  )
$$;

alter policy people_read on public.people
  using (
    app.is_me(id)
    or exists (
      select 1 from public.memberships m
      where m.person_id = people.id
        and ((m.role = 'coach' and app.is_team_member(m.team_id)) or (m.role = 'athlete' and app.has_perm(m.team_id, 'viewRoster')))
    )
    or exists (select 1 from public.club_roles cr where cr.person_id = people.id and app.is_club_staff(cr.club_id))
    or app.wrote_to_me(id)
  );

-- 2. Reach before sending
create or replace function public.message_reach(
  p_club uuid, p_teams uuid[], p_groups uuid[], p_departments uuid[], p_whole_club boolean, p_audience text
)
returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when p_audience not in ('all', 'players', 'staff') then null
    when not (cardinality(p_teams) > 0 or cardinality(p_groups) > 0 or cardinality(p_departments) > 0 or p_whole_club) then null
    when not app.may_send_message(p_club, p_teams, p_groups, p_departments, p_whole_club) then null
    else (
      select count(*)::integer from app.recipients_for(
        p_club,
        (select p.id from public.people p where p.club_id = p_club and p.user_id = auth.uid() limit 1),
        p_teams, p_groups, p_departments, p_whole_club, p_audience
      )
    )
  end
$$;
revoke all on function public.message_reach(uuid, uuid[], uuid[], uuid[], boolean, text) from public, anon;
grant execute on function public.message_reach(uuid, uuid[], uuid[], uuid[], boolean, text) to authenticated;

-- 3. Read and vote counts
create or replace function app.my_message_stats()
returns table (message_id uuid, recipients integer, reads integer, voters integer)
language sql stable security definer set search_path = '' as $$
  select m.id,
    count(*)::integer,
    count(mr.person_id)::integer,
    count(v.person_id)::integer
  from public.messages m
  cross join lateral app.message_recipients(m.id) r
  left join public.message_reads mr on mr.message_id = m.id and mr.person_id = r.person_id
  left join public.message_votes v on v.message_id = m.id and v.person_id = r.person_id
  where m.club_id in (select p.club_id from public.people p where p.user_id = auth.uid())
    and app.manages_message(m.id)
  group by m.id
$$;

create view public.message_stats with (security_invoker = true) as
  select message_id, recipients, reads, voters from app.my_message_stats();
revoke all on public.message_stats from anon, authenticated;
grant select on public.message_stats to authenticated;
