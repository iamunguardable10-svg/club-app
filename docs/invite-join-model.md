# Invite & Join Model

This document defines how people join clubs, departments and teams.

The product needs two related but different mechanisms:

1. Personal role invites
2. Reusable team join links / join codes

---

# 1. Personal role invites

Used for people with operational responsibility.

Examples:

- club_admin invites department_lead
- club_admin invites head_coach
- department_lead invites coach

## Why personal invites?

Coach/admin roles are permissions, not just team participation.

They should not be joinable through a public team code.

## Flow

```txt
Admin creates invite
→ invite has role + department/team context
→ coach opens link
→ coach logs in/signs up
→ system creates membership
→ coach lands in coach workspace
```

## Example

```txt
/invite/coach/tkn_abc123
```

---

# 2. Reusable team join links / join codes

Used for athletes joining a team.

This should be very low-friction.

## Product idea

A coach can generate a team join link or short code and send it to all players.

Examples:

```txt
https://club-app.com/join/U18ABC
```

or

```txt
Team code: U18ABC
```

The code can be shared in WhatsApp, team chat, email or shown in person.

## Flow A — Join link

```txt
Athlete receives team link
→ opens link
→ logs in or creates account
→ confirms name/profile
→ joins team automatically
→ lands in athlete workspace
```

## Flow B — Join code

```txt
Athlete creates account / logs in
→ enters 6-character team code
→ confirms team
→ joins team automatically
→ lands in athlete workspace
```

## Why this is useful

A coach should not have to create a personal invite for every athlete.

For team onboarding, one reusable link/code is much faster.

---

# 3. Recommended V1 model

V1 should support both concepts:

## A. invites table

For personal role invites:

- department_lead_invite
- coach_invite

## B. team_join_codes table

For athlete team onboarding:

```txt
id
club_id
department_id
team_id
code
created_by
is_active
expires_at optional
max_uses optional
created_at
```

## Join code behavior

- Code is reusable while active.
- Code joins the athlete to exactly one team.
- Code creates a team_membership with role = athlete.
- User must be logged in before final join.

---

# 4. Security rules

## Coaches/admins

Coach and admin roles require personal invites.

Do not allow a generic code to grant coach/admin roles.

## Athletes

Athletes can join through reusable team codes.

## Abuse prevention later

Future versions can add:

- code expiration
- code rotation
- max uses
- require coach approval
- domain/email restrictions
- parent/guardian flows for youth players

---

# 5. V1 decision

V1 will use:

```txt
Personal invites → for department leads and coaches
Reusable team join codes/links → for athletes
```

This keeps coach/admin permissions controlled while keeping athlete onboarding fast.