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

The Departments page is not the same thing as the global Admin Overview.

```txt
Admin Overview
→ club-wide start page and broad admin navigation

Departments page
→ department management overview
```

The admin should not manage every team directly from the global admin overview. Instead, departments become the context for:

```txt
teams
facilities
staff / invites
department-specific training locations
schedule
```

## Departments overview page

The departments overview supports Classic Mode and Edit Mode.

### Classic Mode

Classic Mode is the normal state.

It should support:

```txt
open department workspace
see team names
see assigned facility names
invite department lead quickly
see department-level messages in compact form
jump to the department workspace for unresolved setup gaps
```

It should not show the create form permanently.

### Edit Mode

Edit Mode is for structural changes.

It supports:

```txt
create department
delete department with app-internal confirmation
```

The create form is shown only in Edit Mode.

Department deletion must use `AppConfirmDialog`, not `window.confirm` or the operating-system confirmation UI.

## Department card content

Department cards should be information-dense but not noisy.

Current card sections:

```txt
Teams
Facilities
Department Lead
Meldungen
```

### Teams

Do not show only a count such as `4 linked`.

Show names directly:

```txt
U14 Boys · U16 Boys · U18 Boys · First Team
```

If there are more than four teams:

```txt
U14 Boys · U16 Boys · U18 Boys · First Team +2 more
```

If no teams exist, show a quick action:

```txt
Create first team
```

That action deep-links to the department workspace in Edit Mode:

```txt
/admin/departments/[departmentId]?mode=edit&focus=teams
/demo/admin/departments/[departmentName]?mode=edit&focus=teams
```

### Facilities

Do not show only `Assigned` or `Needs assignment`.

Show facility names directly, using the same facility chips/accent system as elsewhere.

If no facilities are assigned, show:

```txt
Assign halls
```

That action deep-links to the department workspace in Edit Mode:

```txt
/admin/departments/[departmentId]?mode=edit&focus=facilities
/demo/admin/departments/[departmentName]?mode=edit&focus=facilities
```

### Department Lead

If no department lead exists and no pending invite exists, show the action directly:

```txt
Invite lead
```

Do not show redundant text such as `Not invited yet` when the button already communicates the missing state.

If a department lead invite is pending, show:

```txt
Invite pending
Copy lead invite
```

If a department lead accepted, show the accepted lead name from membership/profile data where available.

### Meldungen

The department overview card may show compact department-level signals, but it should not become a detailed team issue list.

Current compact example:

```txt
3 coach gaps · 1 facility gap
```

Detailed team-level work belongs inside the department workspace.

## Department workspace

The department detail pages act as the team operations setup surface.

Routes:

```txt
/admin/departments/[departmentId]
/demo/admin/departments/[departmentName]
```

Each team row shows:

```txt
team name
head coach name or pending invite state
assistant coach names
athlete count
default facility
next session later
```

Team creation remains available, but it is a secondary action. In normal use, teams are created once during setup or season turnover and should not dominate the department page.

If a team is missing a head coach, the department page can create a head coach invite directly from the team row. The invite is still stored in the existing `invites` table and uses the existing team-based coach invite model.

If a team is missing a default facility, the department page can set `teams.default_facility_id` directly from the department-scoped facility list.

In Classic Mode, the missing default facility select should sit inline where the default facility value would normally appear:

```txt
No head coach · 0 players · [Set default facility]
```

not as a separate line under the metadata.

## Team deletion

Teams can be deleted from the department workspace in Edit Mode.

Rules:

```txt
Edit Mode only
app-internal confirmation required
no operating-system confirm dialog
```

The shared confirmation component is:

```txt
src/shared/components/AppConfirmDialog.tsx
```

The current implementation mounts team deletion through:

```txt
src/shared/components/facilities/TeamDeleteEnhancer.tsx
```

Long-term this should move into explicit React actions inside the team card, but the enhancer gives the current UI a consistent delete capability without a large rewrite.

Deletion behavior:

```txt
Demo:
remove the team from local demo team storage

Real:
remove team-specific invites, sessions, memberships, then the team
```

## Real implementation

`/admin/departments` loads from Supabase:

```txt
club
departments
facilities
department_facilities
teams
invites
club_memberships for department leads
profiles for accepted department lead names
```

The page supports:

```txt
Classic/Edit Mode
create department in Edit Mode
list departments
show team names
show compact facility usage
invite/copy department lead invite
show accepted department lead name when available
delete department in Edit Mode with AppConfirmDialog
open department workspace
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
Classic/Edit Mode
create local department in Edit Mode
list local departments
show team names
show compact facility usage
invite/copy demo department lead invite
delete department in Edit Mode with AppConfirmDialog
open local department workspace
```

## Staff naming

The admin navigation should use `Staff`, not `People`, because the area will manage role-bearing people and invites:

```txt
Department Leaders
Head Coaches
Assistant Coaches
Club Admins later
Pending Staff Invites
```

The current route may remain `/admin/people` temporarily, but the UI label is `Staff`.

## People / Staff integration

Department cards can still link into the existing People/Staff route with a department query parameter:

```txt
/admin/people?department=<departmentId>
/demo/admin/people?department=<departmentName>
```

The People/Staff managers read this query parameter and preselect the department in the invite form.

## Deep-link edit mode

Department overview quick actions can deep-link into the department workspace:

```txt
?mode=edit&focus=teams
?mode=edit&focus=facilities
```

The current helper is:

```txt
src/shared/components/departments/DepartmentWorkspaceModeEnhancer.tsx
```

It opens Edit Mode and scrolls to the relevant section.

Long-term, this should be replaced with explicit URL/state handling in the department workspace component.

## Important limitation

Coach invites still require teams in the current V1 acceptance model.

This means the department page can prepare coach invite context, but real coach invite creation depends on team creation.

## Next recommended steps

1. Replace enhancer-based team delete/edit-link helpers with explicit React actions inside the relevant components.
2. Build Staff page around Department Leaders, Head Coaches, Assistant Coaches and pending invites.
3. Implement invite acceptance for `/invite/[token]`.
4. Add assistant coach invite shortcuts once head coach flow feels right.
5. Add team detail pages after sessions and athlete join codes need a dedicated surface.
6. Add department-managed training locations after teams/facility context is stable.
7. Consider a central attention page once multiple workspaces produce real issues.
