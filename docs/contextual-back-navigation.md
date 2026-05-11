# Contextual Back Navigation

This document records the contextual back navigation pattern for Admin facility calendars.

## Problem

A facility calendar can be opened from different places:

```txt
/admin/facilities
/admin/departments
/admin/overview later
```

The back link should return the admin to the area they came from, not always to the facility manager.

## V1 solution

Facility calendar routes now support a `from` query parameter:

```txt
/admin/facilities/[facilityId]/calendar?from=departments
/demo/admin/facilities/[facilityName]/calendar?from=departments
```

Back-link behavior:

```txt
from=departments → back to Departments
from=overview    → back to Overview
missing/unknown  → back to Facilities
```

## Current usage

Department facility chips now link with context:

```txt
/admin/facilities/[facilityId]/calendar?from=departments
/demo/admin/facilities/[facilityName]/calendar?from=departments
```

This means:

```txt
Department card → Facility chip → Facility calendar → Back to Departments
```

## Why not only router.back()

`router.back()` depends on browser history and can behave poorly when:

```txt
page is opened directly
page is refreshed
mobile browser history is unusual
user opens a link in a new tab
```

Explicit context through `from` gives predictable navigation while still remaining simple.

## Future extension

The same pattern can be used later for:

```txt
from=department-detail
from=team-session
from=coach-session
from=overview
```

If more context is needed, we can add precise return paths later, for example:

```txt
returnTo=/admin/departments/<departmentId>
```

For now, the simple `from` enum is enough.
