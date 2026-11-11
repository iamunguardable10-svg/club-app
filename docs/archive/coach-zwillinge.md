# Coach-Bereich: Zwillinge, geteilter Code und wer was trägt

Erhoben vor Run 2. Ergebnis widerlegt die naheliegende Annahme, der Coach-Bereich sei
durchgehend doppelt gebaut.

## Kernbefund 1: Es gibt nur drei echte Zwillingspaare

| # | Demo | Zeilen | Live | Zeilen |
|---|---|---|---|---|
| 1 | `DemoCoachWorkspaceRouter.tsx` | 813 | `CoachWorkspaceRouter.tsx` | 1820 |
| 2 | `DemoTeamWorkspace.tsx` | 705 | `TeamWorkspace.tsx` | 1011 |
| 3 | `DemoFacilityCalendar.tsx` | 901 | `FacilityCalendar.tsx` | 1201 |

Keine Nur-Demo- und keine Nur-Live-Komponente im Coach-Bereich.

## Kernbefund 2: Die gesamte UI-Schicht ist bereits geteilt

Diese Dateien existieren **einmal** und werden von Demo- wie Live-Seite gemeinsam
importiert:

`CoachDrawer` (70), `CoachSessionEditSheet` (211), `CoachSessionSurfaces` (915),
`CoachTypes` (52), `TeamWorkspaceView` (2000), `SmartSessionCalendar`,
`FacilityConflictDialog`, `sessionConflicts`, `WeeklySeriesBoard`,
`SeriesTemplateEditSheet`, `sessionSeriesPlanner`, `sessionTypeLabels`,
`loadCalculations`, `loadTypes`.

`DemoCoachWorkspaceRouter` importiert `CoachCalendarSurface`, `CoachSessionEditSheet`
und `normalizeCoachSessionType` direkt aus `CoachWorkspaceRouter.tsx`.

**Folge für den Umbau:** Die Doppelpflege beschränkt sich auf die drei datenholenden
Container. Bedien- und Darstellungslogik sind bereits vereinheitlicht und werden nicht
angefasst. Der Umbau ist damit deutlich kleiner als die 49 Demo-Dateien nahelegen — er
besteht im Kern daraus, in drei Containern den Datenzugriff auszutauschen.

## Kernbefund 3: Die Live-Seite trägt mehr Produktlogik

Das ist die wichtigste Korrektur an der ursprünglichen Planung. Die naheliegende Regel
„nimm die Demo-Variante, sie läuft ja schon ohne Backend" ist **falsch**.

**Nur in der Live-Variante vorhanden:**

- Echtes rollenbasiertes Berechtigungsmodell. `FacilityCalendar.canManageSession()`
  leitet Rechte aus `club_memberships` und `team_memberships` ab (`isClubAdmin`,
  `managedDepartmentIds`, `managedTeamIds`).
- Rollback: `handleCoachSeriesWeekConfirm` löscht bereits angelegte Sessions wieder,
  wenn die Serienbestätigung fehlschlägt.
- Granulare Fehlerbehandlung nach jedem Datenzugriff.
- Limit-Guards mit Warnung beim Erreichen der Zeilengrenze bei Konfliktprüfungen.
- Echtes Invite- und Join-Code-System (`invites`, RPC `get_or_create_team_join_code`).
- Migrationstolerante Fallbacks für noch nicht angewendete `session_series*`-Migrationen.
- Echte Rollenermittlung statt eines durchgereichten `role`-Props.

**Nur in der Demo-Variante vorhanden:**

- Fake-Daten-Generatoren: `automaticAvailabilityForSession()` (hash-basierte
  Absage-/Verspätungs-Flags), `demoBaselineEntriesForPlayer()` (42 Tage synthetische
  Historie), `demoLoadEntriesForSession()`, `buildDemoPlayerLoads()`,
  `ensureDemoPlayers()`, `ensureDemoPlayerGroups()`, `ensureSeedGroups()`,
  `fallbackSessions()`.
- Hartkodierte Team-Allowlist `DEMO_COACH_TEAM_IDS = {'basketball-u14-boys',
  'basketball-u16-boys'}` statt echter Rollenermittlung.
- `canManageDemoSession()` leitet Rechte **aus dem URL-Parameter `from` ab**
  (`from?.startsWith('coach')`). Für Admin- und Department-Kontexte gilt implizit
  „darf alles". Das ist keine Berechtigungsprüfung, sondern eine URL-Heuristik.
- `handleAddDemoPlayers()` — Schaltfläche zum Nachladen von 12 Fake-Spielern.

**Eine Ausnahme in die andere Richtung:** `attendanceRate` ist in der Live-Variante
`null` — das Feld existiert im Typ, wird aber serverseitig nie berechnet. Die
Demo-Variante liefert `82 + (index % 4) * 3` plus erfundene `attendanceEvents` und
`missedSessions`. Der Anwesenheits-Tab zeigt in der Demo also mehr, als die echte App
überhaupt berechnen kann. Beim Zusammenführen ist das eine offene Produktfrage, kein
Kopierfall.

## Daraus folgende Regel für die Zusammenführung

**Struktur und Produktlogik kommen von der Live-Variante. Nur der Datenzugriff wird
ersetzt.** Aus der Demo-Variante wird ausschließlich die Erzeugung von Testdaten
übernommen — und die gehört nicht in eine Komponente, sondern in `seed.ts`.

Konkret je Paar:

1. `CoachWorkspaceRouter` behalten, Supabase-Queries gegen die lokale Datenschicht
   tauschen, Auth-Redirect entfernen, Rollback und Fehlerbehandlung behalten.
   `DemoCoachWorkspaceRouter` entfällt.
2. `TeamWorkspace` genauso. `TeamWorkspaceView` (2000 Zeilen) bleibt unberührt.
   Invite- und Join-Code-Funktionen entfallen mit den Accounts.
3. `FacilityCalendar` behalten, inklusive `canManageSession()`. Die Rechteprüfung
   arbeitet künftig gegen die lokalen Mitgliedschaften statt gegen Supabase.
   Die URL-Heuristik der Demo-Variante wird **nicht** übernommen.

## Fußangel: verstreute localStorage-Schlüssel in den Demo-Containern

Die Demo-Container definieren eigene Speicherschlüssel **im Dateikopf**, nicht in
`demoStorage.ts`:

- `DemoCoachWorkspaceRouter`: `DEMO_AVAILABILITY_KEY`
  (`club-app.demo.athlete-availability`), `DEMO_FACILITY_ASSIGNMENTS_KEY`,
  `DEMO_PLAYER_GROUPS_KEY`, `DEMO_PLAYERS_KEY`
- `DemoTeamWorkspace`: `DEMO_INVITES_KEY`, `DEMO_PLAYERS_KEY`,
  `DEMO_EXTRA_COACH_ROLES_KEY`, `DEMO_FACILITY_ASSIGNMENTS_KEY`,
  `DEMO_PLAYER_GROUPS_KEY`

Mehrere davon sind **unabhängige Kopien derselben Schlüssel in zwei Dateien** mit je
eigenen get/save-Helfern. Genau das erzeugt die Doppelpflege, über die sich der
Umbau beklagt. Run 1 muss sie alle in die zentrale Datenschicht holen.

Bemerkenswert: `club-app.demo.athlete-availability` existiert bereits. Verfügbarkeit
ist also datenseitig angelegt, nur automatisch erzeugt und ohne Oberfläche zum Melden.

## Referenz: das bestehende Supabase-Schema

Die Live-Container greifen auf diese Tabellen zu. Das Schema ist durchdacht und
sollte als Vorlage für das lokale Schema dienen, statt es neu zu erfinden:

`teams`, `departments`, `facilities`, `department_facilities`, `team_memberships`,
`club_memberships`, `profiles`, `sessions`, `session_groups`, `session_series`,
`session_series_groups`, `session_series_week_state`, `player_groups`,
`player_group_members`, `load_entries`, `availability`, `invites`,
`team_coach_role_slots`.

Für den lokalen Modus entfallen `invites`, `team_coach_role_slots` und `profiles`
in ihrer Auth-Bedeutung. Der Rest bildet das lokale Schema.

## Nicht Coach-relevant

`SessionComposer` / `DemoSessionComposer` werden ausschließlich vom
Department-Lead-Bereich genutzt und entfallen mit ihm in Run 5.
`src/shared/components/facilities/*` (`FacilityAccentEnhancer`, `FacilityRowsEditor`,
`TeamDefaultFacilityLinkEnhancer`, `TeamDeleteEnhancer`) sind Admin- und
Onboarding-only.
