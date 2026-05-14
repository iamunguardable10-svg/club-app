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

## Department detail workspace

The department detail pages now act as the team operations setup surface.

The central object is the team list, not the team creation form.

Each team row shows:

```txt
team name
head coach name or pending invite state
assistant coach names
athlete count
default facility
```

Routes:

```txt
/admin/departments/[departmentId]
/demo/admin/departments/[departmentName]
```

Team creation remains available, but it is a secondary action. In normal use, teams are created once during setup or season turnover and should not dominate the department page.

If a team is missing a head coach, the department page can create a head coach invite directly from the team row. The invite is still stored in the existing `invites` table and uses the existing team-based coach invite model.

If a team is missing a default facility, the department page can set `teams.default_facility_id` directly from the department-scoped facility list. V1 allows this for `club_admin` and `department_lead`, because default facility is structure, not one-off session planning.

Attention messages are shown only for real missing setup or operational problems. If all teams have the required structure, the attention section is hidden instead of showing neutral reminders.

Season is intentionally not shown in the V1 department team list. The schema still has `teams.season`, but per-team season editing would add noise before there is a global or department-level active season model.

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

1. Implement invite acceptance for `/invite/[token]`.
2. Add assistant coach invite shortcuts once head coach flow feels right.
3. Add team detail pages after sessions and athlete join codes need a dedicated surface.
4. Add department-managed training locations after teams/facility context is stable.
5. Consider a central attention page once multiple workspaces produce real issues.
