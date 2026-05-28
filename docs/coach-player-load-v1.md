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
