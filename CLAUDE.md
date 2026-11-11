# CLAUDE.md — Club OS Challenger Rules

## Role

Claude Code is primarily the challenger and reviewer for this repository.

Default behavior: review the current git diff read-only. Do not edit files unless the user explicitly asks for fixes or implementation.

If the user explicitly asks Claude Code to implement or fix, Claude must follow the same project rules as `AGENTS.md`.

## Review focus

Check whether the diff:

- breaks Club OS product rules
- breaks membership-based role logic
- introduces Supabase, RLS or Auth risks (the database rules in `supabase/pilot/` are the real guard; every new rule needs a test there)
- bypasses the local data layer: touches `localStorage` outside `src/shared/data/repository.ts`, or derives permissions from URL parameters
- builds something twice: demo club and club server must share the same screens and data layer
- ignores mobile or desktop behavior
- removes functionality during UI work
- ~~adds or changes a feature without planning its onboarding (`docs/archive/onboarding-concept.md`, section 7)~~ (ausgesetzt 2026-10-08, Onboarding wird neu aufgesetzt)
- is larger than necessary
- misses required validation (`typecheck`, `check:i18n`, `build`, `test:smoke`, database tests for `supabase/`)
- has a simpler or safer architecture available

## Required reading for reviews

For meaningful product or code reviews, read:

- `docs/simplify-decisions.md` — binding decisions (section 8: one app, two stores, the club pilot); takes precedence over older rules

- `AGENTS.md`
- `README.md` and `DESIGN.md`
- `.agents/skills/club-os/SKILL.md`
- the latest entries of `docs/simplify-progress.md`
- `docs/v1-decisions.md`
- `docs/core-flows.md`
- `docs/agent-workflow.md` for local review hooks, ECC bootstrap decisions and builder/reviewer workflow
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
npm run check:i18n && npm run test:i18n
npm run build
npm run test:smoke   # against `npm run start -- -p 3100`
```

Run `npm run lint` only if it is known to work in the current Next.js setup.

## Output after edit tasks

If Claude Code edits files, report:

- changed files
- what changed
- validation commands run
- risks or open points

## Automated local review

This repo includes a local Claude Code review command:

```bash
npm run review:claude
```

It runs Claude Code non-interactively with the `club-os-reviewer` agent and disallows edit tools. For a full local gate:

```bash
npm run check:review
```

To install the local pre-push hook in this working tree:

```bash
npm run hooks:claude-review
```

The hook is local to `.git/hooks/pre-push` and is intentionally not committed. It runs `npm run check:review` before push.

Note: `next-env.d.ts` is tracked in this repo and `next build` can regenerate it. The local `check:review` gate runs `npm run clean:next-env` before Claude review so generated Next drift does not pollute review findings. If `next-env.d.ts` is intentionally staged, the clean step restores only the worktree from the index and preserves the staged change.

