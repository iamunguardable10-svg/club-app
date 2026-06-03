# Facility accents and calendar context

This document records the facility color/accent system, the latest Facility Manager UI decisions and the planned calendar-highlighting behavior.

## Why facility accents exist

Facilities can appear in many places:

- global facility list
- department facility list
- shared access inside departments
- department-only hall lists
- department workspace hall chips
- team default facility selectors
- future facility calendars
- future training/session cards

A subtle, stable accent helps users recognize the same hall across screens without making the UI visually noisy.

## Current implementation

Facility accents are deterministic. A facility does not need a stored color field yet.

Current utility:

```txt
src/shared/lib/facilities/accent.ts
```

The utility maps a stable seed to an accent:

```txt
facility.id or facility.name
→ hash
→ accent from fixed palette
```

Current palette:

```txt
emerald
sky
violet
amber
rose
cyan
lime
fuchsia
```

Each accent contains:

```ts
name
hex
softHex
textHex
```

### Why deterministic instead of database-stored colors

For now, deterministic colors are preferred because:

- newly created halls automatically get a color
- no Supabase migration is required
- demo and real mode can use the same logic
- the system stays simple while the product shape is still changing

Later, admins may optionally choose a custom facility color. At that point we can add:

```txt
facilities.accent_color
```

Until then, the generated accent is the source of truth.

## Current UI behavior

The accent system is applied through a lightweight client enhancer:

```txt
src/shared/components/facilities/FacilityAccentEnhancer.tsx
```

It currently enhances facility calendar links and facility checkbox options by adding:

- subtle border color
- soft tinted background
- left inset accent line

For compact default-facility references inside team cards, the enhancer must not apply facility color at all.
Team cards carry team state; facility color is too visually dominant in that context.

Current opt-out attribute for neutral facility links:

```tsx
data-facility-accent-mode="none"
```

The enhancer is mounted in:

```txt
src/shared/admin/AdminShell.tsx
src/app/admin/facilities/page.tsx
src/app/demo/admin/facilities/page.tsx
```

This is necessary because some admin pages use `AdminShell`, while the Facility Manager pages currently render their own page-level `<main>`.

## New facility behavior

Newly created facilities automatically receive an accent because the accent is derived from their ID or name.

This applies to:

- global/shared facilities created from the Facility Manager
- department-only facilities created inside a department section
- facilities created from the department workspace flow
- demo facilities created in local browser state

No extra form field is needed.

## Shared access UI decision

The previous department-level shared-access assignment used this interaction:

```txt
Dropdown → Add → Dropdown → Add → Assign selected
```

This was rejected because it felt clunky and the native dropdown was visually too large.

The current interaction is:

```txt
Shared access
├─ existing assigned shared halls
├─ checkbox cards for all still-available shared halls
└─ Assign selected shared halls
```

Rules:

- The user can select multiple halls directly.
- Already assigned halls are not shown again.
- Department-only halls are not shown in shared access.
- Assigning selected halls happens in one action.
- Existing assignment removal requires confirmation.

This is implemented in both:

```txt
src/features/admin/AdminFacilitiesManager.tsx
src/features/admin/DemoAdminFacilitiesManager.tsx
```

## Address autocomplete UI decision

Geoapify address autocomplete remains active, but the persistent explanatory helper text under the input was removed.

The placeholder is enough:

```txt
Search hall name, venue or address
```

Current enhancer:

```txt
src/shared/components/places/GeoapifyAddressEnhancer.tsx
```

The address field can still search by:

- hall name
- official venue name
- school name
- street address

Important product rule:

```txt
Selecting an address suggestion must not overwrite the internal hall name.
```

The internal hall name remains a separate club-specific label.

## Facility links and context

Facility links should carry context so the future calendar can highlight relevant entries.

Implemented rule:

```txt
If a facility is opened from inside a department-specific card or section,
the link must include that department context even when the facility itself is global/shared.
```

Current intended real route shape:

```txt
/admin/facilities/[facilityId]/calendar?from=departments&departmentId=...
/admin/facilities/[facilityId]/calendar?from=facilities&departmentId=...
/admin/facilities/[facilityId]/calendar?from=team&departmentId=...&teamId=...
```

Current intended demo route shape:

```txt
/demo/admin/facilities/[facilityName]/calendar?from=departments&departmentName=Basketball
/demo/admin/facilities/[facilityName]/calendar?from=facilities&departmentName=Basketball
/demo/admin/facilities/[facilityName]/calendar?from=team&departmentName=Basketball&teamName=U18%20Boys
```

The current enhancer can append best-effort department context to facility calendar links when the surrounding DOM exposes enough department information.

Long-term, explicit React links are preferred over DOM inference.

Current explicit React link coverage:

- Departments overview facility chips pass `departmentId`.
- Department workspace hall cards pass `departmentId`.
- Facility Manager department shared-access rows pass `departmentId`.
- Facility Manager department-only rows pass `departmentId`.
- Demo equivalents pass `departmentName`.

Top-level global facility cards intentionally open the full facility view without department context.

### Coach facility context

Coach-scoped facility links carry role context instead of falling back into admin navigation.

Current real route shape:

```txt
/coach/facilities/[facilityId]/calendar?from=coachFacilities&teamIds=...&departmentIds=...
/coach/facilities/[facilityId]/calendar?from=coachTeam&teamId=...&departmentId=...
```

Current demo route shape:

```txt
/demo/coach/facilities/[facilityName]/calendar?from=coachFacilities&teamNames=...&departmentNames=...
/demo/coach/facilities/[facilityName]/calendar?from=coachTeam&teamName=...&departmentName=...
```

Structural parity rule:

```txt
real: teamIds / departmentIds
demo: teamNames / departmentNames
```

The real route uses IDs and the demo route uses names, but the parameter structure should otherwise stay aligned.

Authoritative shape:

- real routes define the parameter shape
- demo routes mirror the same parameters using names instead of IDs
- any new context parameter must be added to both real and demo route shapes in the same change

Behavior:

- every assigned coach team using the facility is highlighted as primary context
- the related department context is highlighted more lightly
- the page keeps coach role navigation instead of showing admin facility back-links
- if the coach can create sessions for at least one team in the facility context, edit/create mode stays available
- if multiple teams are possible, no single team is silently preselected; the edit sheet must ask

Permission rule:

- URL context controls highlighting and default UI state only.
- Write permission must be derived from server-side memberships and assignments, not from `teamIds`, `departmentIds`, `teamNames` or `departmentNames` query parameters.
- Open enforcement requirement: facility calendar create/edit routes must verify manageable teams from membership data before writes. URL parameters are never sufficient evidence of permission.

This avoids the previous failure mode where a coach opened a hall calendar and only one of several assigned teams was highlighted.

## Planned calendar highlighting behavior

When facility calendars are built properly, they should read URL context and highlight accordingly.

### From Facility Manager department section

Example:

```txt
/admin/facilities/main-hall/calendar?from=facilities&departmentId=basketball
```

Calendar behavior:

- facility accent is used in header and event borders
- sessions for the selected department are highlighted
- sessions from other departments are visible but visually quieter
- if the facility is department-only, only the owner department's events are relevant

### Role-aware default highlighting in facility calendars

The facility calendar should become smarter even without explicit URL context:

- club admin: starts with a full facility view and can filter by department first, then by team inside that department
- department lead: automatically highlights own department sessions and can further narrow to teams in that department
- coach: automatically highlights own department and own team sessions

This applies only to facility calendars. Team, coach and athlete calendars will be separate contextual views over the same sessions.

Filter behavior:

```txt
department filter selected
-> matching department sessions become primary
-> other departments remain visible but quieter

team filter selected within that department
-> selected team sessions become primary
-> other teams in same department become secondary
-> other departments stay dimmed
```

### From Department page

Example:

```txt
/admin/facilities/main-hall/calendar?from=departments&departmentId=basketball
```

Calendar behavior:

- selected department's times are highlighted
- other departments may be shown if the hall is shared
- department-only halls should feel local to that department

### From Team card or default facility

Example:

```txt
/admin/facilities/main-hall/calendar?from=team&departmentId=basketball&teamId=u18
```

Calendar behavior:

- selected team's events are most prominent
- other teams in the same department are secondary
- other departments are dimmed

## Future implementation steps

### 1. Replace DOM context inference with explicit props/links

Current enhancement is intentionally lightweight. It should later be replaced by explicit links in the React components.

Target:

```tsx
<Link href={`/admin/facilities/${facility.id}/calendar?from=departments&departmentId=${department.id}`}>
```

For demo:

```tsx
<Link href={`/demo/admin/facilities/${facility.name}/calendar?from=departments&departmentName=${departmentName}`}>
```

### 2. Create a shared FacilityChip component

A reusable component should own accent rendering and calendar linking.

Target component:

```txt
FacilityChip
```

Props:

```ts
facilityId?: string
facilityName: string
address?: string | null
scope?: 'club_shared' | 'department_only'
departmentId?: string
departmentName?: string
teamId?: string
teamName?: string
from: 'facilities' | 'departments' | 'team'
mode: 'real' | 'demo'
```

Used by:

- Facility Manager global list
- Facility Manager shared access
- Facility Manager department-only list
- Department workspace hall chips
- Team default facility display

### 3. Create a shared FacilityOption component

Checkbox rows for assigning facilities should use the same accent logic.

Target component:

```txt
FacilityOption
```

Used by:

- global assignment tools
- per-department shared access assignment
- department workspace assignment flow

### 4. Build real calendar context parsing

Future calendar pages should parse:

```txt
from
departmentId / departmentName
teamId / teamName
```

Then apply:

```txt
selected team highlight
selected department highlight
facility accent styling
other events dimmed
```

### 5. Store manual accent overrides later

When needed, add:

```txt
facilities.accent_color
```

Admin UI could then allow:

```txt
Auto color
Emerald
Sky
Violet
Amber
...
```

Until this is needed, deterministic accents are sufficient.

## Current known limitations

- Facility accents are currently applied partly through a DOM enhancer. This is acceptable short-term but should become explicit React components.
- Department context in links is best-effort where explicit IDs are not present in the DOM.
- Demo mode can pass department names; real mode should prefer IDs.
- Searchable combobox for many facilities is still a future improvement. Current shared-access selection uses checkbox cards.
