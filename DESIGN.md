# Club OS Design Direction

## Inspiration choice

Primary reference:

```txt
Linear
```

Secondary reference:

```txt
Cal.com for calendar clarity
```

Club OS should not become a clone of either product. The intended direction is:

```txt
Linear precision
+ dark sports-operations cockpit
+ Cal.com scheduling clarity
```

## Product feel

Club OS should feel:

- calm
- operational
- fast
- premium
- low-noise
- structurally clear

It should not feel:

- playful for its own sake
- over-colored
- form-heavy
- like a generic Tailwind dashboard
- like a spreadsheet skin

## Product build principle

Club OS is bottom-up, not club-admin-first.

The product must make sense at every layer:

```txt
Athlete alone
-> Coach with one team
-> Department with multiple teams/facilities
-> Club with all departments
```

This affects UI decisions:

- onboarding must not imply the whole club is required before value exists
- team and athlete surfaces must be first-class, not admin leftovers
- department pages should work even if only one department uses the app
- club admin surfaces should aggregate, not duplicate operational work

## UI principles

### 1. One dominant action per surface

Every page should make the main next action obvious.

Secondary actions should be quieter:

```txt
primary button -> filled
secondary button -> subtle border
danger -> only red when the action is destructive
```

### 2. Cards are working surfaces, not decoration

Cards should use:

- dark translucent surface
- restrained border
- small top highlight or accent only where useful
- hover lift only for clickable cards

Avoid heavy gradients on every card.

### 3. Context beats explanation

Where context is known, do not ask again.

Examples:

```txt
Team page       -> team known
Department page -> department known
Facility page   -> facility known
```

Forms should ask only for missing information.

### 4. Compact controls

Dropdowns, quick actions and chips should stay compact unless the user is entering long text.

Do not show:

```txt
label + duplicated value + full-width dropdown
```

Prefer:

```txt
Facility: [Main Hall v]
```

### 5. Warning surfaces only for real problems

No warning-shaped placeholders.

If nothing is wrong:

```txt
Ready
or no setup section at all
```

### 6. Demo and standard parity

Every visible behavior should exist in both:

```txt
/admin/...
/demo/admin/...
```

unless explicitly impossible.

## Animation / walkthrough direction

Later, the most important pages should include small, low-noise walkthroughs.

These should be mini product guides, not marketing animations.

Priority pages:

1. Calendar
2. Team Workspace
3. Staff invites
4. Facility assignment
5. Onboarding setup

Animation rules:

- short
- skippable
- subtle
- respects reduced motion
- teaches one action at a time

Example:

```txt
Calendar guide:
1. Switch to Edit
2. Tap an empty slot
3. Drag to move
4. Resize duration
5. Open session details
```

## Current redesign target

The first redesign pass should focus on shared shell and onboarding quality:

- Admin shell/navigation
- onboarding start gate
- real create-club setup
- demo create-club setup
- shared cards/buttons/fields

Then later pass:

- Overview cards
- Department workspace
- Staff page
- Team workspace
- Facility manager
