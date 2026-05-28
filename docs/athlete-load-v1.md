# Athlete Load V1

Athlete load is the first bottom-up product surface: an athlete must get value even before a full club rollout exists.

## Scope

Routes:

- `/athlete/home`
- `/athlete/load`
- `/athlete/calendar`

Today and Calendar now diverge structurally. Today is the cockpit; Calendar is the interactive planning/reporting surface. `/athlete/load` remains available as a compatibility route, but V1 no longer treats it as a third primary tab.

## Product model

The athlete can report load from two sources:

1. Planned team session
   - Created by coach/team calendar.
   - Appears as a pending load task for the athlete.
   - Athlete confirms RPE and actual duration.

2. Solo/manual entry
   - Used when the athlete trains alone or before a team is fully onboarded.
   - Supports the bottom-up adoption ladder: athlete -> coach -> department -> club.

## Load calculation

V1 uses session load:

```txt
load = RPE x duration_minutes
```

The ACWR calculation is ported from the reference PDF app and adapted to Club OS names:

- daily load is aggregated by calendar date
- missing days are filled as rest days with load 0
- acute load = rolling 7-day average
- chronic load = rolling 28-day average
- ACWR is shown after enough history exists

## Data model

Existing table `load_entries` is extended by migration `0016_athlete_load_foundation.sql`:

- `session_id` can be null for solo/manual entries
- `team_id` optional
- `entry_date` required
- `training_type` required
- `source` distinguishes `planned_session`, `solo`, and `manual`

RLS keeps athlete self-write behavior and allows relevant team staff/department leads to read contextual load.

## UI rules

- No placeholder explanation panels.
- Show metrics and action surfaces directly.
- Mobile-first layout; quick entry opens as an overlay instead of a permanent form card.
- Graph uses Recharts with a custom Club OS layer so athletes can hover/tap every calendar day, read ACWR, and inspect daily load details.
- The chart should not use default Recharts styling; keep axes, tooltip, zones, and legends compact and athlete-readable. It renders rest days as zero-load bars, supports Rolling/EWMA method switching, and shows a 14-day forecast line from the athlete's history. Forecast bars are rendered only for explicit planned sessions, never for synthetic pattern estimates.
## Expected load planning

Athletes use one session form for both expected and completed load. Future dates create a plan; past dates create a completed load entry; today offers a Plan/Already done toggle.

- expected load is stored separately in `athlete_load_plans`
- expected load contains training type, date, optional time, expected RPE and expected duration; RPE and duration are slider-based, and duration defaults to the athlete historical average for that training type
- the graph renders explicit expected load as faded forecast bars
- expected load affects forecast ACWR immediately; historical pattern forecasting affects the forecast line only
- when the planned session is due, the athlete confirms actual RPE/duration and it becomes a real `load_entries` row
- demo mode mirrors this with `localStorage`



## Rolling and EWMA

Both Rolling ACWR and EWMA use the same baseline rule: no interpretive ACWR state before a full chronic baseline is available. Rolling uses 7-day and 28-day calendar windows including rest days. EWMA uses lambda 2/(7+1) and 2/(28+1), also over the filled calendar-day series.


## Sharing and coach visibility

- Authenticated coaches and department leads can read team-scoped athlete load through the existing `load_entries` / `athlete_load_plans` RLS context when `team_id` or session context connects the entry to their team or department.
- Pure solo load without `team_id` remains athlete-private by default. Athletes can still share a read-only snapshot through the `Trainer link` action.
- `Trainer link` creates a portable `/share/load?data=...` URL containing recent load entries and pending sessions, matching demo and standard behavior without requiring an external account.
- Later player detail views should use the same live team-scoped load data so a coach can tap a player and see state, recent sessions, expected load and readiness immediately.

## Mobile chart rules

- Mobile chart ranges are `7d`, `14d`, and `30d`; all must fit in portrait without horizontal scrolling.
- Longer history remains a desktop/landscape concern.
- Mobile fullscreen opens the chart in a rotated landscape overlay for detailed reading.

## Athlete mobile interaction update

- Mobile and desktop no longer show the full add-load composer by default.
- Add/report opens through an overlay from the header CTA, a pending session, or the athlete calendar.
- Calendar uses a real Untis-style week grid from 08:00 to 23:00. Empty slots create a prefilled load plan/report; session cards use training-type color and status style.
- Team-created sessions are read-only before they are due; after they are due, tapping the session opens the reporting overlay.
- Calendar view does not show the load graph; it stays focused on planning/reporting.
- Calendar has a view/edit split. Creating from empty slots works in view mode; moving/resizing own planned athlete sessions requires edit mode.
- On mobile, tapping a weekday opens the day view; the week view remains available from the day header.
- The mobile athlete calendar renders 08:00-23:00 without an inner calendar scroll; the page can scroll, but the calendar itself should stay fully visible.
- In view mode, tapping a reported session opens read-only load details. In edit mode, reported athlete load entries can be edited for RPE/duration, while only owned planned athlete sessions can be moved/resized.
- Planned load defaults RPE from the athlete's own history for that training type, preferring the same weekday when enough samples exist.
- Mobile chart fullscreen first asks the athlete to rotate the phone; the graph renders only in landscape to avoid the previous rotated-overlay glitch.
- Trainer link state is persisted in browser storage so copied links are visibly marked active.

## Athlete calendar polish — 2026-05-28

- The athlete calendar keeps the 08:00-23:00 week grid, but mobile uses a taller compact density so sessions remain readable without creating an inner scroll container.
- Drag and resize in edit mode now render a live preview of the moved session position/duration before commit, so athletes can see the target slot while editing.
- The global `Add load` header action is removed; load entry stays contextual through calendar slots, pending sessions, and session detail flows.
- Demo athlete data is seeded with a longer history so Rolling/EWMA graphs and mobile ranges have realistic density.
- Date/time inputs in the session overlay are compact controls and must stay inside the card on narrow iPhone screens.
