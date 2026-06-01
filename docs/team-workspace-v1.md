# Team Workspace V1

This document records the current team workspace direction and the decisions made around team calendars, staff, players, groups, facilities and navigation.

## Product role

The team workspace is the operational home for a single team.

It is not meant to replace:

```txt
Admin Overview
Departments Page
Department Workspace
Facilities Page
Staff Page
```

Instead, it is the place where a coach or admin works once a concrete team is known.

Core structure:

```txt
Team Workspace
├─ Home
├─ Calendar
├─ Players
├─ Groups
└─ Staff / Settings
```

Mobile uses the same sections as bottom navigation. Desktop uses top section pills.

## Role-specific meaning

### Coach

The team workspace should become the coach's default working area when the coach has one assigned team.

If the coach manages multiple teams, the app should first show a scoped team/department list with only the coach's own teams, then open the selected team workspace.

Coach jobs:

- see today / next session
- create and edit team sessions
- adjust facility if a session is not in the default hall
- invite team staff from the team's own mini staff area
- manage players and team-internal groups later
- open session details for attendance and load later

### Department Lead

Department leads can use the team workspace for teams inside their department, but the department workspace remains their broader coordination surface.

### Club Admin

Admins can open any team from:

```txt
Teams page
Department workspace
Staff page
```

The team page should expose quick setup actions when the team is incomplete, but it should not become another full admin overview.

## Current implemented sections

### Home

Shows:

- team name
- department
- default facility summary
- role chip
- player count
- setup status
- Today / Next card
- setup quick actions only if there are real setup gaps

Setup card disappears completely when there are no setup problems.

Current setup gaps:

```txt
missing head coach
missing default facility
no players yet
```

Rules:

- Missing head coach should offer an invite action directly when possible.
- Missing players routes the user to Players; demo mode can load demo players on button press.
- Missing default facility routes to Staff / Settings.

### Calendar

The team calendar is a real Untis-style calendar filtered to this team.

Current behavior:

- View mode is the default.
- Edit mode is explicit.
- In Edit mode, empty slots can create draft sessions.
- Draft sessions are confirmed or cancelled inside the draft card.
- Existing sessions can be moved and resized in Edit mode.
- Tapping a session opens a modal detail sheet.
- Session details use the shared `SessionDetailSheet`.
- The sheet shows time, team/department context, compact per-session facility editing, participant scope, group targeting, attendance flags and load status.
- The same sheet is used by the team calendar, facility calendars and department schedule so the session surface stays consistent across role contexts.

Facility behavior:

```txt
team default facility -> default for new sessions
session facility      -> editable per session
```

If a training does not take place in the team's default hall, the session detail modal lets the user switch the facility.

Important UI rule:

```txt
Show the selected facility only once.
```

The facility selector should be compact and direct, not a large full-width dropdown plus duplicated facility text.

Facility scope rule:

```txt
Only facilities assigned to the team's department are selectable.
```

This applies to real and demo:

- real mode filters through `department_facilities`
- demo mode filters through `club-app.demo.facility-assignments` and department-only ownership

### Players

V1 is still light.

Current behavior:

- shows player count
- demo can load about 12 realistic demo players
- demo player cards do not show jersey numbers
- player invite/code flow is planned but not implemented

Future player jobs:

- player invite link / team code
- profile list
- availability status
- attendance history
- player detail page

### Groups

Groups are team-internal.

Current demo groups:

```txt
Starting Five
Bench unit
Rehab
```

Real mode stores groups in Supabase through `player_groups` and player assignments through `player_group_members`.

Product rule:

```txt
Groups belong to a team, not globally to a department.
```

If a coach manages multiple teams, the coach manages separate groups inside each team.

Current behavior:

- create/edit/delete groups
- assign players to groups
- view group cards without member-management clutter
- switch into explicit Edit groups mode for create/delete/member assignment
- tap a group card for the future insight surface
- target sessions to groups from the team calendar session detail modal

Future group insight jobs:

- average load
- playing time
- attendance pattern
- quick player analysis
- combine group targeting with individual player targeting

Session group targeting is stored in `session_groups` in standard mode and on `DemoSession.groupIds` in demo mode.

### Staff / Settings

This section contains:

- compact default facility selector
- mini staff management for this team
- built-in roles: Head Coach, Assistant Coach
- custom team coach roles, for example Strength Coach
- pending invite state
- copy invite link
- revoke invite
- remove custom role

Important product decision:

```txt
Coaches should be able to invite staff from inside their team page.
```

This avoids sending coaches into the central Staff page, which is primarily for admins and department leads.

The central Staff page remains the admin/department lead coverage page.

## Team links and parent context

Every place that shows a team should link to the team workspace.

Current link sources:

```txt
Teams page
Department workspace team cards
Staff page role coverage
```

Links carry parent context:

```txt
/admin/teams/[teamId]?from=teams
/admin/teams/[teamId]?from=department&departmentId=...
/admin/teams/[teamId]?from=staff
```

Demo equivalents:

```txt
/demo/admin/teams/[teamId]?from=teams
/demo/admin/teams/[teamId]?from=department&departmentName=...
/demo/admin/teams/[teamId]?from=staff
```

The team workspace back link uses this context:

```txt
from=department -> Back to department
from=staff      -> Back to staff
from=teams      -> Back to teams
missing         -> Back to teams
```

## Demo and standard parity

Every product behavior must be kept in both demo and standard unless explicitly impossible.

Current parity expectations:

- team page exists in both
- team links exist in both
- calendar interactions exist in both
- staff invite state exists in both
- default facility selector exists in both
- per-session facility selector exists in both
- per-session group selector exists in both
- parent/back context exists in both
- demo uses localStorage, standard uses Supabase

## Session details and coach today

Session details are now shared across team, facility, department schedule and coach-today surfaces.

Coach Today is player-centered:

```txt
Session
-> out / late players
-> high / low load players
-> link back into the team calendar
```

Groups remain team-internal targeting and analysis. They are not the primary unit for the coach-today session view; the session view must name the concrete affected players.

Group cards should avoid abstract metrics when concrete player-level signals exist. Prefer:

```txt
High load -> player names
Low load  -> player names
Attendance flags -> player names
```

over counts, generic averages, or placeholder copy.

## Known current limitations

1. Attendance and load data inside Session Details V1 is partially connected; team sessions and coach today show player flags, while facility/department views still show status-level summaries.
2. Player invite/code flow is not implemented.
3. Group insights show connected load and attendance player names, but deeper playing-time analytics are still basic.
4. Custom coach roles currently inherit assistant-coach style behavior.
5. Facility conflict handling is still visual/contextual, not a hard scheduling conflict system.

## Next recommended slice

After Session Details V1, the next slice is advanced attendance:

```txt
session status
attendance state
load / RPE
notes
participant scope
group targeting
```

That detail model should then feed:

```txt
Today / Next cards
coach dashboard
team calendar modal
future athlete view
```

## Session detail refinement

Session cards in Coach Today, Coach Next and Team Home open the same session detail sheet by tapping the card. The sheet should stay player-first:

```txt
attendance flags
load risks
edit controls
expected player list
context
```

Do not lead with generic attendance/load/scope metric cards when they only repeat obvious state. Late is amber; low load remains blue.

In team-owned session details, edit mode inside the sheet exposes start time and duration. Drag/resize remains available in the calendar edit mode, but the sheet must support quick time edits without explanatory copy.

## Follow-up refinements: player lists, load chart fit, role navigation

- Load charts must fit inside their card on desktop, iPad and mobile for every supported range, including 60 days. Do not reintroduce horizontal chart scroll as the default interaction.
- Session detail `Expected players` lists only athletes expected to come or marked late. Players marked out stay in Attendance flags and should not be counted as expected.
- Team Home session cards should mirror the coach Today card pattern: tap the whole card for details, show out/late and load-risk previews, and avoid detached Details buttons.
- Facility calendars should preserve the active role shell. Coach context shows coach navigation, department context shows the department drawer, and admin context shows admin navigation.
