# Weekly Series Batch Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly planning board where recurring team-session templates can be selected per week and committed as one checked batch into coach, facility, team, and athlete calendars after conflict validation.

**Architecture:** A Series is only a reusable template, not a generated session. The weekly planner renders templates grouped by weekday for a selected week. The coach/department lead checks which templates should happen, then presses one top-level confirm button. Confirmation creates concrete sessions for the selected week only; unchecked templates stay translucent and create nothing.

**Tech Stack:** Next.js App Router, React/TypeScript, Supabase, demo localStorage, existing `SmartSessionCalendar`, `CoachSessionEditSheet`, `FacilityConflictDialog`, `sessions`, `session_groups`, `department_facilities`.

---

## Final product model

```txt
Series Template = recurring training template
Weekly Batch = checked templates for one calendar week
Session = concrete confirmed calendar entry created from batch
Skipped = unchecked template for this week; no session is created
```

There are no 4-week generated drafts.

A Series Template stores:

```txt
team
weekday
start time
end time
facility
session type
participants: whole team / groups / players later
active/inactive
optional date range
```

The planner is week-based:

```txt
Selected week -> render all active templates for that scope -> coach checks the ones that happen -> Confirm week -> create sessions
```

---

## UX model

### Main surface

This belongs under Calendar as a second mode:

```txt
Week | Series
```

`Week` is the normal Untis calendar.

`Series` is the weekly batch planner.

### Header

```txt
< Week      KW 24 · 08.06 - 14.06      Week >
[This week]

[Confirm week]   // top right, enabled only when at least one unchecked/uncommitted change exists
```

After a successful confirm:

```txt
Automatically jump to next week.
```

This matches the planning rhythm: confirm this week, then immediately prepare the following week.

### Week board

Seven weekday columns/cards:

```txt
Mo
  [✓] Team Training · 18:30-20:00 · Main Hall · Whole team

Di
  [ ] Strength · 17:00-18:00 · Weight Room · Starting Five

Mi
  empty

...
```

Unchecked templates are not deleted and do not need an X. They become visually inactive:

```txt
unchecked = translucent / dimmed
checked = normal/high-contrast
already committed = locked/check mark with subtle success state
conflict = warning state
```

No X in v1.

### Template text

Use **Session Type**, not title, as the primary label.

Examples:

```txt
Team Training
Strength
Game
Recovery
Individual
```

Title can exist internally later, but UI should not ask for custom title in Series v1.

### Batch confirm behavior

When `Confirm week` is clicked:

1. Collect checked templates for selected week.
2. Ignore unchecked templates.
3. Ignore templates already committed as sessions for that week unless changed.
4. Run facility conflict checks for the whole batch.
5. If no conflicts: create concrete sessions + session groups.
6. Push sessions into:
   - coach calendar
   - team calendar
   - facility calendar
   - athlete calendar, filtered by participants
7. Jump to next week.

If conflicts exist:

```txt
Conflict Review Sheet
- Team Training · Tue 18:30-20:00 conflicts with U18 Boys
- Suggest: before / after / choose time / uncheck
[Cancel] [Apply fixes] [Confirm non-conflicting]
```

Do not partially create hidden sessions without telling the coach.

---

## Scope placement

### Team Calendar

Team-level Series is useful because most recurring training belongs to one team.

In Team Workspace:

```txt
Calendar -> Week | Series
```

Shows only that team templates.

### Coach Calendar

Coach-level Series is needed when coach has multiple teams.

In Coach Calendar:

```txt
Calendar -> Week | Series
```

Shows templates grouped by team or filterable by team.

If coach has one team, this can still show one team without feeling heavy.

### Department Schedule

Department Lead needs the same Series board for all department teams.

In Department Schedule:

```txt
Week | Series
```

Department Lead can edit, check, and confirm all templates for their department.

### Facility Calendar

Facility Calendar should not create Series in v1.

It only shows concrete confirmed sessions. Since templates are not facility holds until confirmed, facility conflicts happen at confirmation time.

Challenge accepted: this is simpler, but it means halls are not held until confirm. That is acceptable if conflict review is strong.

---

## Permissions

### Coach

Can:

```txt
create/edit templates for own teams
check/uncheck own team templates for a week
confirm week for own teams
```

### Department Lead

Can:

```txt
create/edit templates for any team in own department
check/uncheck templates for any department team
confirm week for department teams
```

Cannot touch other departments.

### Admin

Can manage all templates and weekly confirmations.

### Athlete

Sees only concrete confirmed sessions created after batch confirmation.

---

## Data model

### Supabase: `session_series`

```sql
create table session_series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  facility_id uuid references facilities(id) on delete set null,
  created_by uuid references auth.users(id),
  session_type text not null default 'training',
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'inactive', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Supabase: `session_series_groups`

```sql
create table session_series_groups (
  series_id uuid not null references session_series(id) on delete cascade,
  group_id uuid not null references player_groups(id) on delete cascade,
  primary key (series_id, group_id)
);
```

No rows = whole team.

### Supabase: `session_series_week_state`

Stores check/uncheck state and committed sessions for one week.

```sql
create table session_series_week_state (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references session_series(id) on delete cascade,
  week_start date not null,
  checked boolean not null default true,
  committed_session_id uuid references sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(series_id, week_start)
);
```

Interpretation:

```txt
no week_state row -> default checked for active template
checked false -> dimmed, will not create session
committed_session_id set -> already pushed to calendar
```

### Sessions addition

```sql
alter table sessions
  add column if not exists series_id uuid references session_series(id) on delete set null,
  add column if not exists series_week_start date;
```

No visibility column needed for this model. A concrete session exists only after confirmation and is visible according to existing calendar rules.

---

## Demo localStorage model

Keys:

```txt
club-app.demo.session-series
club-app.demo.session-series-week-state
```

Types:

```ts
export type DemoSessionSeries = {
  id: string;
  department: string;
  team: string;
  facility: string | null;
  sessionType: string;
  weekday: number;
  startTime: string;
  endTime: string;
  startsOn?: string | null;
  endsOn?: string | null;
  groupIds: string[];
  status: 'active' | 'inactive' | 'ended';
  createdAt: string;
  updatedAt: string;
};

export type DemoSessionSeriesWeekState = {
  id: string;
  seriesId: string;
  weekStart: string;
  checked: boolean;
  committedSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

---

## Implementation tasks

### Task 1: Pure week/template helpers

Files:

```txt
Create src/features/sessions/sessionSeriesPlanner.ts
Create src/features/sessions/__tests__/sessionSeriesPlanner.test.ts
```

Functions:

```ts
getWeekStart(date: Date): string
getSeriesOccurrenceForWeek(series, weekStart): occurrence | null
buildWeeklyBatch(seriesList, weekStateList, weekStart)
```

Rules:

- inactive/ended templates excluded
- starts_on and ends_on respected
- no week_state row means checked=true
- committed rows are rendered locked/committed

### Task 2: Series data storage

Files:

```txt
Modify src/shared/dev/demoStorage.ts
Create supabase/migrations/<timestamp>_session_series_week_planner.sql
```

Build:

- demo read/write helpers
- Supabase tables
- RLS for coach/department/admin

### Task 3: Series board UI

Files:

```txt
Create src/features/role-workspaces/WeeklySeriesBoard.tsx
Create src/features/role-workspaces/SeriesTemplateEditSheet.tsx
```

Board:

- week navigation
- weekday columns/cards
- checkbox per template
- dim unchecked templates
- top-right Confirm week button
- auto-jump to next week after successful confirmation

### Task 4: Coach integration

Files:

```txt
Modify src/features/role-workspaces/CoachWorkspaceRouter.tsx
Modify src/features/role-workspaces/DemoCoachWorkspaceRouter.tsx
```

Build:

- Calendar mode gets `Week | Series`
- Coach sees own teams
- Confirm week creates sessions for checked templates
- Conflict review before creation

### Task 5: Team integration

Files:

```txt
Modify src/features/teams/TeamWorkspaceView.tsx
Modify src/features/teams/TeamWorkspace.tsx
Modify src/features/teams/DemoTeamWorkspace.tsx
```

Build:

- Team Calendar gets optional Series board filtered to team
- Coach/admin/department lead permissions respected
- Same shared board component reused

### Task 6: Department integration

Files:

```txt
Modify src/features/role-workspaces/DepartmentLeadWorkspaceRouter.tsx
```

Build:

- Department Schedule gets `Week | Series`
- Department Lead can manage all department templates
- Confirm week can create sessions across department teams

### Task 7: Conflict handling

Files:

```txt
Modify src/features/calendar/sessionConflicts.ts
Modify src/features/role-workspaces/WeeklySeriesBoard.tsx
```

Build:

- batch conflict detection before session creation
- show conflict review sheet
- allow unchecking conflicting item or choosing suggested time
- no hidden partial creation without user action

---

## Manual acceptance tests

1. Coach creates recurring template: U16, Tuesday, Team Training, 18:30-20:00, Main Hall, Whole team.
2. Series board shows it under Tuesday for selected week.
3. Unchecking makes it translucent; no session is created on confirm.
4. Checking and pressing Confirm week creates one concrete session.
5. After confirm, board jumps to next week.
6. Athlete calendar shows the created session.
7. Facility calendar shows the created session only after confirm.
8. Coach creates two templates on same day; both render independently.
9. Conflict at confirm opens conflict review before creating sessions.
10. Department Lead can confirm week for all teams in own department.
11. Coach cannot manage templates for teams outside own memberships.

---

## Product challenge / tradeoff

This model is simpler and more understandable than generated drafts. Tradeoff: facilities are not held until Confirm week. That means coaches must confirm reasonably early. To reduce risk later, add settings/reminders:

```txt
Reminder: unconfirmed templates for next week
Default: show warning on Friday/Sunday if next week has checked unconfirmed templates
```

Do not build that reminder in v1 unless needed.
