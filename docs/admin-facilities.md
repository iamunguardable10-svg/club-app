# Admin Facility and Department Flows

This document records the current product and implementation decisions for admin-side facility management, department workspaces and duplicate facility handling.

## Admin navigation model

The admin area is not built around a permanent setup tab.

The intended structure is:

```txt
Admin overview
├─ Departments
├─ Facilities
├─ People / Invites
└─ Settings
```

### Principles

- Setup is a temporary onboarding/completion flow, not a permanent main navigation item.
- Overview is the central admin start page after setup has been completed or intentionally skipped.
- Subareas are opened from Overview rather than crowding one large dashboard.
- Admin pages should have a Classic Mode and an Edit Mode when the page contains both reading/monitoring and configuration actions.

## Department workspace

The department workspace is department-focused. It is used by admins and later by department leads.

### Classic Mode

Classic Mode should prioritize readability:

- department title and basic context
- assigned department halls
- team cards
- missing essentials only when action is needed
- inline quick actions only for unresolved essentials, such as missing head coach or missing default facility

### Edit Mode

Edit Mode exposes broader management actions:

- add team
- invite head coach
- set default facility
- add or assign halls
- broader department maintenance

### Department team cards

Team cards use a two-line layout:

```txt
Team name
Head coach · player count · default facility · next session
```

On smaller screens, lower-priority details can collapse or hide. The team name should stay readable and separate from metadata.

## Department hall assignment flow

Adding halls to a department is intentionally subordinate to the assignment flow.

The flow is:

```txt
Add hall to department
├─ First assign existing shared club facilities
│  └─ Multiple existing halls can be selected and assigned in one step
└─ If not listed: create a new hall
   ├─ enter name
   ├─ enter address
   ├─ choose usage scope
   │  ├─ only this department
   │  └─ also other departments / shared request
   └─ save or report depending on role/context
```

### Rules

- If the department has zero halls, the add/assign flow may be visible in Classic Mode to remove setup friction.
- Once at least one hall is assigned, add/assign controls should be shown only in Edit Mode.
- When existing halls are selected and the user additionally creates a new hall, both the selected existing halls and the new hall must be assigned together.
- Creating a new hall must not cause a page reload.

## Facility scope model

Facilities can be either global/shared or department-only.

```ts
scope: 'club_shared' | 'department_only'
owner_department_id: string | null
```

### Shared club facility

A shared club facility:

- belongs to the club
- can be assigned to multiple departments
- appears in the global facilities section
- is selectable in department assignment flows

### Department-only facility

A department-only facility:

- belongs logically to one department
- is not shown as globally selectable to all departments
- can later be converted by the admin into a shared club facility
- is useful for department-specific spots such as parks, outdoor courts, school gyms or small training areas

## Facility Manager structure

The Facility Manager is split into Classic Mode and Edit Mode.

### Classic Mode

Classic Mode shows structure only:

```txt
Global facilities
- shared club facilities

Department facilities
- Department A
  - shared access
  - department-only facilities
- Department B
  - shared access
  - department-only facilities
```

Department sections should be expandable/collapsible to keep large clubs readable.

### Edit Mode

Edit Mode exposes actions:

- create global facility
- assign global facility to departments
- remove department assignments
- convert department-only facility into global/shared facility

## Address-first facility matching

Facility matching must not rely on name alone.

Names are weak identifiers because many clubs and departments can have generic names such as:

- Main Hall
- Court 1
- Gym
- School Gym
- Weight Room

The strongest current matching signals are:

```txt
1. exact normalized address
2. same normalized street
3. name relation as supporting signal only
```

The matching helper lives in:

```txt
src/shared/lib/facilities/matching.ts
```

It currently exposes:

```ts
normalizeText()
normalizeAddress()
normalizeStreet()
findBestFacilityLocationMatch()
getFacilityMatchWarning()
```

### Matching behavior

When a new facility is being created, the app checks existing facilities in the club.

If a possible match exists:

```txt
same exact address
or same street
→ show warning
→ do not auto-merge
→ user/admin must intentionally decide
```

Name is used only as an additional signal:

```txt
same address + same name      = very likely same facility
same address + different name = likely same facility, naming mismatch
same street + same/different name = possible same location, needs review
```

## Admin reaction when creating a global facility

If the admin creates a global facility and the app finds a matching department-only facility, the admin should get an immediate reaction option.

Preferred behavior:

```txt
Possible same facility found
├─ Make existing hall global
├─ Create separate global facility anyway
└─ Cancel / adjust details
```

The primary action should be `Make existing hall global` when the match is based on address or street.

Technically, making an existing hall global means:

```ts
facility.scope = 'club_shared'
facility.owner_department_id = null
```

The old owner department assignment must remain or be created if missing. Additional selected departments may be assigned in the same action.

## Demo facility data

Demo facilities now have structured facility details.

```ts
type DemoFacilityDetails = {
  name: string;
  address: string;
  scope?: 'club_shared' | 'department_only';
  ownerDepartment?: string | null;
};
```

`DemoClubSetup` keeps the old `facilities: string[]` list for backwards compatibility, but the richer source is now:

```ts
facilityDetails?: DemoFacilityDetails[]
```

Old demo setups without addresses are normalized on load and receive inferred addresses so existing browser-only demos do not break.

New demo facility input uses this format:

```txt
Main Hall | Sportstraße 1, Munich
Court 1 | Sportstraße 1, Munich
Court 2 | Sportstraße 1, Munich
Weight Room | Sportstraße 1, Munich
```

## Known follow-up

The demo Facility Manager already uses the newer `facilityDetails` structure.

The demo Department Workspace still has an older local facility meta cache in addition to the new demo setup structure. This should be consolidated so all demo facility address and scope data comes from the same source of truth.

Target follow-up:

```txt
Demo Department Workspace
→ replace old facility-meta cache with DemoClubSetup.facilityDetails
→ keep backwards compatibility for existing localStorage data
```

## Future direction

Later, facilities can become club-independent place entities with their own calendars.

Future model direction:

```txt
Place / Facility identity
├─ name
├─ address
├─ latitude / longitude
├─ place_id / external source
└─ shared calendar visibility
```

That would allow multiple clubs to reference the same physical gym and eventually see cross-club facility availability. This is not part of the current implementation yet.
