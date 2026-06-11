# Club OS next feature roadmap

This is the working roadmap for larger features after the Weekly Series Planner
V1 branch. It is intentionally ordered by product dependency, not by novelty.

## Product direction

Club OS remains bottom-up:

```txt
Athlete alone
-> Coach with one team
-> Department with multiple teams/facilities
-> Club with multiple departments
```

The next large features should strengthen the surfaces that already carry daily
work: calendar, sessions, athletes, coach operations, department operations,
invites and onboarding.

## Build order

### Goal 1 — Calendar reliability and shared QA

Why first:

The calendar is now the central operating surface. If it feels unreliable, every
future feature built on sessions inherits that weakness.

Scope:

- fix known mobile field sizing regressions
- fix week navigation correctness across Week and Series modes
- verify time conversion and display consistency
- make inline Series editing faster and cleaner on mobile
- add a small repeatable QA checklist or browser test harness for calendar flows

Success criteria:

- coach can create a Series template, confirm a week, and immediately see sessions in Week calendar
- mobile time/duration fields fit without overflow
- previous/next/current week controls are correct
- no accidental draft creation while scrolling
- typecheck/build pass

Recommended `/goal`:

```txt
/goal Stabilize all calendar and Series planner interactions across desktop and mobile, with explicit QA criteria and no feature expansion.
```

### Goal 2 — Demo dataset reset and synchronized demo world

Why next:

You currently need a believable fake club to debug without two real accounts.
Demo data should prove the product, not fight it.

Scope:

- reset demo club into one coherent basketball department
- create realistic teams, players, groups, coaches, facilities and sessions
- add availability responses: expected, late, out with reasons
- add athlete load history and session feedback
- ensure coach-created sessions flow into athlete calendars
- make demo reset intentional and easy

Success criteria:

- Coach Today shows meaningful late/out/load-risk players
- session details link to real demo player load details
- Athlete Calendar shows coach-confirmed sessions
- demo player groups match session participants
- no orphan demo sessions, groups or players

Recommended `/goal`:

```txt
/goal Rebuild the demo world so coach, athlete, team, facility and load flows are synchronized and testable without real accounts.
```

### Goal 3 — Session detail and history V2

Why:

The coach needs a high-signal session record: before session = planning and
availability; after session = attendance, RPE, load and notes.

Scope:

- one shared session detail entry point
- future session detail: attendance intentions, late/out, load risk, expected players
- past session detail: attendance result, RPE distribution, player feedback, notes
- session history filters by team, type, date range, facility
- player links from every detail surface

Success criteria:

- future and past sessions show different detail layouts
- no duplicate context block
- load/attendance metrics are shown only when meaningful
- coach can inspect who came, who was late, who was out and who reported high RPE

Recommended `/goal`:

```txt
/goal Build shared session detail V2 for future and past sessions, reusing one detail system across coach, team and facility calendars.
```

### Goal 4 — Coach planning center

Why:

Once sessions and Series work, coaches need fast planning tools that reduce
clicking, not another form-heavy admin surface.

Scope:

- recurring Series board polish
- proposed text-to-schedule parser, e.g. `Do 19:00 2h whole team`
- bulk confirm next week
- conflict suggestions before/after/between sessions
- coach settings for default session duration and preferred facility behavior

Success criteria:

- coach can create common weekly plans in under one minute
- conflicts produce actionable alternatives
- confirmed sessions are pushed to player calendars only after confirmation
- settings affect new drafts but do not mutate existing sessions unexpectedly

Recommended `/goal`:

```txt
/goal Build the coach planning center for recurring templates, quick text planning, conflict suggestions and coach defaults.
```

### Goal 5 — Invites and membership hardening

Why:

The product becomes real only when staff and athletes can join cleanly with the
right scope.

Scope:

- invite acceptance flow for coach, assistant, department lead
- athlete join codes scoped to athlete memberships only
- revoke/cancel invites
- pending/accepted/revoked status parity in demo and real mode
- role-specific post-join routing

Success criteria:

- no global user-role assumptions
- department lead sees only own department
- coach sees only own teams and relevant facilities
- athlete sees own calendar/load only
- invite statuses stay synchronized across Staff and Team Workspace mini staff

Recommended `/goal`:

```txt
/goal Finish invite acceptance and membership scoping for staff and athletes without leaking admin surfaces.
```

### Goal 6 — Bottom-up onboarding

Why:

The app should not start by assuming a full club admin rollout. The first win
must match the user's actual starting layer.

Scope:

- onboarding entry choices: athlete, coach, department, club
- coach one-team setup path
- department setup path
- club setup remains available but not dominant
- seeded demo walkthroughs for calendar/load/staff flows

Success criteria:

- an athlete can track load alone
- a coach can create/manage one team without club setup
- a department can run teams/facilities without full club adoption
- onboarding does not show irrelevant admin copy

Recommended `/goal`:

```txt
/goal Rebuild onboarding around bottom-up adoption: athlete, coach, department and club paths.
```

### Goal 7 — Notifications and player calendar sync

Why:

Sessions become operational only when affected athletes and staff know what
changed.

Scope:

- notification model for created/rescheduled/cancelled sessions
- athlete acknowledgement / availability updates
- late/out reason visibility for coach
- lightweight notification center
- future push/email integration points

Success criteria:

- new confirmed session appears in athlete calendar
- reschedule updates athlete view
- cancel marks/removes session consistently
- coach can see who responded

Recommended `/goal`:

```txt
/goal Add session notification and athlete response foundations for created, changed and cancelled sessions.
```

### Goal 8 — Department operations V2

Why:

Department leads need a clean middle layer between coach operations and club
admin governance.

Scope:

- department schedule calendar with team multi-filter
- department facilities with request-to-share behavior
- department staff page filtered to the department
- department settings
- department lead editing rights across own teams

Success criteria:

- department lead cannot access other departments
- department schedule shows overlapping team sessions cleanly
- shared facility changes route through request/approval when a club layer exists
- department-only mode remains viable when no club admin layer is active

Recommended `/goal`:

```txt
/goal Build Department Operations V2 with scoped schedule, staff, facilities and settings.
```

## Current known bug batch before bigger features

Treat this as Goal 1, not as cleanup. The canonical bug/process list is the
2026-06-10 entry in `docs/project-log.md`; do not maintain a second copy here.
