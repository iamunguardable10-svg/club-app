# Database Schema Draft

This document defines the first database model for Club App / TeamLoad OS.

The schema is designed for Supabase/PostgreSQL and should later be converted into SQL migrations.

---

## Core principle

Access and responsibility are membership-based.

Do not store one global role on the user.

Correct model:

```txt
user -> memberships -> club / department / team / role
```

This allows:

- athletes in multiple teams
- coaches assigned to multiple teams
- department leads managing one department
- admins managing the whole club
- future multi-club support

---

# Entity overview

```txt
profiles
clubs
club_memberships
departments
teams
team_memberships
invites
sessions
session_participants
availability
attendance_records
load_entries
facilities
facility_bookings
activity_events
```

---

# 1. profiles

Supabase Auth owns authentication.

`profiles` stores app-specific user data.

## Fields

```txt
id uuid primary key references auth.users(id)
full_name text not null
email text
avatar_url text
birth_year integer
primary_sport text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Notes

- No global role field.
- Roles come from memberships.

---

# 2. clubs

A club workspace.

## Fields

```txt
id uuid primary key default gen_random_uuid()
name text not null
slug text unique not null
country text
city text
created_by uuid references profiles(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

---

# 3. departments

Departments sit under a club.

Examples:

- Basketball
- Football
- Fencing
- Performance

## Fields

```txt
id uuid primary key default gen_random_uuid()
club_id uuid not null references clubs(id) on delete cascade
name text not null
sport text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Rule

A team must belong to a department.

---

# 4. teams

Teams belong to departments.

Examples:

- U18 Boys
- U16 Girls
- First Team
- Guard Development Group

## Fields

```txt
id uuid primary key default gen_random_uuid()
club_id uuid not null references clubs(id) on delete cascade
department_id uuid not null references departments(id) on delete cascade
name text not null
sport text
season text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Notes

`club_id` is duplicated intentionally for easier permission checks and queries.

---

# 5. club_memberships

High-level club and department roles.

Used for:

- club_admin
- department_lead

## Fields

```txt
id uuid primary key default gen_random_uuid()
user_id uuid not null references profiles(id) on delete cascade
club_id uuid not null references clubs(id) on delete cascade
department_id uuid references departments(id) on delete cascade
role text not null
status text not null default 'active'
created_at timestamptz not null default now()
```

## Allowed roles V1

```txt
club_admin
department_lead
```

## Rules

- `club_admin` has `department_id = null`.
- `department_lead` has a department_id.

---

# 6. team_memberships

Team-level membership.

Used for:

- head_coach
- assistant_coach
- athlete

## Fields

```txt
id uuid primary key default gen_random_uuid()
user_id uuid not null references profiles(id) on delete cascade
club_id uuid not null references clubs(id) on delete cascade
department_id uuid not null references departments(id) on delete cascade
team_id uuid not null references teams(id) on delete cascade
role text not null
status text not null default 'active'
joined_at timestamptz not null default now()
```

## Allowed roles V1

```txt
head_coach
assistant_coach
athlete
```

## Notes

A user can have multiple rows.

Example:

- athlete in U18
- athlete in U20
- assistant_coach in U16
- head_coach in U18

---

# 7. invites

Invite tokens are used to onboard coaches and athletes directly into the right context.

## Fields

```txt
id uuid primary key default gen_random_uuid()
token text unique not null
club_id uuid not null references clubs(id) on delete cascade
department_id uuid references departments(id) on delete cascade
team_id uuid references teams(id) on delete cascade
role text not null
invite_type text not null
created_by uuid references profiles(id)
accepted_by uuid references profiles(id)
status text not null default 'pending'
expires_at timestamptz
created_at timestamptz not null default now()
accepted_at timestamptz
```

## Invite types V1

```txt
coach_invite
athlete_invite
department_lead_invite
```

## Rules

- Coach invites usually have club_id, department_id, optional team_id and role.
- Athlete invites have club_id, department_id, team_id and role = athlete.
- Department lead invites have club_id, department_id and role = department_lead.

---

# 8. sessions

The central operational object.

Sessions can be training, game, recovery, S&C, meeting or other event types.

## Fields

```txt
id uuid primary key default gen_random_uuid()
club_id uuid not null references clubs(id) on delete cascade
department_id uuid not null references departments(id) on delete cascade
team_id uuid not null references teams(id) on delete cascade
created_by uuid references profiles(id)
title text not null
session_type text not null
starts_at timestamptz not null
ends_at timestamptz
facility_id uuid references facilities(id)
location_text text
notes text
status text not null default 'scheduled'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Session types V1

```txt
training
game
s_and_c
recovery
video
meeting
other
```

## Notes

V1 sessions are team-based.

Future versions may support multi-team sessions.

---

# 9. session_participants

Planned participants for a session.

## Fields

```txt
id uuid primary key default gen_random_uuid()
session_id uuid not null references sessions(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
team_membership_id uuid references team_memberships(id)
role text not null default 'athlete'
created_at timestamptz not null default now()
```

## Notes

Participants can be generated when a session is created from active team memberships.

This table enables historical correctness even if team membership changes later.

---

# 10. availability

Athlete pre-session status.

## Fields

```txt
id uuid primary key default gen_random_uuid()
session_id uuid not null references sessions(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
status text not null default 'expected'
reason text
late_minutes integer
note text
submitted_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## Status values V1

```txt
expected
late
maybe
out
```

## Product rule

Athletes report availability.

Coaches read availability and act on it.

---

# 11. attendance_records

Coach-finalized attendance.

## Fields

```txt
id uuid primary key default gen_random_uuid()
session_id uuid not null references sessions(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
final_status text not null
minutes_participated integer
note text
finalized_by uuid references profiles(id)
finalized_at timestamptz not null default now()
```

## Final status values V1

```txt
present
late
partial
excused_absent
unexcused_absent
```

## Product rule

Final attendance becomes the source of truth for participation.

Load and analytics should be based on finalized attendance when available.

---

# 12. load_entries

Athlete load report after session.

## Fields

```txt
id uuid primary key default gen_random_uuid()
session_id uuid not null references sessions(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
rpe integer not null
duration_minutes integer not null
session_load integer generated or calculated as rpe * duration_minutes
note text
submitted_at timestamptz not null default now()
```

## V1 rule

```txt
session_load = RPE × duration_minutes
```

## Future expansion

Load is a potential USP.

Future versions should support:

- acute load
- chronic load
- ACWR-like indicators
- monotony
- strain
- return-to-load
- wellness correlation

---

# 13. facilities

Simple V1 facility model.

## Fields

```txt
id uuid primary key default gen_random_uuid()
club_id uuid not null references clubs(id) on delete cascade
name text not null
address text
notes text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

---

# 14. facility_bookings

Simple booking/conflict model.

## Fields

```txt
id uuid primary key default gen_random_uuid()
club_id uuid not null references clubs(id) on delete cascade
facility_id uuid not null references facilities(id) on delete cascade
session_id uuid references sessions(id) on delete cascade
starts_at timestamptz not null
ends_at timestamptz not null
created_by uuid references profiles(id)
created_at timestamptz not null default now()
```

## V1 rule

Warn if the same facility has overlapping bookings.

Do not implement full approval workflows in V1.

---

# 15. activity_events

Simple V1 in-app signals.

## Fields

```txt
id uuid primary key default gen_random_uuid()
club_id uuid not null references clubs(id) on delete cascade
department_id uuid references departments(id) on delete cascade
team_id uuid references teams(id) on delete cascade
actor_id uuid references profiles(id)
event_type text not null
title text not null
body text
created_at timestamptz not null default now()
```

## Example event types

```txt
invite_accepted
session_created
availability_changed
attendance_needs_finalization
load_missing
```

## Notes

This is not a full notification engine.

It is a lightweight in-app activity system that can later feed notifications.

---

# Permission model draft

Permissions are derived from:

- club_memberships
- team_memberships

## Examples

### club_admin

Can manage entire club.

### department_lead

Can manage assigned department.

Can create teams and invite coaches within department.

### head_coach

Can manage assigned teams, sessions, athlete invites, attendance and load overview.

### assistant_coach

Can create sessions and finalize attendance for assigned teams in V1.

### athlete

Can view own sessions, submit availability and submit load.

---

# Important open questions

These should be resolved before final SQL migration:

1. Should sessions support multiple teams in V1 or only one team?
2. Should team memberships require approval or be direct through invite?
3. Should assistant coaches always be allowed to create sessions, or should that be configurable?
4. Should facilities belong to club only, or also department later?
5. Should load entries be allowed without finalized attendance?

Current V1 assumptions:

1. One team per session.
2. Invite creates membership directly.
3. Assistant coaches can create sessions in assigned teams.
4. Facilities belong to club.
5. Load can be submitted after session, even before coach finalizes attendance, but analytics prefer finalized attendance.