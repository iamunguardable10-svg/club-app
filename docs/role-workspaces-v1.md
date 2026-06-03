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
- Coach reads of athlete load data must stay behind Supabase RLS for authorised team staff, department leads or club admins; UI scoping alone is not sufficient.
- Session group visibility uses `session_groups_select_context` / `can_view_session`; coaches must be able to read group targeting for their assigned sessions or scoped player lists can degrade incorrectly.
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
- Copy actions for staff invites and trainer links should give immediate inline feedback: show `Copied` briefly, then return to the persistent state such as `Copy` or `Trainer link active`.
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

## Coach shell direction

Coach OS should stay role-level, not duplicate Team Workspace.

Recommended top-level coach pages:

- `Today`: operational cockpit across all assigned teams. Shows today's sessions, late/out players, load risks and quick entry points.
- `Teams`: launcher into each Team Workspace. If the coach has one team, this can be visually compressed but should still be reachable as the team surface.
- `Calendar`: coach-wide calendar containing all sessions from assigned teams, using the same Untis calendar engine filtered to coach scope.
- `Facilities`: hall calendars for facilities used by assigned teams, with coach context preserved in navigation.

Single-team coach behavior: default entry may go straight to `Today`, but the shell still needs `Calendar` and `Facilities`. Do not collapse everything into Team Workspace because hall-time discovery is role-level, not team-local.


## Coach Calendar and History V1

Coach OS now separates role-level work from Team Workspace:

- `Today` stays the cross-team cockpit for same-day sessions, late/out flags and load risks.
- `Calendar` is a coach-wide Untis calendar using the shared `SmartSessionCalendar` engine across all assigned teams.
- If a coach has one team, Team Workspace remains directly reachable, but role-level `Calendar`, `Facilities` and `History` still exist because hall discovery and historical review are not team-local only.
- Creating a coach-calendar session first creates a draggable/resizable draft in the calendar. The compact edit screen opens only when the coach taps/confirms that draft or edits an existing session.
- With multiple teams the coach must verify/select the team in the edit screen; the selected team's default facility is applied automatically and remains editable.
- Coach calendar session types use the canonical `sessions.session_type` values from Supabase (`training`, `game`, `s_and_c`, `recovery`, `other`). The UI may label `s_and_c` as Strength and `other` as Individual, but it should not write athlete-load type values such as `strength` or `individual` into `sessions`.
- Group/participant targeting is editable only inside the edit-session screen, not through the read-only session detail screen, because changing participants affects athlete calendars.
- Sessions can be deleted from coach and team calendar flows through `AppConfirmDialog`.
- `History` V1 shows recent completed sessions and waits for a high enough load-report rate before treating average RPE as meaningful.

## Coach shell drawer and calendar polish

Current implementation update:

- Coach OS uses the same collapsible side drawer pattern as the department-lead shell instead of a wide top navigation.
- The drawer is available in the role shell and remains available when the coach opens a team or a coach-scoped facility calendar.
- `Today` no longer repeats team launcher cards. Team launchers live in the `Teams` page; Today stays focused on same-day operational sessions.
- The role shell remains separate from Team Workspace bottom navigation. Opening a team routes into Team Workspace; the coach drawer remains the role-level way back to Today, Teams, Calendar, Facilities and History.
- Coach calendar sessions use subtle per-team accents when several assigned teams appear in one coach-wide calendar. This is recognition metadata, not decorative full-card coloring.
- Coach facility links carry all relevant coach team IDs/names plus department IDs/names. Facility calendars should highlight every assigned coach team in that hall and lightly highlight the related department context.
- A coach may create sessions from a coach-scoped facility calendar when their role can create sessions for at least one team using that facility. If multiple assigned teams are possible, the edit sheet must ask for team selection instead of guessing the wrong team.
- Coach facility URL context is display/default context only. Real write permission must be resolved from membership data, not from client-controlled query parameters.

Implementation boundary:

- Coach shell must not expose club Admin Overview, all-department governance, or unscoped staff/facility pages.
- Department lead and coach can both open Team Workspace, but permissions and navigation context must remain role-scoped.
- Canonical calendar interaction rules live in `docs/calendar-session-blueprint-v1.md`; this file records only the role-shell consequences.
