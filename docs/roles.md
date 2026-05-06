# Roles & Permissions

## Philosophy

Roles should not only define visibility.
They define operational responsibility.

The system must support:

- multiple roles per user
- multiple teams per coach
- multiple departments per admin
- future multi-club support

Permissions should be membership-based, not global user flags.

Example:

A user is not simply "coach".

Instead:

- user X is head coach for Team A
- assistant coach for Team B
- S&C coach for Department C

## Initial V1 roles

### Club Admin

Responsibilities:

- create club
- manage departments
- manage teams
- invite coaches
- manage facilities
- assign permissions

### Department Admin

Responsibilities:

- manage one department
- create teams in department
- manage department coaches

### Head Coach

Responsibilities:

- create and edit sessions
- manage attendance
- invite athletes
- finalize attendance
- see load data
- manage team operations

### Assistant Coach

Responsibilities:

- view sessions
- manage attendance
- support daily operations

### Strength & Conditioning Coach

Responsibilities:

- view load data
- create recovery/performance sessions
- monitor athlete load trends

### Athlete

Responsibilities:

- report availability
- submit load
- view calendar
- view own participation

## Permission strategy

Permissions should eventually become granular.

Example:

- can_create_session
- can_finalize_attendance
- can_manage_facilities
- can_manage_roles
- can_view_load
- can_edit_team

But V1 can use grouped role permissions.

## Important architectural principle

Permissions should always be derived from memberships.

Never rely on:

```txt
user.role = 'coach'
```

Instead:

```txt
memberships
- user_id
- club_id
- department_id
- team_id
- role
```

This keeps the system scalable and flexible.