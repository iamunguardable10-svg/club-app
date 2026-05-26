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

## Third implementation pass

Scope:

- overview cards
- departments overview
- staff overview
- department workspace copy density
- facility manager header copy
- admin calendar empty copy
- demo setup copy density

Decision:

The interface should not explain itself when the layout already makes the action obvious.

Removed or reduced:

- generic hero descriptions
- overview card explanations
- warning helper paragraphs
- repeated demo/browser-only disclaimers
- instructional microcopy inside obvious action panels
- placeholder subtitles like "No sport label set"

Keep text only when it does one of these jobs:

- names an object
- shows status
- explains a destructive or irreversible action
- clarifies a permission or auth blocker
- helps choose between similar actions

Linear-inspired rule:

Dense admin UI should be navigated through hierarchy, spacing, state, and compact controls. Explanatory prose is a fallback, not the default.

## getdesign.md reference

The Linear reference was downloaded locally with:

```txt
npx getdesign@latest add linear.app
```

It lives at:

```txt
linear.app/DESIGN.md
```

The root `DESIGN.md` stays Club OS-specific. The Linear file is used as an external reference, not copied over wholesale, because Club OS needs sport-operation semantics, facility accents, warnings and role states that Linear marketing design does not cover.

Applied rules from the Linear reference:

- near-black canvas as the anchor surface
- restrained surface ladder instead of decorative gradients
- hairline borders for hierarchy
- compact buttons and inputs
- scarce accent color usage
- text reduction where layout/state already communicates the action
- product UI should do the explanatory work

Not applied literally:

- single lavender-only accent, because Club OS needs semantic status, destructive states and facility color coding
- marketing-page screenshot rhythm, because our current surfaces are product admin surfaces, not landing sections
- proprietary Linear fonts; we stay on the current font stack for now

## Bottom-up product rule

The app is not only a club-admin setup tool.

Design and copy should support this adoption ladder:

```txt
Athlete alone
-> Coach and team
-> Department
-> Whole club
```

Implications:

- onboarding may create club structure, but should not frame value as club-only
- coach and athlete views must be viable standalone surfaces
- admin views should aggregate operational data instead of becoming the place where training work happens
- Teams, Facilities and Calendar UI must stay reusable across athlete, coach, department and admin contexts

## Onboarding redesign pass

The visible onboarding entry is now bottom-up.

Changed:

- `/onboarding` no longer frames club creation as the only first step
- `/demo` no longer redirects directly into club setup
- real and demo onboarding both expose Athlete, Coach, Department and Club entry points
- club setup now has an explicit Lean start vs Team-ready setup mode
- team-code join is exposed as an athlete entry path

Detailed notes: `docs/bottom-up-onboarding-v1.md`.

## Facilities redesign pass

Scope:

- real facility manager
- demo facility manager
- onboarding copy for bottom-up framing
- create-club start gate

Changes:

- moved facility manager surfaces closer to OS surface classes
- reduced green/violet-heavy visual treatment
- shortened labels and empty states
- kept all existing create, assign, promote, delete and department-only flows intact
- kept demo and Supabase-backed versions aligned
