-- Removes what 0036 replaced (2026-10-02), once the app that used it is gone:
-- team messages (0022, 0032, 0034) and club news (0035) are all `messages`
-- now, and who may write to a department is set per person (message_writers)
-- instead of per department. Nothing was ever stored in these on the club
-- server.

drop table public.news_reads;
drop table public.club_news;
drop table public.team_messages;

drop policy departments_news_rule on public.departments;
drop trigger departments_write_rules on public.departments;
alter table public.departments drop column news_by_head_coaches;

drop function app.check_team_message();
drop function app.push_team_message();
drop function app.check_club_news();
drop function app.push_club_news();
drop function app.news_read_closes_push();
drop function app.check_department_write();
drop function app.may_read_news(uuid);
drop function app.news_recipients(uuid);
drop function app.runs_news_scope(uuid, uuid);
drop function app.may_post_news(uuid, uuid);
