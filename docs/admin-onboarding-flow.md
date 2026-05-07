# Admin Onboarding Flow

## Purpose

The club admin is the first critical user.

Without the club admin, the club structure does not exist and no department leads, coaches or athletes can be invited.

The admin setup flow must therefore be guided, natural and low-friction.

---

## V1 flow

```txt
Create account
→ Create club
→ Add departments
→ Add global facilities
→ Optionally create first teams
→ Become club_admin
→ Enter Admin Workspace
```

---

## Product principle

The admin should not feel like they are filling database tables.

The app should guide them through the setup in a clear operational order:

1. What club are we setting up?
2. Which departments exist?
3. Which facilities does the club use?
4. Do you already want to create teams now?
5. Or should department leads create teams later?

---

## Departments

The admin should be able to add multiple departments during first setup.

Examples:

```txt
Basketball
Football
Fencing
Performance
```

The admin can add more departments later.

---

## Teams

Teams are optional during initial admin setup.

The admin may choose one department and create multiple teams immediately.

Example:

```txt
Department: Basketball
Teams:
- U14 Boys
- U16 Boys
- U18 Boys
- First Team
```

But this is not required.

Reasoning:

In larger clubs, the club admin may only create departments and facilities first, then invite department leads. Department leads can create teams later.

---

## Facilities

The club admin creates global facilities during setup.

Examples:

```txt
Main Hall
Court 1
Court 2
Weight Room
Meeting Room
```

Later product logic will support:

- half-court usage
- third-court usage
- shared spaces
- facility partitions
- conflict detection
- booking workflows

Not required for V1 setup.

---

## Database behavior

The initial setup should happen through a controlled RPC:

```txt
create_initial_club_setup(...)
```

This function should atomically:

1. Create the club
2. Create club_admin membership for the current user
3. Create departments
4. Create facilities
5. Optionally create teams in one selected department

Reasoning:

Creating a club and immediately assigning the creator as club_admin must be atomic and should not rely on loose client-side inserts.

---

## V1 implementation route

```txt
/onboarding/create-club
```

This page is available to authenticated users who do not yet have a club membership.

Later it should be protected with proper server-side auth checks.
