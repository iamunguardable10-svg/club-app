# People & Invites V1

This document records the V1 implementation of Admin People & Invites.

## Implemented routes

Real:

```txt
/admin/people
```

Demo:

```txt
/demo/admin/people
```

## Product model

People & Invites is the primary admin location for inviting responsibility roles.

Invites are department-based:

```txt
Department Lead → department-level invite
Head Coach      → team-level coach invite
Assistant Coach → team-level coach invite
```

The invite flow is intentionally not global-only. Every invite is tied to at least a department, and coach invites are tied to a team in the current V1 acceptance model.

## Implemented real flow

`/admin/people` now loads:

```txt
club
departments
teams
invites
```

The admin can create:

```txt
department_lead invite
head_coach invite
assistant_coach invite
```

The page shows:

```txt
pending invites
copyable invite links
revoke invite action
invite history
```

## Invite links

V1 uses copyable links, not email sending.

Example shape:

```txt
/invite/<token>
```

Reason: the current `invites` table does not store invitee email addresses. Email sending can be added later with a migration and notification/email infrastructure.

## Important technical constraint

The existing `accept_invite(token)` RPC currently requires coach invites to have a `team_id`.

This means:

```txt
Department Lead invites can be accepted with only department context.
Coach invites require department + team.
```

The UI reflects this by requiring team selection for Head Coach and Assistant Coach invites.

Future option:

```txt
Department-wide coach invite
→ accepted as department staff first
→ assigned to team later
```

This would require a membership model extension or a dedicated department staff membership type.

## Implemented demo flow

`/demo/admin/people` stores demo invites in localStorage:

```txt
club-app.demo.invites
```

Demo invites include:

```txt
role
department
team optional for department leads, required in UI for coaches
status
token
createdAt
expiresAt
```

The demo page supports:

```txt
create local invite
copy local invite link
revoke local invite
show pending/history
```

Demo links are previews and do not write to Supabase.

## Next recommended steps

1. Build `/admin/departments` so departments can be managed and opened as their own context.
2. Build team management under department context.
3. Improve coach invite flow once teams are real and usable.
4. Later add email-address-based invites and email delivery.
