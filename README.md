# Club App / TeamLoad OS

Club App is the foundation for a club operating system for teams, coaches, athletes and club admins.

## Product direction

The app is not just an attendance app. It is designed as a structured operating system for clubs:

- Admins create and configure the club.
- Coaches manage teams, sessions, attendance and load.
- Athletes see their calendar, submit availability and report load.
- Club operations manage departments, facilities and responsibilities.

## V1 goal

V1 is a clean product and code foundation with placeholder screens. The priority is architecture, navigation and core flows — not polished analytics or advanced automation.

### V1 core flows

1. Admin creates a club.
2. Admin creates departments and teams.
3. Admin invites coaches through invite links.
4. Coach accepts invite and is assigned to the correct club/team.
5. Coach invites athletes through team invite links.
6. Athlete accepts invite and joins the correct team.
7. Coach plans sessions.
8. Athlete submits availability: expected, late, maybe, no.
9. Coach sees live status and finalizes attendance.
10. Load entries and analytics are built on top of finalized participation.

## Main app areas

```txt
/admin   - club setup, departments, teams, coaches, facilities, roles
/coach   - today cockpit, team, sessions, attendance, load
/athlete - home, calendar, availability, load
/invite  - coach and athlete invite acceptance
/auth    - login, signup, session handling
```

## Technical direction

Preferred stack:

- Next.js
- TypeScript
- Tailwind CSS
- Supabase Auth + Postgres + RLS
- Feature-based architecture

## Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_GEOAPIFY_API_KEY=
```

`NEXT_PUBLIC_GEOAPIFY_API_KEY` enables Geoapify address autocomplete on facility address fields. If it is missing or Geoapify cannot be reached, facility address fields keep working as normal manual inputs.

## Facility address input principle

Facility names and facility addresses are intentionally separate:

- The facility name is the internal club or department name, for example `Main Hall` or `U18 Gym`.
- The address field can search by official venue name, school name, hall name or street address.
- Geoapify may fill the address, but it must not automatically overwrite the internal facility name.
- Demo flows and real Supabase-backed flows should use the same input behavior whenever possible.

## Key principle

Every screen must answer a real operational question.

For coaches, the main question is:

> Who is coming today, who is late, who is missing, why, and who needs load attention?

For athletes, the main question is:

> What is next, what do I need to report, and how am I doing?

For admins, the main question is:

> Is the club structure correctly set up and are the right people assigned to the right roles?
