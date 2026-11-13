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

## Club OS domain (2026-11-13)

The production address is `https://clubos.hebinova.de` on the existing Vercel
project `club-app`. IONOS remains the DNS provider. Only the `clubos` CNAME
points to Vercel; the apex website and IONOS MX/SPF records stay in place.

`metadataBase` uses this address for absolute social preview images. The landing
page has this canonical URL. The two previous public Vercel aliases redirect
with HTTP 308, preserving paths and query parameters; branch/deployment preview
URLs and localhost are unaffected. Invitations, shared links and auth return
URLs use `window.location.origin`, so new links use the new host automatically.

Supabase Auth uses the new address as Site URL, with
`https://clubos.hebinova.de/**` in its redirect allow list. Keep existing entries
during the transition. Auth emails use the verified Brevo sender
`Club OS <clubos@hebinova.de>` through custom SMTP. Keep SMTP credentials only in
the provider settings, never in this repository.

An origin change cannot transfer browser sessions, cached demo data, installed
PWAs or push permissions. Server-backed club data stays in the same Supabase
project. Users sign in on the new domain and can install the app and enable
notifications there again; do not clear storage on the previous domain.
