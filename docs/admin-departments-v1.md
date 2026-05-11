# Admin Departments V1

This document records the V1 implementation of department management in the Admin workspace.

## Implemented routes

Real:

```txt
/admin/departments
/admin/departments/[departmentId]
```

Demo:

```txt
/demo/admin/departments
/demo/admin/departments/[departmentName]
```

## Product model

Departments are the operating layer between the club and teams.

```txt
club
→ departments
→ teams
```

The admin should not manage every team directly from the global admin overview. Instead, departments become the context for:

```txt
teams
facilities
people & invites
department-specific training locations
schedule
```

## Real implementation

`/admin/departments` now loads from Supabase:

```txt
club
departments
facilities
department_facilities
teams
invites
```

The page supports:

```txt
create department
list departments
show compact facility usage
show team setup status
show pending department lead invite status
link to People & Invites with department preselected
open department detail placeholder
```

## Demo implementation

`/demo/admin/departments` uses browser-only localStorage data:

```txt
club-app.demo.setup
club-app.demo.facility-assignments
club-app.demo.invites
```

The page supports:

```txt
create local department
list local departments
show compact facility usage
show pending demo lead invite status
link to local People & Invites with department preselected
open local department detail placeholder
```

## Department detail placeholders

The detail pages are placeholders for now.

Future modules:

```txt
Teams
Facilities
People
Schedule
```

Routes:

```txt
/admin/departments/[departmentId]
/demo/admin/departments/[departmentName]
```

## People & Invites integration

Department cards link into People & Invites with a department query parameter:

```txt
/admin/people?department=<departmentId>
/demo/admin/people?department=<departmentName>
```

The People & Invites managers now read this query parameter and preselect the department in the invite form.

## Important limitation

Coach invites still require teams in the current V1 acceptance model.

This means the department page can prepare coach invite context, but real coach invite creation depends on team creation.

## Next recommended steps

1. Build team management inside department context.
2. Use department detail pages as the place for department teams, facilities and people.
3. Extend coach invites once teams are fully manageable.
4. Add department-managed training locations after teams/facility context is stable.
