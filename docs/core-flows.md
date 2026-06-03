# Core Product Flows

## Philosophy

The product should revolve around operational workflows, not isolated screens.

The central object is the session.

Everything connects to:

- sessions
- attendance
- availability
- load
- team operations

---

# Flow 1 — Club Setup

## Actor

Club Admin

## Flow

1. Admin creates club.
2. Admin creates first department.
3. Admin creates first team.
4. Admin invites coaches.
5. Admin optionally creates facilities.
6. Club workspace becomes operational.

## Important UX principle

The admin should be guided step-by-step.

Do not expose complex setup screens immediately.

---

# Flow 2 — Coach Invite

## Actor

Club Admin

## Flow

1. Admin selects role.
2. Admin generates invite.
3. Coach receives invite link.
4. Coach creates account or logs in.
5. Membership is created automatically.
6. Coach lands inside coach workspace.

---

# Flow 3 — Athlete Invite

## Actor

Coach

## Flow

1. Coach opens team.
2. Coach generates athlete invite.
3. Athlete opens invite.
4. Athlete creates account.
5. Athlete automatically joins correct team.
6. Athlete lands in athlete workspace.

## Key principle

Athletes should not manually search for teams.

The flow must be extremely simple.

---

# Flow 4 — Session Planning

## Actor

Coach

## Flow

1. Coach creates session.
2. Coach selects:
   - team
   - date
   - time
   - facility/location
   - type
3. Session appears in athlete calendars.
4. Athletes can report availability.

## Current UX rule

Calendar planning is governed by `docs/calendar-session-blueprint-v1.md`: place the session draft spatially first, then open the compact edit sheet only for missing context such as team, facility, type and groups.

---

# Flow 5 — Availability Reporting

## Actor

Athlete

## Flow

Athlete selects:

- expected
- late
- maybe
- no

Optional:

- reason
- late minutes
- note

## UX principle

This action should take under 10 seconds.

---

# Flow 6 — Coach Today Workflow

## Actor

Coach

## Flow

Coach opens app and immediately sees:

- next session
- expected players
- late players
- maybe players
- absent players
- reasons
- load alerts

Coach can then:

- adjust session
- contact players
- finalize attendance

Current navigation rule:

Coach Today is not a team list. Team launchers live in the Coach Teams page and open Team Workspace. Today is for same-day session decisions only.

## Key principle

The coach dashboard is a decision surface.

Not an analytics dashboard.

---

# Flow 7 — Attendance Finalization

## Actor

Coach

## Flow

After session:

1. Coach finalizes attendance.
2. Coach confirms:
   - present
   - late
   - partial
   - excused absent
   - unexcused absent
3. Final participation becomes source of truth.
4. Load and analytics build from final participation.

---

# Flow 8 — Load Submission

## Actor

Athlete

## Flow

After session:

1. Athlete submits RPE.
2. Athlete submits duration.
3. Load entry is created.
4. Coach can view trends and alerts.

## V1 note

Advanced analytics are not required in V1.

The architecture matters more than calculations.
