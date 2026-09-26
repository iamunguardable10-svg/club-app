-- How long an important team message stays pinned (2026-09-26).
--
-- The staff choose it when writing (the app offers 1 day to 2 weeks); until
-- then the message stays on top of the player's messages and on Today, even
-- after it was read. Messages that are not important are never pinned.
-- Important ones written before this keep the two weeks they had; one from
-- an app that does not send a time yet stays pinned for a week. The time is
-- fixed once written (the staff may only update reminded_at).

alter table public.team_messages add column pinned_until timestamptz;
update public.team_messages set pinned_until = created_at + interval '14 days' where important;
alter table public.team_messages add constraint team_messages_pinned_until_check check (
  case when important
    then pinned_until is not null and pinned_until > created_at and pinned_until <= created_at + interval '31 days'
    else pinned_until is null
  end
);

-- Groups must belong to the team; a reminder only once; a pin time for
-- important messages (a week unless given).
create or replace function app.check_team_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.group_ids) g(id)
    where not exists (select 1 from public.player_groups pg where pg.id = g.id and pg.team_id = new.team_id)
  ) then
    raise exception 'The groups must belong to the team.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.reminded_at is not null and new.reminded_at is distinct from old.reminded_at then
    raise exception 'Players were already reminded of this message.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and new.important and new.pinned_until is null then
    new.pinned_until := new.created_at + interval '7 days';
  end if;
  return new;
end $$;
