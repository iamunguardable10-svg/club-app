# Calendar & Session Blueprint V1

## Purpose

This document defines the product shape for the first real interactive calendar system before implementation starts.

The goal is not to build four separate calendars.

The goal is to build one calendar/session system that becomes smarter depending on where the user enters it:

```txt
Team context       -> team already known
Department context -> department already known
Facility context   -> facility already known
Admin context      -> broad club overview
```

The product principle is:

```txt
Ask only for what the current context does not already know.
```

---

## Roles and primary calendar jobs

### Coach

Primary working context:

```txt
own team
```

Core jobs:

- plan sessions for assigned teams
- move, resize and edit own team sessions
- invite other teams into a session
- narrow a session to internal team groups or individual athletes
- understand hall availability without seeing private internals of other teams

Default calendar view:

```txt
team calendar
```

### Department Lead

Primary working context:

```txt
own department
```

Core jobs:

- coordinate sessions across teams in the department
- see conflicts, gaps and facility usage
- create or adjust sessions for teams inside the department
- understand how teams and facilities interact operationally

Default calendar view:

```txt
department calendar
```

### Club Admin

Primary working context:

```txt
whole club
```

Core jobs:

- understand club-wide facility usage
- inspect hall conflicts
- see department activity at a high level
- intervene when structure or availability requires it

Default calendar view:

```txt
club / facility calendar
```

### Athlete

Primary working context:

```txt
own assigned sessions
```

Core jobs:

- know what is next
- see where the session is
- report availability later

Default calendar view:

```txt
personal calendar
```

---

## One session system, multiple contextual entrances

The same session composer should be used everywhere.

The difference is only which values are already known:

| Entry point | Automatically known | User still chooses |
| --- | --- | --- |
| Team calendar | team, department, default facility | time, session type, scope, optional title |
| Facility calendar | facility | team, time, session type |
| Department calendar | department | team, facility, time, session type |
| Admin calendar | none or selected filters | whatever is not fixed by filters |

Examples:

```txt
Inside U18 Boys
-> owner team = U18 Boys
-> department = Basketball
-> facility = team's default facility

Inside Main Hall calendar
-> facility = Main Hall
-> team still needs to be chosen

Inside Basketball department
-> department = Basketball
-> team list is scoped to Basketball teams
```

---

## Interaction model

The calendar must be operational, not static.

Required interactions:

- click empty slot to create session
- drag event to move session
- resize event to change duration
- click event to inspect/edit
- create directly from the calendar, not through a detached admin form
- detect conflicts while editing, not only after save

Likely later interactions:

- drag across facility lanes to change hall
- recurring sessions
- batch edits for future repeats

### Facility calendar View/Edit mode

Facility calendars use an explicit mode split:

```txt
View mode
-> inspect sessions
-> scroll safely on mobile
-> no accidental draft creation

Edit/create mode
-> create sessions by tapping a free slot
-> confirm or cancel the draft directly inside the draft card
-> edit existing sessions through the session info sheet
-> delete sessions only when the user's role can manage them
```

Mobile behavior:

```txt
desktop -> week grid
mobile  -> one weekday at a time
```

This prevents the hall calendar from feeling like an accidental editing surface on phones.

Existing sessions are not yet drag/resize-editable by default. That should be added only with an explicit safety step for mobile, for example:

```txt
tap session -> info sheet -> Edit
or
enter edit mode -> activate session editing -> move/resize
```

The warning may later support "do not show again for this edit session".

---

## Session ownership model

V1 should no longer model sessions as "exactly one team only".

Instead:

```txt
Every session has one owner team.
Additional teams can be invited.
```

This preserves clear responsibility while allowing real club workflows.

Examples:

```txt
U18 Boys normal practice
owner team = U18 Boys

U18 Boys + U16 Boys shared S&C
owner team = U18 Boys
invited team = U16 Boys

U18 Boys Starting Five shooting session
owner team = U18 Boys
target group = Starting Five
```

### Why owner team still matters

- determines who created the session
- keeps coach permissions simple
- provides the default department
- provides the default facility
- gives the session one stable home even when more teams join

---

## Inviting other teams

Coaches should be able to invite other teams into a session.

But a coach should not silently force another team into a session.

Recommended V1 state model:

```txt
owner
invited
accepted
declined
```

Recommended permission behavior:

- coach may invite other teams
- invited team's coach or department lead accepts or declines
- before acceptance, the event is visible as an invitation for that team but does not count as a confirmed session
- department lead may create multi-team sessions directly inside their own department
- admin may create club-wide multi-team sessions directly

This keeps collaboration possible without dissolving responsibility boundaries.

---

## Internal team groups

Groups are team-internal in V1.

Examples:

- Starting Five
- Guards
- Bigs
- Rehab
- Goalkeepers
- Custom coach-defined groups

If a coach manages multiple teams, they create/manage separate groups inside each team.

### Product rule

Groups should be reusable persisted entities in Supabase, not free text written onto a session.

### Why persisted groups matter

- repeatable planning
- reliable attendance scope
- consistent availability calculations
- later load/performance workflows
- clear historical meaning

---

## Participant targeting

A session can target:

```txt
1. whole owner team
2. one or more internal groups of the owner team
3. selected individual athletes
4. any combination of the above where allowed
```

Recommended V1 default:

```txt
whole owner team
```

The coach narrows the target only when needed.

Examples:

```txt
whole U18 Boys
Starting Five only
Guards + 2 individually selected athletes
U18 Boys + invited U16 Boys
```

---

## Suggested data model direction

### sessions

```txt
id
club_id
department_id
owner_team_id
created_by
title
session_type
starts_at
ends_at
facility_id
location_text
notes
status
created_at
updated_at
```

### session_teams

```txt
id
session_id
team_id
relation_status  -- owner | invited | accepted | declined
invited_by
responded_by
responded_at
created_at
```

### player_groups

```txt
id
team_id
name
created_by
created_at
updated_at
```

### player_group_members

```txt
id
group_id
team_membership_id
created_at
```

### session_groups

```txt
id
session_id
group_id
created_at
```

### session_players

```txt
id
session_id
team_membership_id
created_at
```

### session_participants

Still useful as the historical snapshot of actual planned participants after expansion from:

- whole team
- selected groups
- selected players
- accepted invited teams

This preserves correctness if team membership or group membership changes later.

---

## Permissions

### Session visibility

- admin: club-wide
- department lead: own department
- coach: assigned teams
- athlete: sessions where included through team / group / individual targeting

### Session creation

- admin: any club context
- department lead: any team in own department
- coach: assigned owner teams only

### Session editing

- admin: club-wide
- department lead: own department
- coach: sessions owned by assigned teams

Current facility-calendar UI permission model:

```txt
club admin
-> can create and edit sessions for all teams

department lead
-> can create and edit sessions for teams in own department

head coach / assistant coach
-> can create and edit sessions for own teams
```

Supabase enforcement:

```txt
insert/update -> sessions policies using can_manage_session / role context
delete        -> sessions_delete_allowed policy using can_manage_session(id)
```

The client filters available departments and teams for usability, but the database remains the hard permission boundary.

### Invite handling

- coach can invite teams
- invited team coach or department lead can accept/decline for that team
- admin can override if needed

### Limited hall-awareness view

Coaches and athletes may see occupied facility slots from other teams, but only as limited booking data:

- team name
- session time
- facility
- session type

Not exposed:

- roster
- groups
- attendance
- availability
- coach notes

---

## Context-sensitive creation behavior

### From Team View

```txt
team           preset + locked
department     derived
facility       defaulted from team, editable per session
participants   whole team by default
```

Current implemented V1 behavior:

```txt
team calendar
-> View mode by default
-> explicit Edit mode
-> empty-slot tap creates draft session
-> draft has inline confirm/cancel
-> existing sessions can be moved/resized in Edit mode
-> tapping a session opens a modal detail sheet
-> session facility can be changed inside the detail sheet
```

Important selector rule:

```txt
Only facilities assigned to the team's department may be selected.
```

The session detail UI must not show the facility twice. The facility row should be directly editable through a compact selector when the user has edit rights.

### From Department View

```txt
department     preset + locked
team           choose from department teams
facility       default from chosen team if available
participants   whole chosen team by default
```

### From Facility View

```txt
facility       preset + locked
department     choose unless current URL/filter narrows it
team           choose after department, not from the whole club list
participants   whole chosen team by default
```

Facility calendar filtering should follow this order:

```txt
department
-> team inside department
-> group/player scope later
```

Default highlighting should come from context first:

```txt
URL has team
-> team primary, department secondary

URL has department
-> department primary

no URL context, user is department lead
-> own department primary

no URL context, user is coach
-> own teams primary, own department secondary

admin with no filter
-> full facility view
```

### From Admin Calendar

```txt
team           choose unless current filter narrows it
department     derived from team
facility       choose or inherit from team default
participants   whole chosen team by default
```

---

## Recommended first implementation slices

### Slice 1: calendar foundation

- update schema direction from `team_id` to `owner_team_id`
- add `session_teams`
- add team-internal player groups
- add session group/player targeting tables
- define access policy shape

### Slice 2: shared session composer

- one create/edit drawer
- context-aware defaults
- support whole team vs group vs selected players

### Slice 3: interactive calendar shell

- click-to-create
- drag-to-move
- resize-to-change-duration
- event detail drawer

### Slice 4: contextual calendar surfaces

- team calendar
- department calendar
- facility calendar
- admin calendar

---

## Decisions locked for now

1. Groups are team-internal in V1.
2. A coach may invite other teams, but not silently schedule for them.
3. Every session has one owner team.
4. Default participant scope is the whole owner team.
5. Other calendars are views over one shared session system, not separate products.
6. Session creation should be context-aware and minimize repeated field selection.
7. Team calendars are real calendars, not session lists.
8. Team sessions may override the team's default facility, but only with a department-assigned facility.

---

## Decisions to revisit later

1. Recurring sessions and series editing behavior.
2. Whether invited teams can partially accept with only selected groups.
3. Whether department-wide groups are needed as a separate object later.
4. How flexible cross-department sessions should become.
5. Whether assistants and specialized coaches need narrower edit rights than head coaches.

