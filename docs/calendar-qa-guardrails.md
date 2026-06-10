# Calendar QA guardrails

This document exists because calendar bugs are expensive in Club OS. A calendar
change is not done when it compiles. It is done when the main user paths work on
desktop and mobile.

## Why this guardrail exists

Recent regressions showed the same pattern:

- time fields looked acceptable on desktop but were oversized on mobile
- week navigation state did not always match the week the user expected
- inline editors created nested "fields inside fields" surfaces
- confirmed Series sessions were created but not made visible in the Week calendar immediately

Root cause:

```txt
too many visual assumptions
too little explicit interaction QA
```

Required fix in our process:

```txt
define calendar success criteria
change the smallest code path
verify mobile + desktop interaction paths
then push
```

## Required calendar test matrix

Run this mentally at minimum, and with browser/mobile QA when the change touches layout or pointer interaction. The mechanical release gate remains `npm.cmd run check:review`, but that gate does not replace interaction QA.

### Viewports

- mobile narrow: 375px width
- mobile large: 430px width
- tablet: 768px width
- desktop: 1280px+ width

### Calendar surfaces

- Athlete calendar
- Team calendar
- Coach calendar
- Facility calendar
- Department schedule calendar (planned — skip until built)

Note:

- Existing surfaces must be checked directly.
- Planned surfaces only apply once built. Do not pretend a missing Department schedule or future calendar surface was verified.

If a change only targets one surface, verify it did not fork shared behavior away from the others.

### Interaction paths

#### View mode

- tap existing session opens detail overlay
- page scroll does not create drafts
- no hidden horizontal scroll unless the feature explicitly needs it
- week/day controls show the expected week/day

#### Edit mode

- tap empty slot creates a draft only in edit mode
- draft can move vertically
- draft can move to another day when the view supports it
- draft can resize
- existing manageable session can move
- existing manageable session can resize
- unmanaged sessions remain visible but not draggable
- delete requires app-owned confirmation dialog

#### Session edit/detail

- detail overlay is read-oriented
- edit controls are compact
- start time field fits on mobile
- duration control fits on mobile
- facility selector appears once
- participant/group changes happen only in edit mode
- background scrolling is locked while modal/overlay is open

#### Week navigation

- previous week changes all rendered days and sessions
- next week changes all rendered days and sessions
- current week resets to the current week
- after batch confirmation, the user sees the week where sessions were created

## Series planner QA

Series planner has two different objects:

```txt
Series template -> reusable rule
Confirmed session -> concrete calendar event
```

Checks:

- creating/editing a template does not create a session
- unchecking a template means no session for that week
- `Confirm week` creates concrete sessions
- created sessions appear in Week calendar immediately
- facility conflicts block or route through the conflict dialog
- athletes see only concrete sessions, never raw templates
- demo localStorage and Supabase-backed flows expose the same product behavior

## Senior-engineering rule for calendar work

Do not ship calendar changes that are only visually inspected in one happy path.

A calendar change must state:

1. what surface changed
2. what interaction path changed
3. what viewports were considered
4. what could regress
5. what the user should test after deploy

If this cannot be stated, the change is not ready.
