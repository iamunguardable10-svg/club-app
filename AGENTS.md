# AGENTS.md — Club OS Builder Rules

## Role

Codex is the primary builder and implementer for this repository.

Codex may implement features, bug fixes, refactors, UI work, Supabase code, tests, CI and documentation when the user task asks for it.

Codex must keep diffs focused. Do not make unrequested product, UI, database, dependency or architecture changes while solving another task.

## Required reading

For small fixes:

- `AGENTS.md`
- the directly relevant file(s)

For feature, auth, role, Supabase, invite, facility, calendar or load work, also read:

- `README.md`
- `.agents/skills/club-os/SKILL.md`
- `docs/project-log.md`
- `docs/v1-decisions.md`
- `docs/core-flows.md`

## Hard product rules

- Roles come from memberships, not from one global user role.
- The hierarchy is `Club -> Department -> Team`.
- Team join codes may only create athlete memberships.
- Do not remove functionality during UI work.
- Keep demo flows and Supabase-backed flows aligned unless explicitly impossible.
- Consider mobile and desktop in the same UI pass.
- Do not expose sensitive athlete load data to club admins by accident.
- Explain security impact when changing Supabase, Auth or RLS behavior.
- Keep diffs small and scoped to the concrete task.

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
