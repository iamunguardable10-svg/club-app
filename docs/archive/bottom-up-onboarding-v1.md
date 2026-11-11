# Bottom-up onboarding v1

Club OS must not start by assuming the whole club is ready to adopt.

The onboarding ladder is:

```txt
Athlete
-> Coach / Team
-> Department
-> Club
```

## Entry points

`/onboarding` is now the canonical real onboarding entry.

It offers four starting points:

- Athlete: personal load, availability and calendar
- Coach: today cockpit, attendance and team load
- Department: teams, coaches and facilities
- Club: full club setup

The Club path still routes through:

```txt
/onboarding/create-club/start
-> auth gate
-> /onboarding/create-club
```

## Demo parity

`/demo` mirrors the same mental model:

- Athlete preview
- Coach preview
- Department demo
- Club setup demo

The demo does not redirect straight into club setup anymore. This prevents the product from feeling admin-first.

## Club setup mode

The club setup form now starts with a setup-depth choice:

- Lean start: create club, departments and facilities only
- Team-ready: also create first teams for one department

This keeps the existing Supabase RPC and local demo storage intact while making the adoption path explicit.

## Future onboarding build-out

The next functional layers should be implemented in this order:

1. Athlete solo setup: create profile, sport, load scale and reminder preference.
2. Athlete team-code join: preview team, auth gate, create athlete membership.
3. Coach team setup: create one team, invite athletes, set default facility.
4. Department setup: import or create teams, assign facilities, invite coaches.
5. Club setup: aggregate departments and admin governance.

Rule: each layer must be useful without requiring the layer above it.
