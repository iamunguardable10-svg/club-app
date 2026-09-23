# Club App / TeamLoad OS

Club App is the foundation for a club operating system for teams, coaches, athletes and club admins.

> **Current state (since 2026-09): local test mode.** The app runs without
> accounts, login, database or environment variables. Open it, pick
> *Trainer* or *Spieler*, and you are in a seeded club. Both perspectives
> share the same data, stored in the browser. See `docs/simplify-decisions.md`
> for why, and `docs/simplify-progress.md` for how it got here. The sections
> below on admins, invites and Supabase describe the target product and the
> previous setup; they are kept as reference.

## Running it

```bash
npm install
npm run dev
```

No `.env` file is needed. Test data is created on first start and can be reset
from the identity switcher ("Testdaten zurücksetzen").

## Product direction

The app is not just an attendance app. It is designed as a structured operating system for clubs:

- Admins create and configure the club.
- Coaches manage teams, sessions, attendance and load.
- Athletes see their calendar, submit availability and report load.
- Club operations manage departments, facilities and responsibilities.

## V1 goal

V1 is a clean product and code foundation with placeholder screens. The priority is architecture, navigation and core flows — not polished analytics or advanced automation.

### V1 core flows

1. Admin creates a club.
2. Admin creates departments and teams.
3. Admin invites coaches through invite links.
4. Coach accepts invite and is assigned to the correct club/team.
5. Coach invites athletes through team invite links.
6. Athlete accepts invite and joins the correct team.
7. Coach plans sessions.
8. Athlete submits availability: expected, late, maybe, no.
9. Coach sees live status and finalizes attendance.
10. Load entries and analytics are built on top of finalized participation.

## Main app areas

Active routes in the local test mode:

```txt
/            - pick a role to test as
/coach       - today, sessions (calendar), team, facilities, history, attendance, load
/athlete     - home, calendar (incl. availability), load
/share/load  - read-only load view an athlete shares with a coach
```

Removed for the local test mode, recoverable from commit `543775f` on `main`:

```txt
/admin, /department   - club and department administration
/invite, /join        - invites and join codes (need accounts)
/auth, /onboarding    - login, signup, club creation
/demo                 - the former second, demo-only app
```

Role-shell rule:

- Coach and department-lead shells are scoped operational surfaces, not alternate admin dashboards.
- Department-lead routes lived under `/department/...` (documented in `docs/role-workspaces-v1.md`); removed for the local test mode.
- Team Workspace keeps its own Home / Calendar / Players / Groups / Staff-Settings navigation after a concrete team is opened.
- Calendars share one Untis-style engine and become smarter through context rather than separate per-role implementations.

## Technical direction

Preferred stack:

- Next.js
- TypeScript
- Tailwind CSS
- Supabase Auth + Postgres + RLS — target backend; not wired up in the local test mode. Schema and migrations stay under `supabase/`.
- Feature-based architecture

## Environment variables

None are needed in the local test mode. The previous setup used
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_GEOAPIFY_API_KEY` (address autocomplete on facility forms); all
three are unused now.

## Facility address input principle

Facility names and facility addresses are intentionally separate:

- The facility name is the internal club or department name, for example `Main Hall` or `U18 Gym`.
- The address field can search by official venue name, school name, hall name or street address.
- Geoapify may fill the address, but it must not automatically overwrite the internal facility name.
- (Superseded: there is only one local mode now, and the address autocomplete was removed with the admin facility forms.)

## Key principle

Every screen must answer a real operational question.

For coaches, the main question is:

> Who is coming today, who is late, who is missing, why, and who needs load attention?

For athletes, the main question is:

> What is next, what do I need to report, and how am I doing?

For admins, the main question is:

> Is the club structure correctly set up and are the right people assigned to the right roles?
