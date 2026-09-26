# AGENTS.md — Club OS Builder Rules

## Role

Codex is the primary builder and implementer for this repository.

Codex may implement features, bug fixes, refactors, UI work, Supabase code, tests, CI and documentation when the user task asks for it.

Codex must keep diffs focused. Do not make unrequested product, UI, database, dependency or architecture changes while solving another task.

## Current state (2026-09-26): one app, two stores

The app has **two stores behind one data layer** (`src/shared/data/`):

- **Demo club (local mode):** no account, everything in the browser. Started from
  the start page or directly with `/?demo=athlete|coach|club`. Used for
  development, tests and trying things out.
- **Club server (pilot):** Supabase with sign-in, row-level security and
  database functions. Schema, rules and tests live in `supabase/pilot/`
  (migrations `0001`–`00NN`, tests in `supabase/pilot/tests/`), Edge Functions in
  `supabase/functions/`. This is the **live project** real players use.

One interface, two interchangeable stores — never a second app or a parallel
implementation. `docs/simplify-decisions.md` (section 8) explains why;
`docs/simplify-progress.md` records every run; `docs/plan-next-runs.md` lists
what is open.

- Read and write data only through `@/shared/data`. No component touches
  `localStorage` directly; `src/shared/data/repository.ts` is the only file that
  does.
- Rights come from `coachPermissions` / `hasCoachPermission` in the app and are
  enforced again by the database on the server. Never derive rights from URL
  parameters.
- All visible text goes through `t()` (see `docs/i18n.md`); the app ships in
  English, German, French and Spanish.

## Working on a piece (for any model)

Follow these steps in order. Each piece is one branch and one pull request.

1. **Read** this file, the piece's plan (in `docs/plan-next-runs.md` or the task),
   and every file you will change, fully. Also `docs/i18n.md` when you add text.
2. **Change only what the piece needs.** No drive-by refactors, no renames, no new
   dependencies, no formatting of untouched code.
3. **Text:** new visible text gets a key in
   `src/shared/i18n/messages/en.json` **and** the same key in `de.json`, `fr.json`
   and `es.json` (informal address: du / tu / tú). Dates and numbers through
   `@/shared/format`. Never format a date while the server pre-renders a page
   (wait for `ready` from `useLocalDatabase`), or React throws a hydration error
   from the next day on.
4. **Database (only if the piece says so):** a new file
   `supabase/pilot/migrations/00NN_pilot_<name>.sql` (next free number); never
   edit an existing migration. A changed function is copied in full from its
   latest version and changed there. Add tests to `supabase/pilot/tests/`. A new
   `raise exception '…'` text also gets a line in
   `src/shared/data/serverMessages.ts` and the same text in `en.json`.
5. **Run the checks** (all must pass):

   ```bash
   npm run typecheck
   npm run check:i18n && npm run test:i18n
   npm run build
   npm run start -- -p 3100 &   # then, in a second shell:
   npm run test:smoke           # every page, all roles, no errors
   ```

   Also `npm run test:load` / `test:series` / `test:calendar` when touching load,
   series or calendar files, and the database tests when touching
   `supabase/`: a local Postgres 15+ and
   `PGHOST=… PGPORT=… PGUSER=postgres supabase/pilot/tests/run-local.sh`, then
   `npm run test:pilot` (see `supabase/pilot/README.md`).
6. **Document:** a short entry at the end of `docs/simplify-progress.md` (what,
   why, how checked); mark the piece done in `docs/plan-next-runs.md`.
7. **Pull request** with what changed and which checks ran. CI must be green.

**Never, without the owner's explicit OK:**

- apply a migration to or deploy a function on the live Supabase project,
  change auth settings, mail templates or secrets;
- delete or weaken a test, or skip a failing check;
- remove existing functionality, or change what a role may see;
- put secrets, keys or personal data into the repository;
- run anything against the live database for testing (use the local Postgres).

## Required reading

For small fixes:

- `AGENTS.md`
- the directly relevant file(s)

For feature, auth, role, Supabase, invite, facility, calendar or load work, also read:

- `docs/simplify-decisions.md` (current phase, takes precedence)
- `README.md`
- `.agents/skills/club-os/SKILL.md`
- `docs/project-log.md`
- `docs/v1-decisions.md`
- `docs/core-flows.md`
- `docs/calendar-qa-guardrails.md` when changing calendar, session edit/detail, Series planner or mobile scheduling behavior
- `docs/agent-workflow.md` when changing agent tooling, hooks, review workflow or ECC setup

## Hard product rules

- Roles come from memberships, not from one global user role.
- The hierarchy is `Club -> Department -> Team`.
- Team join codes may only create athlete memberships.
- Do not remove functionality during UI work. Removing functionality is a product decision and belongs in `docs/simplify-decisions.md`, not in a UI change.
- Demo club and club server run through the same screens and the same data layer. Never build a separate flow for one of them.
- Consider mobile and desktop in the same UI pass.
- Do not expose sensitive athlete load data to club admins by accident. Still applies: coach views scope load data to the coach's own teams through memberships.
- Explain security impact when changing Supabase, Auth or RLS behavior. The database rules (`supabase/pilot/`) are the real guard on the server; the app's checks shape the interface.
- Keep diffs small and scoped to the concrete task.
- New visible text goes through `t()` with keys in all four language files, dates and numbers through `@/shared/format` (see `docs/i18n.md`).

## Validation

See step 5 above. At minimum for any code change: `npm run typecheck`,
`npm run check:i18n && npm run test:i18n`, `npm run build`, `npm run test:smoke`.
Run `npm run lint` only if it is known to work in the current Next.js setup.

## Task output

After each task, report:

- changed files
- what changed
- validation commands run
- risks or open points
