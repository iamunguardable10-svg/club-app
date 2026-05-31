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

Correction:

- Coach team cards are launchers only: tapping/clicking the team opens the existing Team Workspace directly.
- The Coach shell should not expose a parallel mini-navigation for Team/Calendar/Players on each card; those sections already live inside Team Workspace.
- Coach Today remains a lightweight cross-team availability overview, not a replacement for Team Workspace.

Scope correction:

- Demo Department entry now opens a department-lead scoped Basketball workspace instead of the club-level demo Departments page.
- Demo Coach is scoped to assigned demo coach teams only, not every demo team in the club.
- Role workspaces should use compact app-bar navigation on mobile. The large hero/card header belongs to admin/marketing/setup surfaces, not operational role shells.

## Calendar and role-shell polish update

Implementation rules added after the athlete-calendar pass:

- Shared calendar surfaces should use the compact control pattern from Athlete OS: one small `Edit` / `Done` toggle, no large edit buttons, and no helper copy when the state is visually obvious.
- Mobile week/day calendars should render the full 08:00-23:00 operating window without an inner vertical scroll when the slot grid fits in the card. The page may scroll; the calendar grid itself should not fight touch gestures.
- Team Workspace and Facility Calendar should keep using the same shared `SmartSessionCalendar` engine so coach, team, facility and athlete calendars do not drift.
- Coach team cards are launchers into Team Workspace. They should not say `Open`, should not show assigned-count badges, and should show the next planned session instead of redundant status text.

## Department-lead shell decision

Department lead is not a mini club-admin. The role shell is scoped to exactly one department unless the user explicitly has multiple department-lead memberships.

Target pages:

- Teams: team list and team-entry launchers.
- Facilities: department halls and facility calendar context.
- Staff: the existing Staff role coverage filtered to this department.
- Settings: department defaults and setup choices.

Navigation rule:

- Department-level navigation must stay outside Team Workspace navigation. If a department lead opens a team, Team Workspace takes over with its own bottom nav.
- If the same person is department lead and head coach, entry context decides the shell: department pages stay department-scoped; team pages stay team-scoped.

Facility authority rule:

- If a club/admin layer exists, a department lead should request access to shared/global facilities rather than silently self-assign every shared hall.
- If the department is the highest active layer in a bottom-up setup, facilities are department-owned by default; `shared` is not exposed as a governance concept until a club layer exists.
- Promoting a department-only facility to shared should become an explicit request/approval flow once a club admin surface exists.
