# Project Log

This document summarizes the current state of the Club App / TeamLoad OS project.

It is a high-level changelog and decision log for product, architecture, database and implementation progress.

---

## Current product vision

Club App / TeamLoad OS is a club operating system for:

- club admins
- department leads
- coaches
- athletes

The product should support:

- club structure
- departments
- teams
- coaches
- athletes
- sessions
- availability
- attendance
- load tracking
- facilities
- department operations
- invite and join flows

The system should not be a generic overloaded dashboard. It should give each role exactly the information needed for its operational job.

---

## Core workspace model

The app is separated into four major workspaces:

```txt
Admin Workspace
Department Workspace
Coach Workspace
Athlete Workspace
```

### Admin Workspace

Purpose:

- club setup
- global club structure
- departments
- facilities
- high-level role management

Primary user:

- club_admin

### Department Workspace

Purpose:

- department-level operations
- teams in the department
- department schedule
- department coaches
- department facility usage

Primary users:

- club_admin
- department_lead

### Coach Workspace

Purpose:

- own assigned teams
- today's session decisions
- availability
- attendance
- load overview
- team sessions

Primary users:

- head_coach
- assistant_coach

### Athlete Workspace

Purpose:

- own sessions
- own availability
- own load reporting
- own team context

Primary user:

- athlete

---

## Confirmed V1 roles

```txt
club_admin
department_lead
head_coach
assistant_coach
athlete
```

Important principle:

Do not store one global role on the user.

Roles come from memberships.

---

## Confirmed structure

```txt
club
└── department
    └── team
```

Teams are always subordinate to departments.

Users can have multiple memberships.

Examples:

- athlete in multiple teams
- coach assigned to multiple teams
- club admin who also coaches
- department lead managing one department

---

## Invite and onboarding model

The project uses two onboarding concepts:

### Personal invites

Used for responsibility roles:

- department_lead
- head_coach
- assistant_coach

Personal invites are controlled and role-specific.

### Reusable team join codes

Used for athletes.

A coach can generate one reusable team code/link for all athletes on a team.

Example:

```txt
/join/U18ABC
```

Athlete flow:

```txt
open link or enter code
→ login/signup
→ confirm team
→ join as athlete
→ athlete workspace
```

A reusable team code can only create athlete memberships.

---

## Facility model

Facilities are created globally at club level.

But coaches should not see every facility in the whole club by default.

V1 facility scoping:

```txt
club facilities
→ assigned to departments
→ used by teams/coaches inside that department
→ optional default facility per team
```

### Key decisions

- club_admin creates global facilities
- department_lead selects facilities for their department
- coach sees primarily department-scoped facilities
- team can have a default facility

This reduces session creation friction for coaches.

---

## Load model

V1 starts simple:

```txt
session_load = RPE × duration_minutes
```

Load is a future USP and should be expanded later.

Future ideas:

- acute load
- chronic load
- ACWR-like signals
- monotony
- strain
- return-to-load
- wellness correlation
- coach alerts

Privacy decision:

- athlete sees own load
- teammates do not see each other's load
- coaches see load for assigned teams
- club_admin does not automatically see individual load data

---

## Notifications

V1 uses simple in-app signals only.

Examples:

- invite accepted
- session created
- athlete marked late/maybe/out
- attendance needs finalization
- load missing

No full push notification system in V1.

Future versions can add:

- push notifications
- email reminders
- attendance reminders
- load reminders
- notification preferences
- smart coach alerts

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

Added V1 Row Level Security policies and helper functions.

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

Also added RLS for team join codes.

### 0004_profile_creation_trigger.sql

Added automatic profile creation after Supabase Auth signup.

Flow:

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
```

---

## Vercel status

Vercel project:

```txt
club-app
```

Vercel is connected to GitHub and deploys automatically from the main branch.

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
/invite/[token]
/join/[code]
```

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

Still placeholder / not fully implemented:

- real club creation UI
- real department management UI
- real team management UI
- real coach invite UI
- real athlete join-code UI
- real session creation UI
- real availability flow
- real attendance finalization
- real load entry flow
- real facility assignment UI
- real protected layouts/server-side auth enforcement

---

## Next recommended steps

1. Build onboarding actions:
   - create club
   - accept invite
   - join team by code

2. Implement admin setup flow:
   - create club
   - create first department
   - create first team
   - create first facility
   - create club_admin membership

3. Implement team join code flow:
   - preview team by code
   - join team by code
   - redirect athlete to athlete workspace

4. Implement coach invite flow:
   - preview invite by token
   - accept invite
   - redirect coach to coach workspace

5. Implement session creation foundation:
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
10. The product should become a real club/team operating system, not a generic AI demo app.
