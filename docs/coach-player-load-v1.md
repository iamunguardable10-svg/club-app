# Coach Player Load V1

## Product intent

The coach should be able to tap a player from the Team Workspace and immediately understand whether that player is ready, overloaded, underloaded, absent too often, or missing feedback.

This is a team-context surface, not a club-admin surface. It must work for a coach with one team before it depends on department or club adoption.

## Entry points

- Team Workspace -> Players -> tap player
- Team session details -> attendance list -> tap player
- Future coach load cockpit -> player row/card -> tap player
- Trainer link -> external read-only player load view

## First screen shape

The first version should be a player detail overlay or page with:

- Player header: name, team, availability/readiness state, latest load status
- Load graph: same athlete load engine, filtered to this player
- Today / next session: planned team session, pending input, or rest state
- Recent entries: last reported sessions with type, RPE, duration, load
- Coach notes area later; keep V1 read-first unless permissions are clear

## Insights below the load graph

Useful coach insights:

- Attendance rate: last 7 / 14 / 30 days and season-to-date later
- Missed sessions: unexcused, excused, injury/illness when available
- Feedback compliance: planned sessions without athlete load input
- Load trend: acute/chronic state, spike warning, low-load warning
- Session balance: team, strength, game, individual, recovery distribution
- Availability trend: recurring unavailable days or late changes
- Return-to-play flag: only if injury/medical status is explicitly modeled
- Minutes/game: for game sessions, because RPE is fixed at 10 and minutes become the meaningful variable

## Permissions

- Athlete sees own data.
- Coach sees players in their own teams.
- Department lead sees players in their department teams.
- Club admin sees all club players.
- Trainer link is read-only and must be explicitly activated by the athlete.

## Data dependencies

Required or already implied:

- `load_entries`
- planned team sessions
- player/team membership
- attendance records
- trainer-share tokens

Likely next tables or columns:

- attendance status per session/player
- athlete availability/readiness check-in
- optional coach notes with strict visibility

## UX constraints

- Do not duplicate the athlete cockpit exactly; the coach view is diagnostic and comparative.
- Keep player detail in team context with explicit back navigation.
- On mobile, open player detail as a focused full-screen surface from the Players tab.
- Warnings appear only when there is a real blocker or risk: missing load input, high spike, repeated absence, or no baseline yet.

## Player load detail refinement

- Player cards in Team Workspace show the EWMA ACWR value and are sorted by load risk by default, with an A-Z fallback. Color coding uses blue for low load, green for the optimal 0.8-1.3 lane, and red for high load.
- The player detail overlay no longer leads with empty metric cards. It opens with an ACWR gauge, estimated room before overload/underload, graph, attendance flags, and training-mix distribution.
- The ACWR gauge marker must sit above the gradient lane, not below it, so the current value is visually unambiguous.
- Opening a player detail locks background page scroll to prevent accidental calendar/player inputs behind the overlay.
- Coach attendance insight starts with a 30-day range and can switch to 60 or 90 days. It lists `late` and `out` session records with reason and late minutes where available.
- Demo player data now includes representative late/out attendance events so the coach surface can be reviewed without setup.

## Coach session detail signals

Coach-facing session details should focus on who needs action, not generic session metadata.

Useful sections:

- expected players: players marked expected or late; out/cancelled players are excluded
- late players: yellow state with expected delay and reason
- out players: red state with reason
- load risks: players currently high or low by EWMA ACWR
- expandable expected-player list for the coach to quickly scan who is coming
- context: team, department and facility, shown below the action-relevant sections

Avoid empty summary cards such as `scope`, `load prepared`, or generic `context` blocks when they do not help the coach decide.

Player detail should also include:

- average training minutes over the selected recent period
- average game minutes where game/session data exists
- training mix as a visual percentage breakdown by session type

Schema note:

- Games are represented as a session/training type, not as a separate unrelated event model in V1. The canonical database decision lives in `docs/v1-decisions.md`.
- Average game minutes should be calculated by filtering game-type sessions, not by introducing a separate games table.
