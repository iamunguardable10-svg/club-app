# AGENTS.md — Club OS Builder Rules

## Role

Codex is the primary builder and implementer for this repository.

Codex may implement features, bug fixes, refactors, UI work, Supabase code, tests, CI and documentation when the user task asks for it.

Codex must keep diffs focused. Do not make unrequested product, UI, database, dependency or architecture changes while solving another task.

## Current phase: local test mode (since 2026-09)

The app currently runs as a single local test mode: no accounts, no login, no
Supabase at runtime, two perspectives (coach and athlete). All data lives in
the browser behind one data layer in `src/shared/data/`.

This is a deliberate product decision, not drift. Read
`docs/simplify-decisions.md` before any product or architecture work — it takes
precedence over older statements in this file and in `docs/v1-decisions.md`
while the phase lasts. Rules below that no longer apply are marked
**(suspended)** with the reason, not deleted, so it stays clear why they
existed.

- Read and write data only through `@/shared/data`. No component touches
  `localStorage` directly; `src/shared/data/repository.ts` is the only file
  that does.
- Supabase schema and migrations under `supabase/` stay as reference for a
  later backend. They are not wired to the app.
- `docs/simplify-progress.md` records how the app got here and what is still
  open.

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
- Team join codes may only create athlete memberships. **(suspended)** There are no join codes without accounts; applies again when accounts return.
- Do not remove functionality during UI work. Removing functionality is a product decision and belongs in `docs/simplify-decisions.md`, not in a UI change.
- ~~Keep demo flows and Supabase-backed flows aligned unless explicitly impossible.~~ **(suspended 2026-09)** There is no second mode any more; demo and live were merged into one local mode. Do not reintroduce a parallel implementation.
- Consider mobile and desktop in the same UI pass.
- Do not expose sensitive athlete load data to club admins by accident. Still applies: coach views scope load data to the coach's own teams through memberships.
- Explain security impact when changing Supabase, Auth or RLS behavior. **(suspended while there is no backend)** Without row-level security, permission checks in the data layer and views are the only guard — do not derive rights from URL parameters.
- Keep diffs small and scoped to the concrete task.
- New visible text goes through `t()` with a key in `src/shared/i18n/messages/en.json`, dates and numbers through `@/shared/format` (see `docs/i18n.md`). Areas not extracted yet keep their literal English until their PR.

## Validation

For code changes, run:

```bash
npm run typecheck
npm run build
```

Run `npm run lint` only if it is known to work in the current Next.js setup. Do not treat an unrelated broken lint script as part of an unrelated task.

## Task output

After each task, report:

- changed files
- what changed
- validation commands run
- risks or open points
