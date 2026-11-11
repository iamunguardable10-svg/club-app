# Admin Overview Implementation

This document records the implementation step that introduced the Admin Overview structure.

## Implemented routes

Real admin:

```txt
/admin/overview
/admin/people
/admin/settings
```

Demo admin:

```txt
/demo/admin/overview
/demo/admin/departments
/demo/admin/people
/demo/admin/settings
```

Existing routes remain:

```txt
/admin/setup
/admin/departments
/admin/facilities
/demo/admin/setup
/demo/admin/facilities
```

## Admin shell

Added shared admin navigation:

```txt
src/shared/admin/AdminShell.tsx
```

Navigation structure:

```txt
Overview
Setup
Departments
Facilities
People
Settings
```

The shell supports both real and demo paths.

## Overview purpose

The overview is now the admin landing page and should act as a calm control center.

It is not intended to show long department, facility, team or people lists.

It contains:

```txt
Header
Needs Attention
Management Areas
Setup Checklist
```

## Removed mental model

The overview should not be built around pure count cards such as:

```txt
3 Departments
5 Facilities
12 Teams
```

The admin usually already understands the club structure. Counts can be secondary context later, but not the main UI.

## Management areas

The overview links to major admin areas:

```txt
Departments
Facilities
People & Invites
Settings
```

These are navigation cards, not data cards.

## Routing change

Club admins are now routed to:

```txt
/admin/overview
```

instead of:

```txt
/admin/setup
```

Demo club creation now routes to:

```txt
/demo/admin/overview
```

Real club setup now routes to:

```txt
/admin/overview
```

## Setup role

`/admin/setup` remains available, but its product role changes:

```txt
/admin/overview = daily admin start page
/admin/setup    = guided setup and onboarding continuation
```

## Placeholder routes

People and Settings are placeholder pages for now so navigation does not lead to dead routes.

The next real admin build should likely be:

```txt
/admin/departments
/demo/admin/departments
```

or the People & Invites flow, depending on the next product priority.
