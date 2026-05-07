# Admin Calendar Model

## Purpose

The Club Admin needs an operational overview, not a task-driven daily interface.

A central calendar module should answer:

- Which facilities are used when?
- Which department uses which hall?
- Which team trains or plays where?
- Are there potential facility conflicts?
- What is happening across the club this week?

---

## V1 route

```txt
/admin/calendar
```

---

## Calendar views

### 1. Facility Calendar

Shows facility usage across the club.

Useful questions:

```txt
What is happening in Main Hall today?
Which team uses Court 1 on Tuesday?
Which department uses the Weight Room this week?
Are facilities double-booked?
```

Primary grouping:

```txt
Facility
→ day/time
→ session
→ team
→ department
```

---

### 2. Department Calendar

Shows operations by department.

Useful questions:

```txt
What does Basketball have this week?
Which Basketball teams train today?
Are there games in Football this weekend?
How much facility usage does each department have?
```

Primary grouping:

```txt
Department
→ teams
→ sessions
→ facility
```

---

### 3. Team Calendar

Shows sessions for a selected team.

This overlaps with Coach Workspace, but the Admin version is for overview, not coaching execution.

Useful questions:

```txt
What does U18 Basketball have this week?
Where does this team train?
How often is this team scheduled?
```

Primary grouping:

```txt
Department
→ Team
→ sessions
```

---

## Access model

### club_admin

Can see calendar data across the club.

### department_lead

Should later see department-level calendar data in the Department Workspace.

### coach

Sees own team calendar in the Coach Workspace.

### athlete

Sees own team/personal calendar in the Athlete Workspace.

---

## V1 database impact

No new table required.

Existing tables already support this:

- sessions
- facilities
- departments
- teams
- facility_bookings

---

## Future capacity model

Later, facilities need more detailed bookable units.

Examples:

```txt
Main Hall
- Full hall
- Half hall A
- Half hall B
- Third 1
- Third 2
- Third 3
```

Possible future tables:

```txt
facility_units
facility_unit_bookings
```

This is not required for V1, but the UI should already speak in a way that can evolve into this model.

---

## Product principle

The Admin Calendar is not an attendance or coaching tool.

It is a club operations map.

It should help the admin understand facility usage, department activity and structural load across the club.
