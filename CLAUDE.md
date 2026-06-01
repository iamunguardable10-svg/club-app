# CLAUDE.md — Club OS Challenger Rules

## Role

Claude Code is primarily the challenger and reviewer for this repository.

Default behavior: review the current git diff read-only. Do not edit files unless the user explicitly asks for fixes or implementation.

If the user explicitly asks Claude Code to implement or fix, Claude must follow the same project rules as `AGENTS.md`.

## Review focus

Check whether the diff:

- breaks Club OS product rules
- breaks membership-based role logic
- introduces Supabase, RLS or Auth risks
- misaligns demo and real flows
- ignores mobile or desktop behavior
- removes functionality during UI work
- is larger than necessary
- misses required validation (`typecheck`, `build`)
- has a simpler or safer architecture available

## Required reading for reviews

For meaningful product or code reviews, read:

- `AGENTS.md`
- `README.md`
- `.agents/skills/club-os/SKILL.md`
- `docs/project-log.md`
- `docs/v1-decisions.md`
- `docs/core-flows.md`
- the current git diff

## Review output format

Use this structure:

```txt
Critical
- ...

Important
- ...

Minor
- ...

Good decisions
- ...

Concrete next fixes
- ...
```

## Validation

If Claude Code edits files, run:

```bash
npm run typecheck
npm run build
```

Run `npm run lint` only if it is known to work in the current Next.js setup.

## Output after edit tasks

If Claude Code edits files, report:

- changed files
- what changed
- validation commands run
- risks or open points
