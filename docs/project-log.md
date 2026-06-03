# Project Log

This document summarizes the current state of the Club App / TeamLoad OS project. It is the central changelog and decision log for product, architecture, database and implementation progress.

---

## Product vision

Club App / TeamLoad OS is a club operating system for:

- club admins
- department leads
- coaches
- athletes

The product should support club structure, departments, teams, coaches, athletes, sessions, availability, attendance, load tracking, facilities, department operations and invite/join flows.

The system must not become a generic overloaded dashboard. Each role should see exactly the information needed for its operational job.

---

## Core workspace model

```txt
Admin Workspace       → club setup, departments, facilities, high-level role management
Department Workspace  → department operations, teams, schedule, coaches, facility usage
Coach Workspace       → assigned teams, today, attendance, load, sessions
Athlete Workspace     → own sessions, own availability, own load
```

Confirmed V1 roles:

```txt
club_admin
department_lead
head_coach
assistant_coach
athlete
```

Important role principle:

```txt
Do not store one global user role.
Roles come from memberships.
```

Confirmed hierarchy:

```txt
club
└── department
    └── team
```

Teams are always subordinate to departments. Users can have multiple memberships.

---

## Invite and onboarding model

The project uses two onboarding concepts:

### Personal invites

Used for responsibility roles:

- department_lead
- head_coach
- assistant_coach

### Reusable team join codes

Used for athletes.

Example:

```txt
/join/U18ABC
```

A reusable team code can only create athlete memberships. It must not grant coach/admin rights.

---

## Facility model

Facilities are created globally at club level, then assigned to departments.

```txt
club facilities
→ assigned to departments
→ used by teams/coaches inside that department
→ optional default facility per team
```

Key decisions:

- club_admin creates global facilities
- one facility can be assigned to multiple departments
- department_lead can later manage facilities for their department
- coach should primarily see department-scoped facilities
- team can later have a default facility
- facilities should link to a facility calendar view

Facility visibility recommendation:

```txt
Club Facility
→ created/managed by club_admin
→ can be assigned to multiple departments
→ visible in Admin Facilities by default

Department Facility / Department Training Location
→ created later by department_lead
→ primarily belongs to one department
→ examples: park, outdoor court, department-specific training spot, external gym, meeting room
→ immediately understandable for coaches/athletes in that department
→ should not clutter Admin Setup by default
→ should still remain optionally visible to club_admin for governance, conflicts and cleanup
```

The reason for department-internal training locations is not only permissions. It also solves communication: if Basketball creates `Westpark Court` or `Outdoor Conditioning Park`, every coach and athlete in Basketball knows exactly what is meant when that location appears in a session.

The app should not completely hide department-managed facilities from club admins. Instead, future UI should use filters such as `Show department-managed facilities`.

This prevents coaches from seeing every facility in the whole club while still preserving club-level governance.

---

## Load model

V1 starts simple:

```txt
session_load = RPE × duration_minutes
```

Load is a future USP and should be expanded later.

Privacy decision:

- athlete sees own load
- teammates do not see each other's load
- coaches see load for assigned teams
- club_admin does not automatically see individual load data

---

## Database migrations

### 0001_initial_schema.sql

Created core tables:

- profiles
- clubs
- departments
- teams
- club_memberships
- team_memberships
- invites
- facilities
- sessions
- session_participants
- availability
- attendance_records
- load_entries
- facility_bookings
- activity_events

Also enabled RLS on all core tables.

### 0002_rls_policies.sql

Added V1 RLS policies and helper functions.

Key access decisions:

- access is membership-based
- coaches and athletes do not browse unrelated departments by default
- athletes only write their own availability and load
- coaches finalize attendance but do not edit athlete availability
- club_admin manages structure but does not automatically get individual load access

### 0003_invite_and_join_code_functions.sql

Added:

- team_join_codes table
- get_invite_by_token(token)
- accept_invite(token)
- get_team_by_join_code(code)
- join_team_by_code(code)
- create_team_join_code(team_id, code, expires_at, max_uses)

### 0004_profile_creation_trigger.sql

Added automatic profile creation after Supabase Auth signup.

```txt
auth.users insert
→ public.profiles insert/update
```

### 0005_facility_scoping.sql

Added:

- department_facilities table
- teams.default_facility_id
- is_department_facility(department_id, facility_id)

Purpose:

- scope global club facilities to departments
- allow one facility to be assigned to multiple departments
- allow default facility per team
- reduce coach session-creation friction

### 0006_create_initial_club_setup.sql

Added guided admin setup RPC:

```txt
create_initial_club_setup(...)
```

This function atomically:

1. Creates a club
2. Creates the current user as club_admin
3. Creates multiple departments
4. Creates multiple global facilities
5. Optionally creates teams in one selected department

Important product decision:

Teams are optional during initial setup. They can be created by the club admin, but in larger clubs this can be delegated to department leads later.

---

## Supabase status

Supabase project:

```txt
Project name: Club-app
Project ref: nskyvjycxxdhyvtkjbwb
Status: ACTIVE_HEALTHY
```

Applied migrations:

```txt
0001_initial_schema
0002_rls_policies
0003_invite_and_join_code_functions
0004_profile_creation_trigger
0005_facility_scoping
0006_create_initial_club_setup
```

---

## Vercel status

Vercel project:

```txt
club-app
```

Vercel is connected to GitHub and deploys automatically from `main`.

Environment variables configured:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Current app routes

### Public / auth

```txt
/
/auth/login
/auth/signup
/app
/onboarding
/onboarding/create-club
/invite/[token]
/join/[code]
```

### Local demo mode

```txt
/demo
/demo/create-club
/demo/admin/setup
/demo/admin/facilities
/demo/admin/facilities/[facilityName]/calendar
```

Local demo routes are browser-only and store data in `localStorage`. They do not write to Supabase and do not require login.

### Admin

```txt
/admin/setup
/admin/departments
/admin/teams
/admin/coaches
/admin/facilities
/admin/facilities/[facilityId]/calendar
```

### Department

```txt
/department/overview
/department/teams
/department/schedule
/department/coaches
/department/facilities
```

### Coach

```txt
/coach/today
/coach/team
/coach/sessions
/coach/attendance
/coach/load
```

### Athlete

```txt
/athlete/home
/athlete/calendar
/athlete/availability
/athlete/load
```

---

## Implemented frontend foundation

Project stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase client
- Vercel deployment

Added shared UI:

- Card
- PlaceholderPage

Added auth features:

- LoginForm
- SignupForm
- WorkspaceRouter

Auth flow:

```txt
login/signup
→ /app
→ check Supabase user
→ check memberships
→ route to correct workspace
```

Workspace routing priority:

```txt
club_admin       → /admin/setup
department_lead  → /department/overview
head/assistant   → /coach/today
athlete          → /athlete/home
no membership    → /onboarding
```

---

## Implemented product flows

### Real authenticated admin setup

Route:

```txt
/onboarding/create-club
```

Purpose:

- authenticated user creates first club setup
- multiple departments can be created
- multiple global facilities can be created
- teams can optionally be created for one selected department
- user becomes club_admin
- redirects to `/admin/setup`

Storage:

```txt
Supabase
```

### Admin setup dashboard

Route:

```txt
/admin/setup
```

Purpose:

- show the created club
- show setup progress
- show department count/list
- show global facility count/list
- guide the admin toward next operational steps

Important UI decisions:

- Do not show a team list on `/admin/setup`.
- Teams should live inside department/team subpages, not on the global admin setup overview.
- The facility summary card and the global facilities panel include direct `Manage →` links to `/admin/facilities`.
- Facilities listed on the dashboard link directly to their future calendar placeholder.
- Dashboard facility cards show compact department usage chips: first two departments plus `+X more` if needed.
- The large `Calendar →` label was removed from facility cards. The entire card is clickable, with a small `Tap to open calendar` hint to reduce visual clutter on mobile.

### Admin facilities manager

Route:

```txt
/admin/facilities
```

Purpose:

- load the admin's club context
- show global facilities
- create a new global facility
- assign one facility to one or multiple departments via checkboxes
- show department-facility assignments
- remove a facility assignment
- link each facility to a future facility calendar placeholder

Storage:

```txt
Supabase
```

Recent UX decisions:

- Removed separate Departments and Assignments KPI cards from the facility page because they are not useful enough on this screen.
- Added a clear back link at the top of the page.
- Changed the assignment UI from `one department + one facility` to `one facility + multiple departments`.
- Facility cards and assigned facility rows now link to calendar placeholders.

Product effect:

This is the first real implementation of the facility-scoping model. It prepares the later coach session-creation flow where coaches should only see relevant department facilities.

### Admin facility calendar placeholder

Route:

```txt
/admin/facilities/[facilityId]/calendar
```

Purpose:

- placeholder for future facility bookings
- future weekly/monthly facility usage
- future conflicts and double-booking view

### Local browser-only demo setup

Routes:

```txt
/demo/create-club
/demo/admin/setup
```

Purpose:

- allow product testing without login
- allow entering demo club/departments/facilities/teams
- store data only in browser localStorage
- avoid writing test data into Supabase

Storage:

```txt
localStorage only
```

Recent demo routing fix:

- Demo setup facility links now point to `/demo/admin/facilities`, not `/admin/facilities`.
- This prevents the local demo flow from requiring login when the user wants to test facility assignment.
- Facilities listed on the demo dashboard link directly to their local calendar placeholder.
- Demo dashboard facility cards show compact department usage chips: first two departments plus `+X more` if needed.
- The large `Calendar →` label was removed from facility cards. The entire card is clickable, with a small `Tap to open calendar` hint to reduce visual clutter on mobile.

### Local browser-only demo facility assignment

Route:

```txt
/demo/admin/facilities
```

Purpose:

- test facility creation and department assignment without login
- store assignments only in browser localStorage
- preview the future coach filtering logic without database writes
- link local facilities to local calendar placeholders

Storage:

```txt
localStorage only
```

Recent UX decisions:

- Removed separate Departments and Assignments KPI cards from the demo facility page.
- Added a clear back link at the top of the demo facility page.
- Changed assignment UI to allow assigning one facility to multiple departments at once.
- Facility cards and assigned facility rows now link to local calendar placeholders.

### Local demo facility calendar placeholder

Route:

```txt
/demo/admin/facilities/[facilityName]/calendar
```

Purpose:

- browser-only preview of the future facility calendar screen
- no Supabase writes

Important distinction:

```txt
/onboarding/create-club → real authenticated Supabase write
/admin/facilities      → real authenticated Supabase write
/demo/create-club      → local browser-only demo write
/demo/admin/facilities → local browser-only demo write
```

### Department team workspace

Routes:

```txt
/admin/departments/[departmentId]
/demo/admin/departments/[departmentName]
```

Purpose:

- make the team list the central department surface
- show head coach, assistant coaches, athlete count and default facility per team
- let admins or department leads invite a missing head coach directly from the team row
- let admins or department leads set a missing default facility directly from the team row
- keep `Add team` as a secondary setup action because teams are not created frequently
- show attention messages only when something is actually missing or problematic

Storage:

```txt
Real route → Supabase
Demo route → localStorage
```

Technical note:

- A profile RLS update was added so club admins and department leads can read profile names for people in the teams/departments they manage.
- Team season is not shown in the V1 department team list. It remains in the schema for a later active season model.

---

## Current implementation status

Working / prepared:

- repository structure
- Vercel deployment
- Supabase project
- database schema
- RLS draft policies
- invite/team-code RPC functions
- auth forms
- profile creation trigger
- workspace routing
- placeholder pages for Admin, Department, Coach and Athlete
- real authenticated club setup flow
- real admin setup dashboard
- real admin facilities manager
- real department team workspace
- admin facility calendar placeholder
- local browser-only demo setup flow
- local browser-only demo admin setup dashboard
- local browser-only demo facility assignment flow
- local browser-only demo department team workspace
- local demo facility calendar placeholder

Still placeholder / not fully implemented:

- team detail pages
- real coach invite UI
- real athlete join-code UI
- real session creation UI
- real availability flow
- real attendance finalization
- real load entry flow
- real protected layouts/server-side auth enforcement
- real facility calendar data and booking logic
- department-managed training locations

---

## Next recommended steps

1. Implement invite acceptance:
   - preview invite by token
   - accept invite
   - redirect coach to coach workspace

2. Implement department-managed training locations:
   - department_lead creates department-specific locations
   - coaches can use them in sessions
   - admin can optionally inspect them through filters

3. Extend team operations:
   - team detail pages
   - assistant coach shortcut actions
   - athlete count drill-in

4. Add a central attention page:
   - aggregate missing setup and operational issues across admin, department and coach workspaces
   - keep routine reminders out of warning surfaces

5. Implement athlete team join code flow:
   - preview team by code
   - join team by code
   - redirect athlete to athlete workspace

6. Implement session creation foundation:
   - team selection
   - default facility
   - department-scoped facility list
   - department-managed training locations
   - session participants

---

## Important product principles

1. Keep V1 small but architecturally expandable.
2. Avoid overloaded dashboards.
3. Each role should see only operationally relevant information.
4. Load is strategically important but should start simple.
5. Facilities should be scoped to departments to reduce coach friction.
6. One facility can belong to multiple departments.
7. Dashboard links should act as navigation into the relevant operational object, not only display static summary data.
8. Department-managed training locations solve local communication, not just access control.
9. Club-admin governance should remain possible even for future department-managed facilities.
10. Coaches finalize attendance; athletes submit availability.
11. Athletes do not see teammate load data.
12. Club admins manage structure, not necessarily individual performance data.
13. Departments are the operational layer between club and teams.
14. Teams should not clutter `/admin/setup`; team detail belongs in department/team screens.
15. The product should become a real club/team operating system, not a generic AI demo app.
16. Local demo mode must remain easy to remove before production launch.

---

## 2026-06-03 — Recent implementation documentation catch-up

This update records recent work that had landed in code before it was fully captured in docs.

Scope note:

- `Current behavior / direction` below documents the current code path where implemented and the intended direction where a slice is still being refined.
- `Implementation rule` describes product/engineering constraints that future changes must preserve; when a rule is not yet enforced by code, it should be treated as an explicit implementation requirement.

### Coach OS

Current behavior / direction:

- [implemented] Coach navigation now uses a collapsible role drawer instead of wide top navigation.
- [implemented] The drawer is available in role-level Coach OS pages and in coach-context Team Workspace / Facility Calendar surfaces.
- [implemented] Coach Today is scoped to same-day operating decisions and no longer repeats team launcher cards.
- [implemented] Coach Teams remains the launcher surface into Team Workspace.
- [implemented] Coach Calendar is a role-level calendar across assigned teams.
- [implemented] Coach Facilities opens hall calendars with coach context preserved.
- [implemented] Coach History is a first historical-review surface for completed sessions, attendance and load feedback quality.

### Calendar/session model

Implementation rule:

- [requirement] Calendars should stay on the shared Untis-style calendar engine.
- [requirement] View mode is safe/inspection-first.
- [requirement] Edit mode enables moving, resizing, deleting and draft creation for sessions the user can manage.
- [requirement] New session flow is draft-first: slot tap creates the draft in the calendar; the edit sheet opens only after the draft is deliberately confirmed or selected.
- [requirement] Session type is part of the edit sheet and defaults to `Team training`.
- [requirement] Team and facility selection can be shown side by side when both are required.
- [requirement] Participant groups are changed only inside the edit session flow, not in the read-only detail sheet.

### Facility context

Current behavior / direction:

- [implemented] Facility calendars preserve the entry role: admin, department lead, coach or team.
- [implemented] Coach facility links pass all relevant coach teams/departments, not just one selected team.
- [implemented] Facility calendars highlight all coach teams in context and lightly highlight the related department context.
- [implemented] Coach-created facility-calendar session writes now verify manageable team and department-facility context through Supabase RLS. URL query context is display/default context only.

Security note:

- `can_write_session_context(...)` checks the authenticated user against club admin, department lead or team staff membership, validates the session's team/department/club relationship, and rejects facility writes when the facility is not assigned to that department.
- Facility assignment is now required before club admins, department leads or coaches create sessions in a facility calendar. The UI surfaces this as a neutral notice instead of silently hiding all create paths.
- Deleting a session remains owner-team permission based through `can_manage_session(id)`, so authorised staff can remove stale sessions even if facility assignments later change.

### Athlete/load

Current behavior / direction:

- [implemented] Athlete OS has a pinned navigation surface for Today, Calendar and Load.
- [implemented] Athlete Calendar uses the same 08:00-23:00 calendar philosophy, with mobile-specific compact sizing and no inner scroll when the whole operating window fits.
- [implemented] Athlete Load uses EWMA as the active ACWR method, keeps acute/chronic support lines optional, and focuses player-facing copy on room to overload/underload rather than raw metric clutter.
- [implemented] Trainer link is active after copy and gives inline feedback.

### Review workflow

Current behavior / direction:

- [implemented] The repo has a local pre-push hook that runs `npm run check:review`.
- [implemented] `check:review` validates typecheck/build, restores generated `next-env.d.ts` drift, then runs Claude Code read-only review.
- [requirement] If the Claude hook hangs, the hook should be fixed or the exception should be recorded in the task context before any release proceeds.
- [implemented] ECC was not bulk-installed into the repo. Only the user-level `configure-ecc` bootstrap skill was installed so future ECC components can be selected deliberately. Details live in `docs/agent-workflow.md`.
