# Deployment Notes

## Vercel Git clone errors

If Vercel reports an error like:

```txt
There was a permanent problem cloning the repo.
The git provider returned an HTTP 500 error.
```

this is usually not an application code problem. It means Vercel could not clone the GitHub repository due to a temporary upstream Git provider issue.

Recommended action:

1. Check the Vercel deployment logs.
2. Confirm that the error occurs during repository cloning, before install/build.
3. Retry the deployment by pushing a new commit or manually redeploying from Vercel.

This note was added after a transient clone failure while deploying the local demo redirect and facility UI updates.

## Local Claude Code review hook

The repo can use a local pre-push hook in the working tree. The authoritative agent/review workflow lives in `docs/agent-workflow.md`.

```txt
.git/hooks/pre-push
```

It runs:

```bash
npm run check:review
```

Operational note:

- If the Claude review hook hangs during a push, validate manually with `npm run check:review`.
- Windows-specific command variants are documented in `docs/agent-workflow.md`.
- Do not treat `--no-verify` as a normal release path. If the hook itself is broken, fix the hook or record the exception in the task context before pushing.
