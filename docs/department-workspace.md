# Department Workspace

## Purpose

The Department Workspace is the operational layer between club administration and individual team coaching.

It is used by:

- club_admin
- department_lead

It should not be the default workspace for normal coaches or athletes.

---

## Why this workspace exists

Large clubs need a layer where department-level operations are visible without forcing the club admin to manage every daily detail.

Example:

```txt
Club
└── Basketball Department
    ├── U14
    ├── U16
    ├── U18
    └── First Team
```

A Basketball department lead should see:

- all teams in Basketball
- team coaches
- training schedule overview
- department-level session calendar
- facility usage by department
- simple attendance/load status at a high level

But an individual coach does not need to see or manage all of that.

---

## V1 access

### club_admin

Can access all department workspaces in the club.

### department_lead

Can access their assigned department workspace.

### head_coach / assistant_coach

Do not use this workspace by default.

They stay inside the Coach Workspace for assigned teams.

### athlete

No access.

---

## V1 pages

```txt
/department/overview
/department/teams
/department/schedule
/department/coaches
/department/facilities
```

---

## V1 modules

### Overview

High-level state of the department:

- number of teams
- today's sessions
- upcoming sessions
- teams missing coaches
- open operational issues

### Teams

Department-level team overview:

- team list
- team season
- assigned coaches
- athlete count placeholder
- link to team detail later

### Schedule

Department-wide training/game calendar:

- all sessions in the department
- grouped by date/team/facility
- useful for coordination, not tactical coaching

### Coaches

Department coach overview:

- coaches assigned to teams
- missing roles
- invite coach actions

### Facilities

Department facility usage:

- sessions by facility
- basic conflicts
- department-relevant hall usage

---

## Database impact

No new V1 tables are required.

The existing schema already supports this workspace through:

- departments
- teams
- sessions
- club_memberships with role = department_lead
- team_memberships for coach assignments
- facilities
- facility_bookings

---

## RLS impact

No immediate RLS change is required for V1.

Existing RLS already allows:

- club_admin to view club-level department data
- department_lead to view department-level data

Future versions may add department-specific reporting views for performance and analytics.

---

## Product principle

The Department Workspace should not become a second Admin Workspace.

It should answer:

> Is this department operationally organized across all teams?

Not:

> What should one coach do in today's training?
