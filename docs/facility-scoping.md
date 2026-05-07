# Facility Scoping

## Purpose

Facilities are created globally at club level, but coaches should not have to choose from every facility in the whole club.

V1 should support a scoped facility model:

```txt
Club facilities
→ assigned to departments
→ used by teams/coaches inside that department
→ optionally defaulted per team
```

---

## Product problem

If a club has many facilities, showing every hall/court/location to every coach creates noise.

Example:

```txt
Club facilities:
- Main Hall
- Court 1
- Court 2
- Football Pitch
- Fencing Room
- Weight Room
- Meeting Room
```

A U18 basketball coach should not have to scroll through football or fencing facilities when creating basketball training.

---

## V1 model

### Club Admin

Creates and manages all facilities globally.

### Department Lead

Selects which global facilities are available to their department.

Example:

```txt
Basketball Department uses:
- Main Hall
- Court 1
- Court 2
- Weight Room
```

### Coach

When creating a session, sees primarily facilities assigned to the team's department.

### Team default facility

Each team can optionally have a default facility.

Example:

```txt
U18 Boys default facility = Main Hall
```

When the coach creates a session for U18 Boys, Main Hall should be preselected.

---

## Database model

### department_facilities

Join table between departments and facilities.

```txt
department_id
facility_id
club_id
created_by
created_at
```

### teams.default_facility_id

Optional default facility for the team.

```txt
teams.default_facility_id -> facilities.id
```

---

## Access rules

### department_facilities select

- club_admin can see all assignments in the club
- department_lead can see assignments for their department
- coaches can see assignments for their assigned teams' departments

### department_facilities write

- club_admin can manage all assignments
- department_lead can manage assignments in their department

### team default facility write

- club_admin can set for any team
- department_lead can set for teams in their department
- coach default-setting can be added later if needed

---

## UI principle

The session creation form should prioritize:

1. Team default facility
2. Department assigned facilities
3. Manual location text fallback

Do not show every club facility to coaches by default.
