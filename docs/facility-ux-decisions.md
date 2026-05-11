# Facility UX Decisions

This note documents the latest facility-management UX changes.

## Dashboard facility cards

Facility cards on both dashboards are clickable as whole cards:

```txt
/admin/setup
/demo/admin/setup
```

The explicit `Calendar →` label and `Tap to open calendar` helper text were removed from dashboard facility cards.

Decision:

- The card styling, border state and hover/active state should communicate clickability.
- The UI should stay calm on mobile.
- The admin should not need a large CTA inside every facility card.

## Facility manager calendar links

Facility cards and assignment rows in the facility manager still link to calendar placeholders, but the explicit `Calendar →` text was removed.

Routes:

```txt
/admin/facilities/[facilityId]/calendar
/demo/admin/facilities/[facilityName]/calendar
```

Decision:

- Facility names/cards act as the link.
- Avoid redundant arrow labels.
- Keep the page focused on creating and assigning facilities.

## Creating facilities with assignments

When creating a new facility, the user can now immediately choose departments for that facility.

Implemented for:

```txt
/admin/facilities
/demo/admin/facilities
```

Decision:

- Admin should not need to create a facility first and then assign it in a separate step.
- Creation and initial assignment belong together.
- Existing facilities can still be assigned later in the separate assignment section.

## Product principle

Facility management should minimize friction:

```txt
Create facility
→ choose departments immediately if known
→ save
```

But it should also support later cleanup:

```txt
Existing facility
→ assign more departments
→ remove assignments
```
