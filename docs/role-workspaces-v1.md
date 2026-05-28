# Role Workspaces V1

## Goal

Coach and department-lead routes should no longer be dead placeholder pages. They should connect into the operational surfaces we already built while keeping permissions role-aware.

## Coach routes

Routes:

- `/coach/today`
- `/coach/team`
- `/coach/sessions`
- `/coach/attendance`
- `/coach/load`

Current V1 behavior:

- Authenticated coach memberships are loaded from `team_memberships`.
- Only active `head_coach` and `assistant_coach` memberships count.
- If a coach has one team, direct team/session routes open the existing Team Workspace in the right section.
- If a coach has multiple teams, routes show a team selector.
- Attendance and player-load routes are connected to the team/player context with placeholders until attendance/player-detail storage is finished.

## Department-lead routes

Routes:

- `/department/overview`
- `/department/teams`
- `/department/schedule`
- `/department/coaches`
- `/department/facilities`

Current V1 behavior:

- Authenticated access is loaded from `club_memberships`.
- `department_lead` sees assigned departments.
- `club_admin` can access department-lead surfaces for departments in their club.
- If one department is available, the existing Department Workspace opens directly.
- If multiple departments are available, a department selector is shown.

## Permission rule

These pages are routing and scoping surfaces. Real write permissions still live in Supabase RLS and in the target Team/Department workspaces.

## Next slice

Player cards inside Team Workspace should open a Player Load Detail surface:

- load graph
- acute/chronic details
- missing input
- attendance rate
- recent sessions
- placeholder wellness/readiness until those tables exist
