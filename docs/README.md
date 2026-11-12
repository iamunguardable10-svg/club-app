# Documentation

Where to find what. Start with the [README](../README.md) for the overview and
[DESIGN.md](../DESIGN.md) for how the app looks and behaves.

## Decisions (binding)

| File | What it settles |
|---|---|
| [simplify-decisions.md](simplify-decisions.md) | The current phase: one app, two stores (demo club and club server), the pilot. Takes precedence over older documents |
| [v1-decisions.md](v1-decisions.md) | Product decisions of the first version that still hold (memberships, roles, join codes) |
| [architecture-decisions.md](architecture-decisions.md) | Architecture decision records |
| [roles.md](roles.md) | Roles and what each may see and do |
| [core-flows.md](core-flows.md) | The core flows: sessions, availability, attendance, load |
| [i18n.md](i18n.md) | Four languages, how texts and formats work |

## What happened, what is next

| File | Content |
|---|---|
| [simplify-progress.md](simplify-progress.md) | The run log: every change, why, and how it was checked (newest at the end) |
| [plan-beta-speyer.md](plan-beta-speyer.md) | **Now:** what has to happen before the youth teams start (mail, plan, privacy, fixes, explainer video) |
| [plan-next-runs.md](plan-next-runs.md) | Open work, ideas and small to-dos |
| [goal-2026-10-pilot-ready.md](goal-2026-10-pilot-ready.md) | The October goal: ready for the pilot (load explained, tour, onboarding, playbook, marketing) |
| [plan-features-freischaltung.md](plan-features-freischaltung.md) | Unlocking features per club and team |
| [plan-onboarding.md](plan-onboarding.md) | The way in for new clubs, coaches and players |
| [plan-rsvp-polls-news.md](plan-rsvp-polls-news.md) | Answers, polls and club news (done) |
| [concept-trainer-card.md](concept-trainer-card.md) | Concept: a card for coaches (not built yet) |
| [vision.md](vision.md) | The long-term product vision |

## Working on the code

| File | Content |
|---|---|
| [../AGENTS.md](../AGENTS.md) | Rules for building (also for AI agents): steps, checks, what never to do |
| [../CLAUDE.md](../CLAUDE.md) | Rules for reviewing |
| [agent-workflow.md](agent-workflow.md) | Local review hooks and the builder/reviewer workflow |
| [calendar-qa-guardrails.md](calendar-qa-guardrails.md) | What to check when touching the calendar |
| [deployment-notes.md](deployment-notes.md) | Vercel notes |
| [../supabase/pilot/README.md](../supabase/pilot/README.md) | The club server: every migration, the access tests, how to run them |
| [mail-templates/](mail-templates/) | The sign-up, reset and e-mail change mails |

## Reference and history

- [reference/](reference/): design references (Linear).
- [archive/](archive/): the designs and drafts from before the simplification
  (September 2026): admin, department and facility workspaces, the first
  database draft, the old project log. Kept for their reasoning; the code no
  longer follows them where they differ.
