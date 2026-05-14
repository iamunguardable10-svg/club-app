# Department Teams V1

This document records the V1 implementation of department-level team management.

## Implemented routes

Real:

```txt
/admin/departments/[departmentId]
```

Demo:

```txt
/demo/admin/departments/[departmentName]
```

## Product decision

The department page is an operational workspace, not a dense admin table.

Normal Mode should stay calm and readable.

Edit Mode exposes setup controls.

## Team card layout

Team cards use a two-line structure:

```txt
Team Name

Head Coach · Player Count · Default Facility · Next Session
```

Responsive behavior:

```txt
Mobile: Team Name + most important context
Desktop: Team Name + coach/player/facility/next-session context
```

## Normal Mode

Normal Mode shows:

```txt
team name
head coach status
player count
default facility status
next session status
```

Management controls are hidden.

## Edit Mode

Edit Mode shows:

```txt
add team form
invite head coach action
copy pending invite action
default facility selector
```

This prevents the department page from feeling like a permanent admin form.

## Real data sources

The real department workspace loads:

```txt
department
club
teams
facilities
department_facilities
team_memberships
profiles for team members
pending coach invites
upcoming sessions
```

## Demo data sources

The demo department workspace uses localStorage only:

```txt
club-app.demo.club-setup
club-app.demo.teams
club-app.demo.facility-assignments
club-app.demo.invites
```

Demo mode does not write to Supabase.

## Database migration

A new optional field was added for team defaults:

```txt
teams.default_facility_id
```

Migration file:

```txt
supabase/migrations/0006_team_default_facility.sql
```

Important:

The code expects this field to exist in the real Supabase schema before using default facility persistence.

## Current implementation notes

Head coach and player count are derived from `team_memberships`.

Next session is derived from scheduled future `sessions`.

Default facility comes from `teams.default_facility_id` and can only be selected from facilities assigned to the department.

## Known follow-ups

1. Create dedicated team detail route.
2. Make team cards clickable once team detail exists.
3. Add assistant coach invite management.
4. Add athlete invite / join-code flow per team.
5. Add real session creation from team context.
6. Add conflict warning cards once facility bookings are real.
