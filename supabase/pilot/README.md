# Pilot database

The Supabase schema for the club pilot (docs/simplify-decisions.md, point 8).
Derived from the local data model in `src/shared/data/schema.ts`; the older
schema in `supabase/migrations` is the pre-pilot one and only a reference.

Project: `CLUB_ProjectV2` (`tszxeainmwowmixqmphn`, eu-west-3). All three
migrations below are applied there (2026-09-24).

| File | What it does |
|---|---|
| `migrations/0001_pilot_schema.sql` | Tables, and the rules that hold no matter who writes: a hall must be bookable for the team's department, Head Coach role locked, a team always keeps a staff manager, the four role templates per new team, dependent rights completed |
| `migrations/0002_pilot_rls.sql` | Row-level security: who may read and change what, following the coach rights of Run 7 and 8 |
| `migrations/0003_pilot_indexes_and_write_policies.sql` | Foreign-key indexes and one policy per write command (Supabase performance advisor); no rule changes |
| `tests/00_supabase_shim.sql` | Stand-in for Supabase's `auth` schema and roles, **local tests only** |
| `tests/01_rls_test.sql` | 75 checks, each acting as one person (Head Coach, Betreuer, athlete, outsider) |

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

Needs a plain Postgres 15 or newer. From this folder:

```bash
createdb pilot_test
psql -d pilot_test -v ON_ERROR_STOP=1 -f tests/00_supabase_shim.sql
for f in migrations/*.sql; do psql -d pilot_test -v ON_ERROR_STOP=1 -f "$f"; done
psql -d pilot_test -f tests/01_rls_test.sql
```

Every check prints `ok …`; the run ends with `all access-rule checks passed`
or stops at the first `FAIL`. Never run the shim or the tests against the
Supabase project.

## Changing the schema

Add a new numbered file under `migrations/`, run the tests locally, then apply
it to the project. Keep `app.all_permissions()` in sync with
`COACH_PERMISSIONS` and the role templates with `COACH_ROLE_TEMPLATES`.
