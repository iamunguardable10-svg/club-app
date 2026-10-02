-- Staff open their messages on /messages now (2026-10-02, step 2 of the
-- messages plan); the push link follows. /news still forwards there for
-- pushes sent before.

create or replace function app.push_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reminder boolean := tg_op = 'UPDATE';
  v_label text;
begin
  if v_reminder and (new.reminded_at is null or old.reminded_at is not null) then
    return null;
  end if;
  v_label := coalesce(app.message_label(new.id), '');
  insert into app.push_outbox (user_id, kind, dedupe_key, title, body, url, send_after, text_key, text_params)
  select distinct on (p.user_id) p.user_id,
         case when new.important then 'important' else 'message' end,
         (case when v_reminder then 'message-reminder:' else 'message:' end) || new.id || ':' || p.user_id,
         (case when v_reminder then 'Reminder: ' else '' end)
           || (case when new.important then 'Important · ' else '' end)
           || (case when new.poll_options is not null then 'Poll · ' else '' end)
           || v_label || coalesce(' · ' || a.first_name, ''),
         left(regexp_replace(new.body, '\s+', ' ', 'g'), 180),
         case when exists (select 1 from public.memberships ms where ms.person_id = p.id and ms.role = 'athlete')
           then '/athlete/messages' else '/messages' end,
         app.push_quiet_shift(now()),
         'push.message',
         jsonb_build_object('team', v_label, 'author', a.first_name, 'important', new.important, 'reminder', v_reminder,
           'poll', new.poll_options is not null)
  from app.message_recipients(new.id) r
  join public.people p on p.id = r.person_id and p.user_id is not null
  left join public.people a on a.id = new.author_id
  where exists (select 1 from public.push_subscriptions s where s.user_id = p.user_id)
    and p.user_id is distinct from a.user_id
    and (not v_reminder or (
      case when new.poll_options is not null
        then not exists (select 1 from public.message_votes mv where mv.message_id = new.id and mv.person_id = r.person_id)
        else not exists (select 1 from public.message_reads mr where mr.message_id = new.id and mr.person_id = r.person_id)
      end))
  on conflict (dedupe_key) do nothing;
  return null;
end $$;
