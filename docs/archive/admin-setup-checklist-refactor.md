# Admin Setup Checklist Refactor

This document records the refactor that changed Admin Setup from a dashboard-like page into a guided setup checklist.

## Refactored routes

Real:

```txt
/admin/setup
```

Demo:

```txt
/demo/admin/setup
```

## Product decision

The setup page is not the daily admin dashboard.

```txt
/admin/overview = daily admin start page
/admin/setup    = guided setup checklist
```

## Removed from setup mental model

The setup page should not primarily show:

```txt
large count cards
long department lists
long facility lists
static dashboard data
```

Those belong in management pages such as:

```txt
/admin/departments
/admin/facilities
/admin/people
```

## New setup structure

The setup page now uses a checklist model:

```txt
Club profile created
Departments created
Facilities created
Facilities assigned to departments
Department leads invited
Coaches invited
```

Each checklist item links directly to the management page where the action belongs.

## Demo behavior

The demo setup page uses browser-only state:

```txt
localStorage club setup
localStorage facility assignments
```

Clearing local demo data now also clears local facility assignments.

## Real behavior

The real setup page reads from Supabase:

```txt
clubs
departments
facilities
department_facilities
```

Invite-related checklist items are currently incomplete and link to People & Invites.

## Next admin build

The next important admin build is People & Invites.

Needed:

```txt
invite department lead
invite head coach
invite assistant coach
show pending invites
accept invite flow refinement
```
