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
- If an admin creates a hall from a department context, the app should create or assign directly. It should not create a request for the admin to review.
- If a department lead reports a potentially shared hall, that should become a structured facility request for the admin.

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
- can be assigned from the global edit tools or directly from a department section in the Facility Manager

### Department-only facility

A department-only facility:

- belongs logically to one department
- is not shown as globally selectable to all departments
- can later be converted by the admin into a shared club facility
- is useful for department-specific spots such as parks, outdoor courts, school gyms or small training areas
- can be created directly inside a department section in the Facility Manager Edit Mode

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
- assign shared/global facilities directly inside a department section
- create department-only facilities directly inside a department section

Edit tools should appear near the top of the page, before the long facility lists:

```txt
Header
├─ Facility requests, if any
├─ Global create / global assignment tools
├─ Global facilities list
└─ Department facilities list
```

## Per-department editing inside the Facility Manager

The Facility Manager should support department-focused editing directly inside each expandable department section.

This is separate from the global edit tools at the top of the page. The global tools answer the question:

```txt
Which global facility do I want to create or assign?
```

The per-department tools answer the question:

```txt
What does this specific department still need?
```

### Shared access assignment

Inside each department section, the `Shared access` box supports assigning additional shared club facilities.

The UI should stay compact. It should not render a long checkbox list for every department.

Current interaction model:

```txt
Shared access
├─ already assigned shared halls
├─ dropdown: Select shared club facility
├─ Add
├─ selected queue: Hall A, Hall B, ...
└─ Assign selected shared halls
```

Rules:

- Only `club_shared` facilities are available in this dropdown.
- Already assigned shared halls are not shown as assignable again.
- Halls already added to the local queue are not shown again.
- The user can queue multiple shared halls and assign them in one action.
- Removing an existing shared assignment must require confirmation.

The current dropdown is a standard select, not yet a searchable combobox. If clubs grow to many facilities, this should become a proper search combobox later.

### Department-only creation

Inside each department section, the `Department-only` box supports creating a new local hall for that department.

Current interaction model:

```txt
Department-only
├─ existing department-only halls
├─ name input
├─ address input
└─ Create department-only hall
```

Saving creates:

```ts
facility.scope = 'department_only'
facility.owner_department_id = department.id
```

The created hall should also be assigned to the owning department through `department_facilities`, so it appears immediately in the department's facilities and can later be used as a team default facility.

Department-only halls must not appear in the global facilities list or in other departments' shared access dropdowns.

### Promote department-only to global

Each department-only hall keeps the admin action:

```txt
Make global
```

Promoting it should:

```ts
facility.scope = 'club_shared'
facility.owner_department_id = null
```

The old owner department should remain assigned. Additional departments can then be assigned from global tools or per-department shared access controls.

## Facility requests

Facility requests are structured records, not free-text activity events.

```txt
facility_requests
├─ club_id
├─ department_id
├─ requested_by
├─ facility_name
├─ facility_address
├─ status: open | approved | rejected
├─ rejection_reason
├─ created_facility_id
├─ reviewed_by
└─ reviewed_at
```

### Visibility

Open requests are visible in:

```txt
Admin overview
Facility Manager
```

The Overview should show them only under `Meldungen / Facility requests`, not duplicated under `Needs attention`.

### Admin review flow

When reviewing a request, the admin can:

- adjust facility name
- adjust address
- approve by creating a new shared/global facility
- approve by using or promoting a matching existing facility
- select additional departments in the final approval step
- reject the request, optionally with a reason

After approve or reject, the screen should update immediately without requiring a manual page reload.

## Address autocomplete

Address inputs are enhanced globally through Geoapify.

The current shared enhancer is:

```txt
src/shared/components/places/GeoapifyAddressEnhancer.tsx
```

It enhances address-like inputs based on known placeholders. Current supported placeholders include:

```txt
Street, city
Search venue name or address
Address
```

The `Address` placeholder was added so the new department-only address fields in the Facility Manager are also enhanced.

### Important UI rule

Facility name and address should stay separate.

Geoapify may suggest an official place or venue name, but selecting a suggestion should fill the address field. It should not automatically overwrite the internal hall name. The app may show a hint such as:

```txt
Official place selected: <place name>. Internal hall name was not changed.
```

This keeps the club's internal naming flexible while still storing a more reliable physical location.

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

Legacy demo facility metadata from `club-app.demo.facility-meta` should be migrated into `DemoClubSetup.facilityDetails` when loading local demo state.

New demo facility input uses this format:

```txt
Main Hall | Sportstraße 1, Munich
Court 1 | Sportstraße 1, Munich
Court 2 | Sportstraße 1, Munich
Weight Room | Sportstraße 1, Munich
```

## Known follow-up

### Searchable facility selection

The per-department shared-access assignment currently uses a standard dropdown plus queue.

This is acceptable for small and medium clubs, but if a club has many facilities, the dropdown should become a searchable combobox:

```txt
Search shared club facility...
→ filtered results
→ add to queue
→ assign selected
```

### Unified address input component

Address autocomplete is currently applied globally through `GeoapifyAddressEnhancer` by scanning inputs.

A later cleanup could replace this implicit placeholder-based enhancement with an explicit shared component:

```txt
FacilityAddressInput
```

That component should be used by:

- global facility creation
- department-only facility creation
- facility request approval
- department workspace hall creation

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
