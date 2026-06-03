# Agent Workflow

This document records local agent tooling decisions for Club OS.

## Builder / reviewer split

- Codex is the primary builder.
- Claude Code is the read-only challenger by default.
- Do not run parallel edits in the same working tree.
- The current diff should be reviewed before release when the task changes code, product behavior or sensitive docs.

## Local review command

Run:

```bash
npm run check:review
```

This validates:

- `npm run typecheck`
- `npm run build`
- generated `next-env.d.ts` cleanup
- read-only Claude Code review

Empty diffs are valid. Claude should report no findings rather than block.

Platform notes:

- macOS/Linux/Git Bash: `npm run check:review`
- Windows PowerShell: `npm.cmd run check:review`
- If PowerShell aliases or execution policy interfere, use `cmd.exe /c npm run check:review`

## Local pre-push hook

A working tree may install `.git/hooks/pre-push` through:

```bash
npm run hooks:claude-review
```

The hook is local and not committed. If it hangs, run `npm.cmd run check:review` manually and fix the hook before relying on it again.

## ECC bootstrap

ECC was not bulk-installed into this repository.

Decision:

- use the user-level `configure-ecc` bootstrap skill only
- select ECC components deliberately per task
- avoid copying large ECC packs into Club OS by default

Reason:

- large skill packs add context noise
- duplicate hook/runtime behavior makes reviews harder
- Club OS already has project-specific builder/reviewer rules

Good candidates for later selective ECC use:

- focused review helpers
- frontend accessibility checks
- verification/test workflows
- security review support
