# Architecture Decisions

This file records important product and technical decisions so the project stays consistent over time.

---

## ADR 001 — Users can have multiple memberships

## Status

Accepted

## Decision

A user can belong to multiple teams, departments or roles at the same time.

Examples:

- athlete plays U18 and men's team
- athlete is part of a basketball team and an S&C group
- coach manages multiple teams
- coach is head coach for one team and assistant coach for another
- admin manages a club while also coaching a team

## Reasoning

This reflects real club structures.

Restricting users to one global role or one team would make the system unrealistic for competitive sports and club environments.

## Consequence

The system must not rely on a single global role such as:

```txt
user.role = 'coach'
```

Instead, permissions and access must be derived from memberships:

```txt
memberships
- user_id
- club_id
- department_id
- team_id
- role
```

## Product impact

The UI must allow users to switch context when needed.

Examples:

- Athlete sees calendar entries from all assigned teams.
- Coach can switch between teams.
- Admin can view club-wide setup.

## V1 scope

V1 should support the data model for multiple memberships from the start.

The UI can stay simple and show a default active context first.

---

## ADR 002 — Facility management starts simple

## Status

Accepted

## Decision

V1 will use a simple facility model.

Facilities belong primarily to the admin and club operations area.

V1 should support:

- creating facilities or locations
- assigning a facility/location to a session
- showing simple booking/conflict warnings
- showing a basic facility overview

V1 does not need full facility operations yet.

## Not included in V1

- advanced recurring reservations
- complex blackout periods
- partial hall divisions
- approval workflows
- external facility owners
- automatic rescheduling
- detailed capacity/resource planning

## Reasoning

Facility management can become a large product module by itself.

For the first version, it should support the session workflow without distracting from the core product:

- teams
- sessions
- availability
- attendance
- load
- invites

## Future direction

The simple model should be expandable into a full facility system later.

Future Option B can include:

- halls
- courts/rooms
- recurring bookings
- conflict resolution
- holidays and blackout windows
- facility admins
- availability calendars
- booking approvals

## Product impact

Admin users manage facilities.

Coaches mainly select facilities while planning sessions and see conflict warnings when something is already booked.

Athletes do not manage facilities; they only see the assigned location for a session.

---

## ADR 003 — Notifications start as simple in-app signals

## Status

Accepted

## Decision

V1 will not implement a full push notification system.

V1 should support simple in-app signals such as:

- new session created
- attendance needs finalization
- athlete reported late/maybe/no
- load entry missing
- invite accepted

These signals can appear as simple alerts, badges or an activity feed inside the app.

## Not included in V1

- native push notifications
- advanced reminder schedules
- notification preferences
- quiet hours
- escalation rules
- background jobs for reminders
- multi-channel delivery such as push, email and SMS

## Reasoning

Notifications can become a large infrastructure topic.

The first version should focus on core product value:

- club setup
- roles
- invites
- sessions
- availability
- attendance
- load foundation

## Future direction

A later version can expand into a notification engine with:

- push notifications
- email reminders
- attendance reminders
- RPE/load reminders
- coach alerts
- smart reminders
- user-level preferences
- role-based notification rules

## Product impact

The data model should allow future notifications, but V1 UI should stay simple.

No critical V1 workflow should depend on external push infrastructure.