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