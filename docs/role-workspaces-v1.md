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

Decision update:

- Department leads should not land in the club Admin Overview or the all-departments governance page.
- Their shell is scoped to exactly their department context: Teams, Facilities, Staff and Settings.
- Desktop can use a compact top/sub navigation; mobile should use a role-aware bottom switcher.
- Team Workspace keeps its own bottom navigation inside a selected team, so department navigation must not duplicate team-level tabs.
- Coach routes stay even narrower: own team(s), own team calendar, players/load, team staff/settings and relevant facility calendars.

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

## Player Load Detail implementation

- Team Workspace player cards open a focused Player Load overlay.
- Demo players receive generated load history so coaches can test the graph and insight layout immediately.
- Live players use Supabase `load_entries` where readable through RLS; missing attendance/readiness remain explicit placeholders.
- The overlay shows 7-day load, EWMA ACWR, state, attendance placeholder, load graph, missing input and training mix.

## Coach Today / Team Workspace update

Implementation update:

- `/coach/today` is now the coach-level cockpit across assigned teams instead of a second team workspace.
- Coach team cards route into the existing Team Workspace via `/coach/team?teamId=...`, `/coach/sessions?teamId=...`, `/coach/load?teamId=...`.
- The coach frame intentionally avoids broad admin navigation. Real work still happens inside Team Workspace sections: Home, Calendar, Players, Groups, Staff / Settings.
- Today aggregates the coach's own team sessions for the current day and shows athlete availability flags from `availability` (`out`, `late`, reason, late minutes).
- Demo coach routes mirror the same product behavior through `/demo/coach/today`, `/demo/coach/team`, `/demo/coach/sessions`, `/demo/coach/attendance`, and `/demo/coach/load` without requiring login.
- Team Workspace coach-role detection now checks the current user's own active coach membership, not whether any coach exists on the team.

Important boundary:

- `attendance_records` remains the future finalized-attendance source.
- Coach Today uses athlete pre-session availability only; it should not be treated as final attendance.
