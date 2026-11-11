# RLS Access Model

This document defines the intended V1 access model for Supabase Row Level Security.

It is not yet SQL. It is the confirmed product-level access model that will guide the RLS migration.

---

## Core principle

Users should only see what is operationally relevant to their role and context.

The app has separated workspaces:

- Admin / club operations
- Coach / team operations
- Athlete / personal and team participation

Coaches and athletes do not need broad visibility into unrelated departments.

---

# 1. Profiles

## User can see

- own profile
- profiles of users in their own teams if operationally needed

## User can edit

- own profile only

## Privacy rule

Athletes should not see sensitive personal/load data of other athletes.

---

# 2. Clubs

## Select

- users can see the club they belong to through active membership

## Update

- club_admin only

---

# 3. Departments

## Select

V1 should be context-limited.

- club_admin can see all departments in the club
- department_lead can see their own department
- head_coach and assistant_coach can see departments of their assigned teams
- athletes can see departments of their assigned teams

Coaches and athletes should not browse unrelated departments by default.

## Insert / update / delete

- club_admin only

Reasoning:

Departments are core club structure.

---

# 4. Teams

## Select

- club_admin can see all teams in the club
- department_lead can see all teams in their department
- head_coach and assistant_coach can see their assigned teams
- athlete can see their own teams

## Optional calendar exception

Coaches and athletes may later see a limited hall/calendar overview for other teams only to understand facility availability.

This should not expose rosters, load, availability or attendance of other teams.

## Insert

- club_admin can create teams anywhere in the club
- department_lead can create teams in their own department

## Update / delete

- club_admin can update/delete teams in the club
- department_lead can update/delete teams in their department

---

# 5. Club memberships

## Select

- club_admin can see club-level memberships in their club
- department_lead can see department-level memberships for their department
- normal coaches and athletes do not need broad club membership visibility

## Insert / update / delete

Should happen through controlled invite / admin flows.

Memberships should not be freely created by arbitrary client inserts.

---

# 6. Team memberships

## Select

- club_admin can see team membership structure but should not see athlete load by default
- department_lead can see team memberships in their department
- head_coach and assistant_coach can see members of their assigned teams
- athlete can see basic roster/team membership of their own teams

## Privacy rule

Athletes can see who is on their team, but they must not see teammates' load, attendance analytics, private notes or sensitive status details.

## Insert / update / delete

Should happen through controlled invite/admin flows.

---

# 7. Invites

## Create

- club_admin can create department lead, coach and athlete invites
- department_lead can create coach and athlete invites within their department
- head_coach can create athlete invites for assigned teams
- assistant_coach can create athlete invites for assigned teams in V1
- athlete cannot create invites

## Read

Invite records should not be directly browsable.

Use controlled functions later:

```txt
get_invite_by_token(token)
accept_invite(token)
```

These should return only safe invite details.

---

# 8. Sessions

## Select

Strict operational access:

- club_admin can see sessions in the club for administration/calendar purposes
- department_lead can see sessions in their department
- head_coach and assistant_coach can see sessions owned by their assigned teams
- invited-team staff can see invited sessions so they can accept or decline
- athlete can see sessions for owner/accepted teams they belong to

## Optional calendar exception

It may be useful for coaches and athletes to see when other teams train for hall/court awareness.

If implemented, this should be a limited calendar projection only:

- team name
- time
- facility
- session type

Not exposed:

- roster
- availability
- attendance
- load
- private coach notes

## Insert

- club_admin can create sessions
- department_lead can create sessions in their department
- head_coach can create sessions for assigned owner teams
- assistant_coach can create sessions for assigned owner teams

## Update / delete

- club_admin within club
- department_lead within department
- head_coach within owned assigned teams
- assistant_coach within owned assigned teams

## Team invitations

- owner-team staff can invite other teams
- invited-team staff can accept or decline their own team row
- invited teams do not become owners of the session

## Group / player targeting

- player groups are team-internal
- team staff manage groups inside assigned teams
- session groups and session players are editable by session managers only

---

# 9. Availability

Availability means athlete pre-session report:

- expected
- late
- maybe
- out

## Select

- athlete can see own availability
- head_coach and assistant_coach can see availability for athletes in their assigned teams
- department_lead can see availability in their department if needed for operations
- club_admin does not need default access to detailed availability unless acting administratively

## Insert / update

- athlete can insert/update own availability only

## Rule

Coach should not change athlete availability.

Coach finalizes attendance after the session instead.

---

# 10. Attendance records

## Select

- athlete can see own final attendance
- head_coach and assistant_coach can see final attendance for assigned teams
- department_lead can see final attendance for their department
- club_admin can see attendance for club operations

## Insert / update

- club_admin within club
- department_lead within department
- head_coach within assigned teams
- assistant_coach within assigned teams

---

# 11. Load entries

Load is more sensitive than basic attendance.

## Select

- athlete can see own load entries
- head_coach can see load entries for athletes in assigned teams
- assistant_coach can see load entries for athletes in assigned teams in V1
- department_lead can see department load if operationally necessary
- club_admin should not automatically see individual athlete load data by default

## Important privacy rule

Athletes must not see teammates' load data.

Club admin is responsible for structure and operations, not automatically performance/load details.

## Insert / update

- athlete can insert/update own load entry

## Future

Later versions should support more granular performance/privacy permissions, especially for:

- S&C coach
- physio
- medical staff
- return-to-load workflows

---

# 12. Facilities

## Select

- club_admin can see all facilities
- department_lead can see facilities used by their department
- head_coach and assistant_coach can see facilities relevant to assigned teams and sessions
- athlete can see facility/location for their own sessions

## Optional calendar view

A limited hall calendar may show bookings from other teams without exposing team internals.

## Insert / update / delete

- club_admin only in V1

---

# 13. Facility bookings

## Select

- club_admin can see all bookings
- department_lead can see bookings relevant to their department
- coaches can see bookings relevant to assigned teams
- athletes can see bookings/locations for own sessions
- limited public-in-club hall calendar may expose time/facility/team only

## Insert / update

Generated through session creation/update by users who can create/update sessions.

---

# 14. Activity events

## Select

- club_admin sees structural/admin events
- department_lead sees department events
- coaches see assigned-team events
- athletes see own-team events relevant to them

## Privacy rule

Activity events must not expose sensitive load or private athlete details to unauthorized users.

---

# Confirmed V1 access decisions

1. Coaches and athletes do not need to see unrelated departments by default.
2. Athletes only have access to their own teams.
3. Athletes may later see a limited hall calendar for other teams, but not their rosters/load/attendance.
4. Teammates must not see each other's load data.
5. Club admin should not automatically see individual load data.
6. Assistant coaches can create athlete invites in V1.
7. Coaches cannot edit athlete availability.
8. Athletes alone submit their own availability.
9. Head coach and assistant coach can see load data for their assigned teams in V1.
10. Facilities are managed by club_admin in V1.
