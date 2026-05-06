# V1 Product Decisions

This document records the confirmed V1 product decisions.

---

## 1. Platform

V1 will be a responsive web app / PWA.

Design priority:

- Athlete: mobile-first
- Coach: mobile-first with desktop expansion
- Admin: desktop-first

---

## 2. Auth

V1 uses email and password authentication.

Future versions can add:

- Google login
- Apple login
- SSO for larger clubs

---

## 3. Active V1 roles

V1 roles:

- club_admin
- department_lead
- head_coach
- assistant_coach
- athlete

Future roles:

- s&c_coach
- physio
- team_manager
- facility_manager

---

## 4. Club structure

Teams are always subordinate to a department.

Structure:

```txt
club
└── department
    └── team
```

Example:

```txt
TSV Example Club
└── Basketball
    └── U18 Boys
```

---

## 5. Multiple memberships

Athletes can belong to multiple teams.

Coaches can manage multiple teams.

This must be implemented through memberships, not global user roles.

---

## 6. Invite permissions

V1 invite permissions:

- club_admin can invite department leads and coaches
- department_lead can invite coaches within their department
- head_coach can invite athletes to assigned teams
- assistant_coach may invite athletes if explicitly allowed later

Reasoning:

Large clubs should not require one central admin to invite every coach manually.

---

## 7. Team creation permissions

V1 team creation permissions:

- club_admin can create teams
- department_lead can create teams in their department
- coaches do not create teams by default

Reasoning:

Team creation changes the club structure and should be controlled at admin/department level.

---

## 8. Session creation permissions

V1 session creation permissions:

- club_admin can create sessions
- department_lead can create sessions in their department
- head_coach can create sessions for assigned teams
- assistant_coach can create sessions for assigned teams
- athlete cannot create sessions

---

## 9. Attendance finalization

Final attendance can be set by:

- club_admin
- department_lead
- head_coach
- assistant_coach

Athletes only report availability before the session.

---

## 10. Availability statuses

V1 athlete availability statuses:

- expected
- late
- maybe
- out

Additional fields:

- reason
- late_minutes
- note

---

## 11. Final attendance statuses

V1 final attendance statuses:

- present
- late
- partial
- excused_absent
- unexcused_absent

---

## 12. Load

V1 load foundation:

```txt
session_load = RPE × duration_minutes
```

Advanced load analytics are not required in V1, but load is a future USP and must be architected carefully.

Future versions should support:

- acute load
- chronic load
- ACWR-like signals
- monotony/strain
- return-to-load workflows
- coach alerts
- athlete trends

---

## 13. Wellness / injury

V1 will not implement a full wellness or injury module.

Reasoning:

This quickly becomes medically sensitive and complex.

V1 may include placeholders only, for example:

- wellness placeholder
- injury status placeholder
- return-to-load placeholder

Future versions can add structured wellness and injury workflows with proper privacy controls.

---

## 14. Facilities

V1 uses simple facility management.

V1 supports:

- create facilities/locations
- assign facility to session
- simple conflict warning

Future versions can expand into a full facility booking system.

---

## 15. Notifications

V1 uses simple in-app signals only.

Examples:

- invite accepted
- athlete marked late/maybe/out
- attendance needs finalization
- load missing

No push notification infrastructure in V1.

---

## 16. Chat

Chat is not included in V1.

Reasoning:

Chat would distract from the core operating system workflows.

---

## 17. Analytics

V1 analytics are placeholders plus simple metrics.

Examples:

- attendance rate
- late count
- missed sessions
- completed load entries
- simple load totals

No complex reporting in V1.

---

## 18. Calendar

Calendar is important in V1, but should stay simple.

V1 calendar views:

- athlete sees own sessions across memberships
- coach sees sessions for assigned teams
- admin/department lead sees department or club-level overview

---

## 19. Database

Supabase will be used from the beginning.

First step:

- define schema clearly
- document SQL structure
- then create migrations

No quick ad-hoc tables without a model.