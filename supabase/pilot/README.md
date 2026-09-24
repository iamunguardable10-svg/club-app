# Pilot database

The Supabase schema for the club pilot (docs/simplify-decisions.md, point 8).
Derived from the local data model in `src/shared/data/schema.ts`; the older
schema in `supabase/migrations` is the pre-pilot one and only a reference.

Project: `CLUB_ProjectV2` (`tszxeainmwowmixqmphn`, eu-west-3). All seven
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
| `tests/00_supabase_shim.sql` | Stand-in for Supabase's `auth` schema and roles, **local tests only** |
| `tests/01_rls_test.sql` | 75 checks, each acting as one person (Head Coach, Betreuer, athlete, outsider) |
| `tests/02_access_test.sql` | 35 checks for join codes, invitations and club setup |
| `tests/run-local.sh` | Recreates a local test database, applies shim and migrations, runs the checks above |
| `tests/remote-store.test.ts` | 52 end-to-end checks: the app's real data-layer functions through the server store against the local database, as Head Coach, Betreuer, athlete and two new accounts joining |

## What the rules guarantee

- Without sign-in nothing is readable.
- Athletes own their reports, load entries, plans; nobody else can write them.
- Coaches see athletes only through a team both are in, and only as far as
  their role allows: roster, attendance, absence reasons (separate table
  `availability_reasons`), load traffic light (`load_summaries`), raw load
  (`load_entries`), athlete plans.
- Sessions, series, groups, halls, team default hall and staff can only be
  changed with the matching right; club, departments and teams are read-only
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

## Setting up the club

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
happens in the app: staff are added by name in Staff / Settings and get their
own invitation link; athletes create an account and enter the join code shown
there.

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
  `rls_auto_enable` comes with the Supabase project.

## Changing the schema

Add a new numbered file under `migrations/`, run the tests locally, then apply
it to the project. Keep `app.all_permissions()` in sync with
`COACH_PERMISSIONS` and the role templates with `COACH_ROLE_TEMPLATES`.
