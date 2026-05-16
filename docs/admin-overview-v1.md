# Admin Overview V1

This document records the V1 direction for the Admin Overview page.

## Core decision

The Admin Overview is not a duplicate of Departments, Facilities or Staff.

It is the club-level start page and should only show high-level status by area.

```txt
Admin Overview
→ high-level warning cards and navigation

Departments
→ department cards and department-specific setup warnings

Department workspace
→ concrete team and department actions

Facilities
→ hall management and facility requests

Staff
→ roles, coaches and invites
```

## Overview card model

The overview is structured as four primary cards:

```txt
Departments
Facilities
Staff
Settings
```

Each card contains:

```txt
title
description
primary link
optional high-level warning
fallback status when no warning is active
```

The card warning is intentionally broad. It should tell the admin that the area needs attention, not list every specific issue.

## No duplicate detailed warnings

Detailed department/team/facility warnings must stay on the relevant page.

Examples:

```txt
No default facility on U16 Boys
→ Department workspace / team card

Basketball has no assigned halls
→ Departments page / Basketball card

Facility request for Main Hall
→ Facilities page / request inbox
```

The overview may summarize these as:

```txt
Departments: 2 departments need setup
Facilities: 1 facility request open
Staff: 3 department leads missing or not invited
```

## Current warning areas

### Departments

High-level examples:

```txt
No departments created yet
X departments need hall setup
```

The action points to:

```txt
/admin/departments
/demo/admin/departments
```

### Facilities

High-level examples:

```txt
No facilities created yet
X facilities unassigned
X facility requests open
```

The action points to:

```txt
/admin/facilities?from=overview
/demo/admin/facilities?from=overview
```

### Staff

High-level examples:

```txt
X department leads missing or not invited
```

For now, the action points to Departments because department lead invite quick actions are already there.

Later, once Staff V1 is built, the action should point to:

```txt
/admin/people
/demo/admin/people
```

or a future route:

```txt
/admin/staff
/demo/admin/staff
```

### Settings

No active warning is implemented yet.

Future possible settings warnings:

```txt
club profile incomplete
missing timezone
missing season configuration
missing default invite expiry
```

## Ignore / dismiss behavior

Overview warnings can be ignored.

Ignoring a warning means:

```txt
hide this overview-level summary warning
keep the underlying issue visible on the relevant detail page
```

It does not solve the issue and it does not delete any data.

Current storage:

```txt
Demo:
club-app.demo.overview-dismissed-warnings

Real:
club-app.admin.overview-dismissed-warnings:<clubId>
```

This is currently localStorage-based and user/browser-local.

Long-term, dismissed warnings should move to Supabase:

```txt
warning_dismissals
├─ id
├─ club_id
├─ user_id
├─ warning_key
├─ scope_type
├─ scope_id
├─ dismissed_until
├─ dismissed_permanently
└─ created_at
```

## Reset ignored warnings

If any overview warnings are ignored, the page shows:

```txt
Reset ignored warnings
```

This clears the ignored overview warnings in local storage and shows active warnings again.

## Current implementation

Real:

```txt
src/features/admin/AdminOverview.tsx
```

Demo:

```txt
src/features/admin/DemoAdminOverview.tsx
```

Current route files:

```txt
src/app/admin/overview/page.tsx
src/app/demo/admin/overview/page.tsx
```

## Future recommendations

1. Move warning calculation into shared helpers instead of keeping it in page components.
2. Introduce typed warning keys and scopes.
3. Store warning dismissals in Supabase for real users.
4. Add Staff V1 and then route staff warnings to Staff instead of Departments.
5. Add settings warnings only when there are real settings that can be incomplete.
6. Avoid adding team-level detail warnings to Overview.
