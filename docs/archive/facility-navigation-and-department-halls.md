# Facility Navigation and Department Hall Overview

This note documents the navigation and department workspace changes after testing revealed that facility pages sometimes returned to setup instead of the originating admin area.

## Problem found during testing

The facility manager pages had hardcoded setup back links:

```txt
/admin/facilities      -> /admin/setup
/demo/admin/facilities -> /demo/admin/setup
```

This was wrong because setup is not the persistent admin hub anymore.

## Implemented navigation fix

Facility manager pages now use contextual back targets.

Real:

```txt
/admin/facilities
/admin/facilities?from=departments
```

Demo:

```txt
/demo/admin/facilities
/demo/admin/facilities?from=departments
```

Behavior:

```txt
from=departments -> back to Departments
no from          -> back to Overview
```

Facility calendar links from the facility manager now explicitly preserve source context:

```txt
/admin/facilities/[facilityId]/calendar?from=facilities
/demo/admin/facilities/[facilityName]/calendar?from=facilities
```

Department workspace facility links preserve department context:

```txt
/admin/facilities/[facilityId]/calendar?from=departments
/demo/admin/facilities/[facilityName]/calendar?from=departments
```

## Department workspace hall overview

The department workspace now contains a dedicated Facilities / Department halls section above the Teams section.

Real route:

```txt
/admin/departments/[departmentId]
```

Demo route:

```txt
/demo/admin/departments/[departmentName]
```

The section shows:

```txt
Assigned hall count
Clickable hall cards
Calendar link per hall
Empty state with Assign facilities action
```

If no halls are assigned, the user can go to the facility manager with department context:

```txt
/admin/facilities?from=departments
/demo/admin/facilities?from=departments
```

## Product rationale

Department pages should show the facilities that belong to that department because these halls affect team defaults and later session creation.

The page should not require the user to leave the department context just to understand which halls the department can use.

## Follow-up

The same contextual navigation principle should next be applied systematically from the admin overview page into:

```txt
Departments
Department detail
Facilities
Facility calendars
People / Invites
Settings
```
