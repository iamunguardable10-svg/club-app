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
- department_lead can later manage facilities for their department
- coach should primarily see department-scoped facilities
- team can later have a default facility

This prevents coaches from seeing every facility in the whole club while creating sessions.

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
```

Local demo routes are browser-only and store data in `localStorage`. They do not write to Supabase and do not require login.

### Admin

```txt
/admin/setup
/admin/departments
/admin/teams
/admin/coaches
/admin/facilities
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
- The facility summary card and the global facilities panel now include direct `Manage →` links to `/admin/facilities`, so admins do not have to find facility management only through the recommended next steps.

### Admin facilities manager

Route:

```txt
/admin/facilities
```

Purpose:

- load the admin's club context
- show global facilities
- show departments
- show department-facility assignments
- create a new global facility
- assign a facility to a department
- remove a facility assignment

Storage:

```txt
Supabase
```

Product effect:

This is the first real implementation of the facility-scoping model. It prepares the later coach session-creation flow where coaches should only see relevant department facilities.

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

### Local browser-only demo facility assignment

Route:

```txt
/demo/admin/facilities
```

Purpose:

- test facility creation and department assignment without login
- store assignments only in browser localStorage
- preview the future coach filtering logic without database writes

Storage:

```txt
localStorage only
```

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
- local browser-only demo setup flow
- local browser-only demo admin setup dashboard
- local browser-only demo facility assignment flow

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

---

## Next recommended steps

1. Make Department Teams functional:
   - show teams under a department
   - create teams inside a department
   - set default facility per team later

2. Implement coach invite flow:
   - preview invite by token
   - accept invite
   - redirect coach to coach workspace

3. Implement athlete team join code flow:
   - preview team by code
   - join team by code
   - redirect athlete to athlete workspace

4. Implement session creation foundation:
   - team selection
   - default facility
   - department-scoped facility list
   - session participants

---

## Important product principles

1. Keep V1 small but architecturally expandable.
2. Avoid overloaded dashboards.
3. Each role should see only operationally relevant information.
4. Load is strategically important but should start simple.
5. Facilities should be scoped to departments to reduce coach friction.
6. Coaches finalize attendance; athletes submit availability.
7. Athletes do not see teammate load data.
8. Club admins manage structure, not necessarily individual performance data.
9. Departments are the operational layer between club and teams.
10. Teams should not clutter `/admin/setup`; team detail belongs in department/team screens.
11. The product should become a real club/team operating system, not a generic AI demo app.
12. Local demo mode must remain easy to remove before production launch.
