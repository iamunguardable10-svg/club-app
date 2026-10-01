-- Club and department news (piece C, 2026-10-01).
--
-- News go to everyone in a club or in one department: the players and staff
-- of its active teams, and the club roles over them. Who writes:
-- - to the whole club: club admins;
-- - to a department: its lead (and club admins); the lead can let the Head
--   Coaches of the department's teams write too
--   (departments.news_by_head_coaches, off by default).
-- Like team messages: no replies, "important" ones are pinned for 1 day to
-- 2 weeks (push cannot be switched off), read = seen, and the writers see
-- "read 34/58".

alter table public.departments add column news_by_head_coaches boolean not null default false;

create table public.club_news (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  -- Empty: the whole club.
  department_id uuid references public.departments (id) on delete cascade,
  author_id uuid references public.people (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  important boolean not null default false,
  pinned_until timestamptz,
  created_at timestamptz not null default now(),
  check (
    case when important
      then pinned_until is not null and pinned_until > created_at and pinned_until <= created_at + interval '31 days'
      else pinned_until is null
    end
  )
);
create index club_news_club on public.club_news (club_id, created_at desc);
create index club_news_department on public.club_news (department_id);
create index club_news_author on public.club_news (author_id);

create table public.news_reads (
  news_id uuid not null references public.club_news (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (news_id, person_id)
);
create index news_reads_person on public.news_reads (person_id);

-- ---------------------------------------------------------------------------
-- Who writes, who reads
-- ---------------------------------------------------------------------------

-- Whether the signed-in user may write news to the club (department null) or
-- to one department of it.
create or replace function app.may_post_news(p_club uuid, p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_department is null then app.is_club_admin(p_club)
    else exists (
      select 1 from public.departments d
      where d.id = p_department and d.club_id = p_club
        and (app.manages_department(d.id) or (d.news_by_head_coaches and exists (
          select 1
          from public.teams t
          join public.memberships m on m.team_id = t.id and m.role = 'coach'
          join public.coach_roles r on r.id = m.coach_role_id and r.locked
          join public.people p on p.id = m.person_id
          where t.department_id = d.id and t.archived_at is null and p.user_id = auth.uid()
        )))
    )
  end
$$;

-- Who a news item is for: players and staff of the active teams in scope,
-- and the club roles over them (admins; the lead of that department).
create or replace function app.news_recipients(p_news uuid)
returns table (person_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.person_id
  from public.club_news n
  join public.teams t on t.club_id = n.club_id and t.archived_at is null
    and (n.department_id is null or t.department_id = n.department_id)
  join public.memberships m on m.team_id = t.id
  where n.id = p_news
  union
  select cr.person_id
  from public.club_news n
  join public.club_roles cr on cr.club_id = n.club_id
    and (cr.role = 'admin' or n.department_id is null or cr.department_id = n.department_id)
  where n.id = p_news
$$;

-- Whether the signed-in user runs this scope: club admins (club), the lead
-- and admins (department). They may delete others' news and see who read it.
create or replace function app.runs_news_scope(p_club uuid, p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_department is null then app.is_club_admin(p_club) else app.manages_department(p_department) end
$$;

create or replace function app.may_read_news(p_news uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.club_news n
    where n.id = p_news and (
      app.may_post_news(n.club_id, n.department_id)
      or exists (select 1 from app.news_recipients(p_news) r join public.people p on p.id = r.person_id where p.user_id = auth.uid())
    )
  )
$$;

alter table public.club_news enable row level security;
alter table public.news_reads enable row level security;
revoke all on public.club_news, public.news_reads from anon, authenticated;
grant select, insert, delete on public.club_news to authenticated;
grant select, insert on public.news_reads to authenticated;
grant update (news_by_head_coaches) on public.departments to authenticated;

create policy club_news_read on public.club_news for select to authenticated
  using (app.may_read_news(id));
create policy club_news_post on public.club_news for insert to authenticated
  with check (app.may_post_news(club_id, department_id) and author_id is not null and app.is_me(author_id));
-- Deleted by its writer, or by whoever runs that scope.
create policy club_news_delete on public.club_news for delete to authenticated
  using ((author_id is not null and app.is_me(author_id)) or app.runs_news_scope(club_id, department_id));

create policy news_reads_read on public.news_reads for select to authenticated
  using (app.is_me(person_id) or exists (
    select 1 from public.club_news n where n.id = news_id
      and ((n.author_id is not null and app.is_me(n.author_id)) or app.runs_news_scope(n.club_id, n.department_id))
  ));
create policy news_reads_mark on public.news_reads for insert to authenticated
  with check (app.is_me(person_id) and person_id in (select r.person_id from app.news_recipients(news_id) r));

-- The lead of a department (and admins) decide whether its Head Coaches write
-- news. Renaming stays with the admin (checked below: both share the update).
create policy departments_news_rule on public.departments for update to authenticated
  using (app.manages_department(id)) with check (app.manages_department(id));

create or replace function app.check_department_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.name is distinct from old.name and not app.is_club_admin(old.club_id) then
    raise exception 'Only the club admin may rename a department.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger departments_write_rules before update on public.departments
  for each row execute function app.check_department_write();

-- The department belongs to the club; a pin time for important news (a week
-- unless given).
create or replace function app.check_club_news() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.club_id = new.club_id
  ) then
    raise exception 'This department belongs to another club.' using errcode = 'check_violation';
  end if;
  if new.important and new.pinned_until is null then
    new.pinned_until := new.created_at + interval '7 days';
  end if;
  return new;
end $$;
create trigger club_news_check before insert on public.club_news
  for each row execute function app.check_club_news();

-- ---------------------------------------------------------------------------
-- Pushes: like team messages ('message', or 'important' which cannot be muted)
-- ---------------------------------------------------------------------------

create or replace function app.push_club_news() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct on (p.user_id) p.user_id,
         case when new.important then 'important' else 'message' end,
         'news:' || new.id || ':' || p.user_id,
         (case when new.important then 'Important · ' else '' end)
           || coalesce(d.name, c.name) || coalesce(' · ' || a.first_name, ''),
         left(regexp_replace(new.body, '\s+', ' ', 'g'), 180),
         case when exists (select 1 from public.memberships m where m.person_id = p.id and m.role = 'athlete')
           then '/athlete/messages' else '/news' end,
         app.push_quiet_shift(now()),
         'push.news',
         jsonb_build_object('scope', coalesce(d.name, c.name), 'author', a.first_name, 'important', new.important)
  from app.news_recipients(new.id) r
  join public.people p on p.id = r.person_id and p.user_id is not null
  join public.clubs c on c.id = new.club_id
  left join public.departments d on d.id = new.department_id
  left join public.people a on a.id = new.author_id
  where exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
    and p.user_id is distinct from (select ap.user_id from public.people ap where ap.id = new.author_id)
  on conflict (dedupe_key) do nothing;
  return null;
end $$;
create trigger club_news_push after insert on public.club_news
  for each row execute function app.push_club_news();

-- Read in the meantime: nothing left to send.
create or replace function app.news_read_closes_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update app.push_outbox o set sent_at = now()
  from public.people p
  where p.id = new.person_id and o.user_id = p.user_id and o.sent_at is null
    and o.dedupe_key = 'news:' || new.news_id || ':' || p.user_id;
  return null;
end $$;
create trigger news_reads_close_push after insert on public.news_reads
  for each row execute function app.news_read_closes_push();

revoke all on function app.check_department_write(), app.check_club_news(), app.push_club_news(), app.news_read_closes_push() from public, anon, authenticated;
revoke all on function app.may_post_news(uuid, uuid), app.runs_news_scope(uuid, uuid), app.news_recipients(uuid), app.may_read_news(uuid) from public, anon;
grant execute on function app.may_post_news(uuid, uuid), app.runs_news_scope(uuid, uuid), app.news_recipients(uuid), app.may_read_news(uuid) to authenticated;
