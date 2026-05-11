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
- admin facility calendar placeholder
- local browser-only demo setup flow
- local browser-only demo admin setup dashboard
- local browser-only demo facility assignment flow
- local demo facility calendar placeholder

Still placeholder / not fully implemented:

- real department management UI
- real team management UI
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

1. Make Department Teams functional:
   - show teams under a department
   - create teams inside a department
   - set default facility per team later

2. Implement department-managed training locations:
   - department_lead creates department-specific locations
   - coaches can use them in sessions
   - admin can optionally inspect them through filters

3. Implement coach invite flow:
   - preview invite by token
   - accept invite
   - redirect coach to coach workspace

4. Implement athlete team join code flow:
   - preview team by code
   - join team by code
   - redirect athlete to athlete workspace

5. Implement session creation foundation:
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
