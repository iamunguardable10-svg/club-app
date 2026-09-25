# Pilot database

The Supabase schema for the club pilot (docs/simplify-decisions.md, point 8).
Derived from the local data model in `src/shared/data/schema.ts`; the older
schema in `supabase/migrations` is the pre-pilot one and only a reference.

Project: `CLUB_ProjectV2` (`tszxeainmwowmixqmphn`, eu-west-3). All eleven
migrations below are applied there (2026-09-24).

| File | What it does |
|---|---|
| `migrations/0001_pilot_schema.sql` | Tables, and the rules that hold no matter who writes: a hall must be bookable for the team's department, Head Coach role locked, a team always keeps a staff manager, the four role templates per new team, dependent rights completed |
| `migrations/0002_pilot_rls.sql` | Row-level security: who may read and change what, following the coach rights of Run 7 and 8 |
| `migrations/0003_pilot_indexes_and_write_policies.sql` | Foreign-key indexes and one policy per write command (Supabase performance advisor); no rule changes |
| `migrations/0004_pilot_access.sql` | Join codes (one per team) and staff invitations, with `join_team`, `accept_staff_invite` and `invite_preview`, the only functions the app calls |
| `migrations/0005_pilot_setup_function.sql` | `app.setup_club(...)`: creates a club with department, team, hall and a Head Coach invitation; owner only |
| `migrations/0006_pilot_english_messages.sql` | The same functions with English messages (the interface is English) |
| `migrations/0007_pilot_english_role_templates.sql` | English role templates: Head Coach, Assistant Coach, Athletic Coach, Team Manager |
| `migrations/0008_pilot_remove_athletes.sql` | Staff with `manageStaff` may remove players from their team; the player also leaves the team's groups, person and history stay |
| `migrations/0009_pilot_team_features.sql` | Team features (`teams.features`, for now `load`): without load, the team's load rights have no effect and its players cannot record load |
| `migrations/0010_pilot_missed_sessions.sql` | Availability status `missed` ("I didn't take part", said after the session), only once the session has started |
| `migrations/0011_pilot_club_admin.sql` | Club administration: club admin and department leads (`club_roles`), their invitations, one-time founding codes and `found_club`, management rights in managed teams without player data, archiving teams |
| `migrations/0012_pilot_onboarding.sql` | Onboarding: `join_code_preview` (club and team behind a join code) and `founding_code_usable`, both callable before signing in; `join_team` refuses archived teams; clear message when an account already belongs to another club; `invite_preview` returns the kind (`staff` or `club`) |
| `migrations/0013_pilot_push.sql` | Push notifications: devices (`push_subscriptions`), the outbox, quiet hours 22–07 (except "How hard was it?"), change/cancel triggers, due reminders, coach overview and rating prompts, the minute tick (pg_cron + pg_net) and the sender's functions |
| `migrations/0014_pilot_push_hardening.sql` | Only the service role calls the sender's functions; `pg_net` in the `extensions` schema |
| `migrations/0015_pilot_load_summaries_nightly.sql` | Traffic lights recomputed on the server every night (`app.load_summary`, `app.refresh_load_summaries`, job `club-os-load-summaries`), same EWMA formula as the app |
| `migrations/0016_pilot_review_and_attendance.sql` | Check requests on load entries (`load_entry_reviews`: coaches with load details ask, the player corrects or confirms, push "Please check an entry") and confirmed attendance (`attendance_confirmations`: coaches with attendance after the start; confirmed absent → no rating push) |
| `migrations/0017_pilot_settings.sql` | Settings (piece 12): `notification_settings` per account (switched-off kinds, own quiet hours; applied when sending, "How hard was it?" cannot be switched off), club rename by the admin, deleting departments without teams, players leaving a team themselves |
| `migrations/0018_pilot_error_reports.sql` | Errors and problem reports (piece 13): `app.error_reports` (not readable by app users; cleaned, repeats counted, capped), `report_error` / `report_problem` for the app (signed in or not) and the Edge Function, operators (`app.operators`) list and resolve them at `/reports`, push per problem report and a morning summary (`club-os-error-digest`) |
| `migrations/0019_pilot_session_details.sql` | Session details (piece 14): note, meeting time (minutes before) and meeting point on sessions and series; games also opponent, home/away and venue address (away games may have no hall). "Session changed" also for meeting/venue changes and says where to meet; a note alone sends nothing |
| `migrations/0020_pilot_absences.sql` | Absences over a period (piece 16): `absences` (period, readable with viewAttendance) and `absence_reasons` (kind and note, readable with viewAbsenceReasons); entered by the player or coaches with attendance rights; sessions in the period count as out unless the player says "in" for one (`app.absent_for_session`); no "Are you in?" or "How hard was it?" for them, counted as out in the coach overview, waiting pushes closed when an absence is added |
| `migrations/0021_pilot_squads.sql` | Squads for games (piece 15): `squad_entries` (squad / reserve / not selected, picked by roles with editSessions, seen by coaches with attendance and by the player only once `sessions.squad_published_at` is set), push per player on publishing and later only to those whose status changed (`notified_status`); not selected: no "Are you in?", no "How hard was it?", not counted in the coach overview |
| `migrations/0022_pilot_team_messages.sql` | Team messages (piece 17): `team_messages` (to the team or groups, optional important; written by roles with viewAttendance or editSessions) and `message_reads` (a player marks what they have seen); push per message (kind `message`, can be muted; `important` cannot), one reminder to the unread, closed when read |
| `tests/00_supabase_shim.sql` | Stand-in for Supabase's `auth` schema and roles, **local tests only** |
| `tests/01_rls_test.sql` | 105 checks, each acting as one person (Head Coach, Betreuer, athlete, outsider) |
| `tests/02_access_test.sql` | 35 checks for join codes, invitations and club setup |
| `tests/03_club_admin_test.sql` | 50 checks for founding a club and running it as admin and department lead |
| `tests/run-local.sh` | Recreates a local test database, applies shim and migrations, runs the checks above |
| `tests/remote-store.test.ts` | 89 end-to-end checks: the app's real data-layer functions through the server store against the local database, as Head Coach, Betreuer, athlete and two new accounts joining |

## What the rules guarantee

- Without sign-in nothing is readable.
- Athletes own their reports, load entries, plans; nobody else can write them.
- Coaches see athletes only through a team both are in, and only as far as
  their role allows: roster, attendance, absence reasons (separate table
  `availability_reasons`), load traffic light (`load_summaries`), raw load
  (`load_entries`), athlete plans.
- Sessions, series, groups, halls, team default hall and staff can only be
  changed with the matching right; removing a player needs the staff right; club, departments and teams are read-only
  for the app.
- A hall shared with another department can only be changed by someone who
  manages halls in all of them.

## Running the tests locally

Needs a plain Postgres 15 or newer; connection through the usual `PG*`
variables. From the repository root:

```bash
supabase/pilot/tests/run-local.sh   # access rules: ends with "all access-rule checks passed"
npm run test:pilot                  # server store: ends with "all server-store checks passed"
```

Both recreate their own database (`pilot_test`, `pilot_app_test`). Never run
the shim or the tests against the Supabase project.

## How the app uses it

`src/shared/data/remote/`: the app keeps working on one document, as in the
local test mode. When a device chose the server (start page) the repository hands
every change to the server store, which sends only the changed rows, then
reloads what the user may read. What row-level security or a database rule
refused jumps back, with a message (`SyncStatusBanner`). Details in
`remoteStore.ts`.

## Founding a club

Clubs are founded in the app (piece 8). The platform owner creates a one-time
founding code in the SQL editor and passes it on:

```sql
select app.create_founding_code('for SV Example');   -- returns e.g. K7M2QX9PLA
```

Whoever signs up and enters it founds the club with its first department and
team and becomes its club admin (optionally also the team's Head Coach).
Unused codes: `select * from public.founding_codes where used_at is null;`

## Setting up a club by SQL (old way, still works)

In the Supabase SQL editor (or via the Supabase connection), once:

```sql
select app.setup_club(
  'Vereinsname', 'Stadt', 'Abteilung', 'Teamname',
  'Vorname', 'Nachname',            -- the Head Coach
  'Hallenname', 'Straße, Ort'       -- optional
);
```

It returns a token. `<app-url>/join?invite=<token>` is the Head Coach's link:
create an account there (or sign in) and accept. From then on everything
happens in the app: staff are added by name in Staff & settings and get their
own invitation link; athletes create an account and enter the join code shown
there.

### Training load per team

New teams track training load. For a team that does not need it (later decided
by the club's subscription):

```sql
update public.teams set features = '{}' where name = 'Teamname';          -- load off
update public.teams set features = array['load'] where name = 'Teamname'; -- load on
```

Nothing is deleted when load is switched off; switching it back on shows the
data again. The app cannot change this.

## Accounts

- E-mail and password (Supabase Auth). The project currently asks for e-mail
  confirmation; with Supabase's built-in mail service that only reaches a few
  addresses per hour. For the pilot either turn confirmation off (Auth →
  Providers → Email) or set up your own SMTP (Auth → SMTP).
- Auth → URL configuration: the app's address as Site URL and in the
  redirect list, so confirmation mails lead back to the app.
- The Supabase security advisor lists `join_team`, `accept_staff_invite` and
  `invite_preview` as callable security-definer functions. That is intended:
  they are the entry points; each checks who is signed in and what it is
  given, and `invite_preview` only answers for an unguessable token.
  `found_club` (0011) is listed the same way: it only acts with an unused
  founding code. `founding_codes` has no read policy on purpose: codes are
  never readable from the app. `join_code_preview` and `founding_code_usable`
  (0012) are callable without signing in on purpose: they only answer club
  and team name for an exact join code, or yes/no for a founding code.
  `push_public_key` (0013) is public on purpose (the VAPID public key);
  `save_push_subscription` / `delete_push_subscription` only act for the
  signed-in account. `push_take_due` / `push_report` are callable by the
  service role only and check the dispatch secret as well.
  `rls_auto_enable` comes with the Supabase project.

## Push notifications (piece 7)

The Edge Function source is `supabase/functions/push-dispatch/index.ts`
(deployed as `push-dispatch`, JWT verification off: the dispatch secret is
the guard). Setting it up on a project, once, in the SQL editor:

```sql
-- VAPID keys: generate with `npx web-push generate-vapid-keys`.
insert into app.push_config (key, value) values
  ('vapid_public_key', '<public key>'),
  ('vapid_private_key', '<private key>'),
  ('vapid_subject', 'https://<app address>'),
  ('function_url', 'https://<project>.supabase.co/functions/v1/push-dispatch'),
  ('dispatch_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do update set value = excluded.value;
```

Changing the VAPID keys makes every device subscribe again (they have to
turn notifications on once more). The minute job is `club-os-push-tick`
(`select * from cron.job`); what was sent is in `app.push_outbox`, the
sender's answers in `net._http_response`.

## Changing the schema

Add a new numbered file under `migrations/`, run the tests locally, then apply
it to the project. Keep `app.all_permissions()` in sync with
`COACH_PERMISSIONS` and the role templates with `COACH_ROLE_TEMPLATES`.

## Operators (error reports, piece 13)

Operators see `/reports` in the app and get the pushes about problem reports and
the morning error summary. Add an account once it exists (by SQL, in the Supabase
SQL editor):

```sql
insert into app.operators (user_id)
select id from auth.users where lower(email) = lower('you@example.com')
on conflict do nothing;
```
