---
name: club-os
description: Applies Club OS product, engineering, UI/UX, onboarding, and deployment rules for the club-app repository. Use when working on Club OS / club-app, especially admin, department, team, staff, facility, calendar, onboarding, athlete, coach, Supabase, demo parity, or UI redesign tasks.
---

# Club OS

## Core product model

Club OS is bottom-up, not club-admin-first.

Adoption ladder:

```txt
Athlete alone
-> Coach with one team
-> Department with multiple teams/facilities
-> Club with all departments
```

Every layer must be useful without requiring the layer above it.

Primary structure:

```txt
Club
-> Departments
-> Teams
-> Staff / Facilities / Schedule
```

The app must work if only one department uses it.

## Non-negotiable working rules

- Do not remove functionality during UI work.
- Keep demo and Supabase-backed standard flows aligned.
- Consider desktop and mobile in the same pass.
- Prefer reusable components for calendars, facility chips, staff actions, team surfaces, and onboarding steps.
- Avoid browser/native confirms; use app-owned confirmation UI.
- Validate with `npm.cmd run typecheck` and `npm.cmd run build` before release.
- If `next-env.d.ts` changes after build, revert it before commit.
- When user asks to push/deploy, push to GitHub and verify production reachability or Vercel READY when possible.

## UI/UX rules

The UI should feel like an operating system for sports operations: dense, calm, clear, and role-aware.

- Remove text that does not help a user decide or act.
- One dominant action per surface.
- Warnings appear only for real blockers.
- Use hierarchy, spacing, state, and compact controls before explanatory prose.
- Facility colors are supporting metadata, not decoration.
- In team cards, default facility should be neutral or a very subtle chip; never tint the whole team card.
- Calendar UX must separate view mode and edit/create mode, especially on mobile.
- Mobile calendar interactions must avoid accidental session creation while scrolling.

## Role surfaces

Athlete:
- personal load
- availability
- own calendar
- session feedback

Coach:
- today cockpit
- team calendar
- attendance
- team/player load
- groups
- invites for own team staff and athletes

Department lead:
- multiple teams
- coaches
- facilities
- department calendar context

Club admin:
- overview and governance
- departments
- shared facilities
- staff/invites
- setup health

## Onboarding rule

Onboarding must expose multiple first steps:

- Athlete joins/tracks alone
- Coach creates or manages one team
- Department starts with its own teams/facilities
- Club admin creates full club structure

Club setup is one path, not the default product story.

## Facility and calendar rules

- Facility links should carry context: department/team/source.
- Facility calendar highlights should depend on context and role.
- Team calendar is the same calendar engine filtered to one team.
- Session detail should open as an overlay, not as content below the calendar.
- Coaches should see other sessions in the same facility as ghost/conflict context while editing.

## Communication rule

Be direct. If a change is too small to satisfy the user request, say so before calling it done.
