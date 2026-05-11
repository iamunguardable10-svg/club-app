# Department Card Navigation

This document records the department-card navigation decisions.

## Current behavior

Department cards are clickable as whole cards:

```txt
/admin/departments/[departmentId]
/demo/admin/departments/[departmentName]
```

The explicit `Open department` button was removed to reduce visual clutter.

## Nested actions

The cards contain nested actions that must not trigger the department-card navigation:

```txt
Invite people
Facility chips
```

Behavior:

```txt
Tap department card       → open department detail
Tap Invite people         → open People & Invites with department preselected
Tap facility chip         → open facility calendar
```

Implementation detail:

- Department cards use programmatic navigation on the card.
- Nested actions call `event.stopPropagation()`.
- This avoids invalid nested `<a>` tags and prevents accidental double navigation.

## Facility chips

Facility chips are shown inside the `Facilities` info box, not directly below the department title.

Real route:

```txt
/admin/facilities/[facilityId]/calendar
```

Demo route:

```txt
/demo/admin/facilities/[facilityName]/calendar
```

## Reasoning

This keeps department cards compact but still gives the admin useful context and direct navigation:

```txt
Department → assigned facility → facility calendar
```

The admin can quickly answer:

```txt
Which facilities does this department use?
When is that facility occupied?
```
