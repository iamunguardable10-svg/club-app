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
- The chart should not use default Recharts styling; keep axes, tooltip, zones, and legends compact and athlete-readable. It renders rest days as zero-load bars, uses EWMA as the default ACWR method, and shows a 14-day forecast line from the athlete's history. Forecast bars are rendered only for explicit planned sessions, never for synthetic pattern estimates.
## Expected load planning

Athletes use one session form for both expected and completed load. Future dates create a plan; past dates create a completed load entry; today offers a Plan/Already done toggle.

- expected load is stored separately in `athlete_load_plans`
- expected load contains training type, date, optional time, expected RPE and expected duration; RPE and duration are slider-based, and duration defaults to the athlete historical average for that training type
- the graph renders explicit expected load as faded forecast bars
- expected load affects forecast ACWR immediately; historical pattern forecasting affects the forecast line only
- when the planned session is due, the athlete confirms actual RPE/duration and it becomes a real `load_entries` row
- demo mode mirrors this with `localStorage`



## ACWR method

V1 uses EWMA as the default ACWR method for athlete and coach-facing surfaces. EWMA uses lambda 2/(7+1) and 2/(28+1) over the filled calendar-day series. Rolling ACWR can remain available internally for later settings, but the active UI no longer exposes a method toggle.


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

## Athlete calendar edit polish — 2026-05-28 follow-up

- Mobile week density is slightly larger again so 08:00-23:00 remains readable while staying one page-level calendar, not an inner scroll surface.
- Dragging/resizing now shows a persistent preview badge with weekday, start time, and duration; resize also shows duration on the moving card.
- Mobile drag keeps the original day unless the athlete makes a deliberate horizontal move, reducing accidental day changes while the thumb moves out of the way.
- Reported load entries can be deleted through the app confirmation dialog; demo uses localStorage and standard uses Supabase `load_entries` delete under existing RLS.
- Date/time overlay controls keep compact boxes but return to the calmer old text styling.

## Athlete calendar mobile drag follow-up

- Mobile compact cards clip overflowing text instead of showing ellipses; team training uses the short label `Team` and shows time when the card height allows it.
- Today sessions keep their training-type color until the day has passed; missing/amber is only for older unreported sessions.
- Horizontal mobile drag now uses the original day column and drag distance to calculate day changes, so Saturday-to-Sunday moves work even with little right-side space.
- Drag target day columns are highlighted while moving, and the floating preview shows target weekday/start time/duration.
- Date and time controls keep compact field sizing but use larger text for readability.

## Athlete calendar / game load follow-up

- Athlete calendar supports week navigation with previous/next week controls and a current-week reset.
- Session cards adapt font size by card height so labels stay inside the card instead of spilling over the edge.
- Date/time fields use centered, larger text and tighter field widths to fit the actual value.
- Game load uses fixed RPE 10; athletes only adjust playing minutes with 1-minute granularity. This applies to the main composer and pending inline reporting.
- Resize handles stay wider in compact week cards and narrower in day/desktop cards.

## Athlete calendar mobile correction pass

- Compact week resize handle is back to the older smaller footprint; day/desktop handle remains narrow.
- Week reset is visible on mobile and labelled `↺ Week` instead of `Today`.
- Mobile session-card typography uses safer line-height and smaller compact detail text so labels and times are not vertically clipped.
- Mobile iOS date/time fields keep larger text, center the native value vertically, and desktop gets wider date/time boxes again.

## Athlete fullscreen chart fix

- Mobile fullscreen chart no longer hides at the `sm` breakpoint after rotation; the overlay stays active in landscape.
- Landscape fullscreen uses a dynamic-viewport chart area plus overlay scrolling, so short iPhone landscape screens can still reach the top and bottom of the graph.
- Fullscreen chart margins are slightly larger to prevent the graph from clipping at the top edge.

## Athlete fullscreen chart range update

- Fullscreen landscape now scales into the available viewport instead of requiring inner scrolling.
- Fullscreen range controls expose `14d`, `30d`, and `60d`; `7d` remains useful in the normal compact mobile graph, but fullscreen is for reading trends.
- Leaving fullscreen on mobile resets a `60d` fullscreen selection back to `30d` so the normal portrait graph stays readable without horizontal scrolling.

## Athlete quick navigation

- Athlete Today, Calendar, and Load are always reachable through a pinned navigation surface.
- Mobile uses a bottom tab bar with safe-area spacing; desktop uses a compact sticky top switcher below the athlete header.
- Trainer link remains a separate action, not a primary tab.

## Athlete load details

- Load graph can overlay acute and chronic load lines on top of daily load bars.
- Acute and chronic load lines are rendered as dashed supporting lines; the athlete-facing cards do not lead with raw acute/chronic numbers.
- The top Load cockpit replaces raw `7 days AU` with estimated AU room before overload or low-load gap. Today and Load both expose the ACWR gradient lane so the athlete can see whether the current EWMA value is low, optimal, or high.
- The Load tab leads with useful action context: estimated AU room before overload, low-load gap if the athlete is under the target range, current EWMA zone and a simple next-move hint.
- Training mix is shown as percentage distribution from the last 28 days so athletes and coaches can see which session types dominate the load.
- Attendance and readiness are present as explicit placeholders until those data models are connected.

## Athlete session cancellation

- Athlete calendar supports cancelling coach-planned team sessions before load input is due.
- Cancelled team sessions remain visible in the calendar and render red so the athlete still sees the original plan.
- Demo cancellation state is stored in localStorage; live cancellation writes an `availability` row with status `cancelled`.
- A cancelled session can be marked available again from the same session detail overlay.

## Warmup automation

- `warmup` is a first-class load training type with its own graph color and training-mix bucket.
- Every planned `game` session creates a derived warmup session 75 minutes before game start.
- The derived warmup follows the game if the game plan is moved or resized, and is removed when the game plan is deleted.
- Warmups are generated in demo and standard athlete calendar data so the behavior stays aligned.

## Availability status update

- Athletes can mark future team sessions as `late` or `out` directly from the session detail overlay.
- Availability starts as a compact three-choice state. Reason appears only after choosing `late` or `out`; expected delay minutes appears only after choosing `late`.
- Planned team sessions keep their team-defined session type locked in the athlete overlay. The athlete can report availability before the session is due, and can report load only after the session is due.
- `late` and `out` require a short reason; `late` also stores expected delay minutes.
- Live mode writes to the existing `availability` table using statuses `expected`, `late`, and `out`; demo mode mirrors the same behavior in localStorage.
- Cancelled/out sessions render red in the athlete calendar. Late sessions render blue so they are visible without implying absence.
- Warmup sessions inherit game availability context and are not edited independently.
