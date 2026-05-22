# UI Redesign V1

This document records the current redesign direction before broader UI work.

## Source of inspiration

We use the `getdesign.md` idea as a source of design analysis, with this choice:

```txt
Primary inspiration: Linear
Secondary inspiration: Cal.com for scheduling/calendar clarity
```

The product should still feel like Club OS:

```txt
dark sports operations system
not generic SaaS
not a Linear clone
```

## Why Linear fits Club OS

Club OS is operational software:

- departments
- teams
- facilities
- staff responsibilities
- calendars
- attendance
- load

The UI should therefore optimize for:

- clarity
- precision
- low visual noise
- compact controls
- predictable hierarchy

Linear's design language is a good reference because it keeps dense operational surfaces calm.

## Why Cal.com is secondary

The calendar is becoming a central primitive.

Cal.com is useful as a scheduling reference for:

- direct manipulation
- clear time blocks
- fast creation flows
- readable booking surfaces

But the Club OS calendar stays our own Untis-style operational calendar.

## Redesign principles locked for now

### 1. Shared design tokens first

Do not redesign page-by-page with unrelated Tailwind one-offs.

Use shared classes/components for:

- page shell
- panels
- hero cards
- buttons
- fields
- metrics

### 2. Reduce color noise

Use color to encode:

- mode
- facility accent
- warning
- destructive action
- primary action

Do not color every card differently.

### 3. Keep controls compact

Especially:

- facility selectors
- invite/copy actions
- calendar edit/view toggle
- setup quick actions

### 4. Onboarding must feel product-worthy

The onboarding flow is a product surface, not a temporary form.

It should:

- explain the club structure
- show setup progress
- support lean setup
- avoid long unsupported copy
- work on mobile

### 5. Future walkthroughs

Important pages should later include mini walkthroughs/slideshows:

- calendar usage
- session creation
- staff invite flow
- facility assignment
- team setup

These should be small instructional overlays, not heavy marketing carousels.

## First implementation pass

Scope:

- root `DESIGN.md`
- shared global design utility classes
- AdminShell polish
- real onboarding start page
- real create-club page
- demo create-club page

Out of scope for this pass:

- reworking every admin page
- changing data model
- replacing calendar internals
- building walkthrough animations

## Second implementation pass

Scope:

- real admin overview
- demo admin overview
- real departments overview
- demo departments overview
- real staff page
- demo staff page

Changes:

- moved these surfaces onto the shared `os-hero`, `os-section`, `os-panel-soft` and `os-metric` visual system
- reduced heavy gradients and mixed card treatments
- kept warning/quick-action logic unchanged
- kept demo and Supabase-backed admin flows visually aligned
- kept Staff card/grid structure instead of table-style layouts

Out of scope for this pass:

- changing invite permissions
- changing staff data model
- changing calendar behavior
- changing team workspace internals

## Redesign rule for future work

Every admin surface should first ask whether an existing OS class or shared component can be reused.

New one-off Tailwind structures are allowed only when the surface has a genuinely new interaction pattern. This keeps later Team, Coach and Athlete work recyclable instead of creating another visual branch.
