# Routen-Inventar (Ausgangsstand vor dem Umbau)

Erhoben vor Run 1. 67 `page.tsx` unter `src/app`. Je Route: gerenderte Hauptkomponente,
Supabase-Bezug (geprüft in der Komponentendatei, nicht nur in der `page.tsx`),
localStorage-Nutzung, Zeilenzahl der Hauptkomponente, Zielentscheidung.

**35 der 67 Routen hängen an Supabase.** Alle 26 `/demo`-Routen kommen ohne aus — das
ist der Grund, warum die Demo-Seite beim Zusammenführen in der Regel die Vorlage
liefert.

## Auffälligkeiten

- `AthleteLoadWorkspace` hat **3216 Zeilen** und bedient allein drei Routen
  (`/athlete/home`, `/athlete/calendar`, `/athlete/load`) mit identischem Inhalt.
  Die größte Einzeldatei im Repo.
- `CoachWorkspaceRouter` (1820 Zeilen) bedient acht Routen, sein Demo-Zwilling
  `DemoCoachWorkspaceRouter` (813 Zeilen) sieben. Die Live-Variante ist mehr als
  doppelt so groß bei gleichem Funktionsumfang.
- `FacilityCalendar` (1201) gegen `DemoFacilityCalendar` (901) — dasselbe Muster.
- `/athlete/availability` und `/admin/coaches` sind reine `PlaceholderPage` (49 Zeilen).
- `/demo/admin/settings` und `/admin/settings` rendern beide dieselbe `AdminShell`.

## /demo/* — 26 Routen, 0 mit Supabase

| Route | Hauptkomponente | Supabase | localStorage | Zeilen | Ziel |
|---|---|---|---|---|---|
| /demo | DemoPage (in page.tsx) | nein | nein | 77 | entfernen (Run 5) |
| /demo/admin/departments/[departmentName] | DemoAdminDepartmentWorkspace | nein | ja | 655 | entfernen |
| /demo/admin/departments | DemoAdminDepartmentsManager | nein | ja | 357 | entfernen |
| /demo/admin/facilities/[facilityName]/calendar | DemoFacilityCalendar | nein | ja | 901 | entfernen |
| /demo/admin/facilities | DemoAdminFacilitiesManager | nein | ja | 468 | entfernen |
| /demo/admin/overview | DemoAdminOverview | nein | ja | 329 | entfernen |
| /demo/admin/people | DemoAdminPeopleManager | nein | ja | 387 | entfernen |
| /demo/admin/settings | AdminShell | nein | nein | 68 | entfernen |
| /demo/admin/setup | DemoAdminSetupDashboard | nein | ja | 165 | entfernen |
| /demo/admin/teams/[teamId] | DemoTeamWorkspace | nein | ja | 705 | entfernen |
| /demo/admin/teams | DemoTeamsManager | nein | ja | 50 | entfernen |
| /demo/coach/attendance | DemoCoachWorkspaceRouter | nein | ja | 813 | **Vorlage für /coach (Run 2)** |
| /demo/coach/facilities/[facilityName]/calendar | DemoFacilityCalendar | nein | ja | 901 | **Vorlage für /coach** |
| /demo/coach/facilities | DemoCoachWorkspaceRouter | nein | ja | 813 | **Vorlage für /coach** |
| /demo/coach/history | DemoCoachWorkspaceRouter | nein | ja | 813 | **Vorlage für /coach** |
| /demo/coach/load | DemoCoachWorkspaceRouter | nein | ja | 813 | **Vorlage für /coach** |
| /demo/coach/sessions | DemoCoachWorkspaceRouter | nein | ja | 813 | **Vorlage für /coach** |
| /demo/coach/team | DemoCoachWorkspaceRouter | nein | ja | 813 | **Vorlage für /coach** |
| /demo/coach/today | DemoCoachWorkspaceRouter | nein | ja | 813 | **Vorlage für /coach** |
| /demo/create-club | DemoCreateClubForm | nein | ja | 249 | entfernen |
| /demo/department/coaches | DemoAdminPeopleManager | nein | ja | 387 | entfernen |
| /demo/department/facilities | DemoAdminDepartmentWorkspace | nein | ja | 655 | entfernen |
| /demo/department/overview | DemoAdminDepartmentWorkspace | nein | ja | 655 | entfernen |
| /demo/department/schedule | DemoAdminDepartmentWorkspace | nein | ja | 655 | entfernen |
| /demo/department/settings | DemoAdminDepartmentWorkspace | nein | ja | 655 | entfernen |
| /demo/department/teams | DemoAdminDepartmentWorkspace | nein | ja | 655 | entfernen |

Nach Run 2 leiten die sieben `/demo/coach/*`-Routen auf `/coach/*` weiter; Run 5
entfernt sie.

## /admin/* — 12 Routen, 10 mit Supabase

| Route | Hauptkomponente | Supabase | localStorage | Zeilen | Ziel |
|---|---|---|---|---|---|
| /admin/calendar | AdminCalendarDashboard | ja | nein | 369 | entfernen (Run 5) |
| /admin/coaches | PlaceholderPage | nein | nein | 49 | entfernen |
| /admin/departments/[departmentId] | AdminDepartmentWorkspace | ja | nein | 1249 | entfernen |
| /admin/departments | AdminDepartmentsManager | ja | nein | 486 | entfernen |
| /admin/facilities/[facilityId]/calendar | FacilityCalendar | ja | nein | 1201 | entfernen |
| /admin/facilities | AdminFacilitiesManager | ja | nein | 467 | entfernen |
| /admin/overview | AdminOverview | ja | ja | 464 | entfernen |
| /admin/people | AdminPeopleManager | ja | nein | 697 | entfernen |
| /admin/settings | AdminShell | nein | nein | 68 | entfernen |
| /admin/setup | AdminSetupDashboard | ja | nein | 349 | entfernen |
| /admin/teams/[teamId] | TeamWorkspace | ja | nein | 1011 | entfernen |
| /admin/teams | AdminTeamsManager | ja | nein | 133 | entfernen |

## /department/* — 6 Routen, alle mit Supabase

Alle sechs rendern denselben `DepartmentLeadWorkspaceRouter` (188 Zeilen) mit
unterschiedlichem `mode`. Ziel: alle entfernen (Run 5).

| Route | mode |
|---|---|
| /department/coaches | coaches |
| /department/facilities | facilities |
| /department/overview | overview |
| /department/schedule | schedule |
| /department/settings | settings |
| /department/teams | teams |

## /coach/* — 8 Routen, alle mit Supabase

| Route | Hauptkomponente | Supabase | localStorage | Zeilen | Ziel |
|---|---|---|---|---|---|
| /coach/attendance | CoachWorkspaceRouter | ja | nein | 1820 | bleibt, kanonisch |
| /coach/facilities/[facilityId]/calendar | FacilityCalendar | ja | nein | 1201 | bleibt, kanonisch |
| /coach/facilities | CoachWorkspaceRouter | ja | nein | 1820 | bleibt, kanonisch |
| /coach/history | CoachWorkspaceRouter | ja | nein | 1820 | bleibt, kanonisch |
| /coach/load | CoachWorkspaceRouter | ja | nein | 1820 | bleibt, kanonisch |
| /coach/sessions | CoachWorkspaceRouter | ja | nein | 1820 | bleibt, kanonisch |
| /coach/team | CoachWorkspaceRouter | ja | nein | 1820 | bleibt, kanonisch |
| /coach/today | CoachWorkspaceRouter | ja | nein | 1820 | bleibt, kanonisch |

`/coach/calendar` existiert heute nicht — die Kalenderfunktion liegt unter
`/coach/sessions`. Run 2 entscheidet, ob umbenannt oder beibehalten wird.

## /athlete/* — 4 Routen, 3 mit Supabase

| Route | Hauptkomponente | Supabase | localStorage | Zeilen | Ziel |
|---|---|---|---|---|---|
| /athlete/home | AthleteLoadWorkspace | ja | ja | 3216 | bleibt, eigener Inhalt (Run 3) |
| /athlete/calendar | AthleteLoadWorkspace | ja | ja | 3216 | bleibt, eigener Inhalt (Run 3) |
| /athlete/load | AthleteLoadWorkspace | ja | ja | 3216 | bleibt, eigener Inhalt (Run 4) |
| /athlete/availability | PlaceholderPage | nein | nein | 49 | **Neubau (Run 3)** |

Drei Routen zeigen dasselbe, die vierte zeigt nichts. Das ist der schwächste Bereich
der App und der größte Einzelposten des Umbaus.

## /auth/* — 3 Routen, alle mit Supabase

| Route | Hauptkomponente | Zeilen | Ziel |
|---|---|---|---|
| /auth/login | LoginForm | 109 | entfernen (Run 5) |
| /auth/signup | SignupForm | 156 | entfernen |
| /auth/callback | AuthCallback | 64 | entfernen |

## Sonstige — 8 Routen, 5 mit Supabase

| Route | Hauptkomponente | Supabase | Zeilen | Ziel |
|---|---|---|---|---|
| / | LandingPage (in page.tsx) | nein | 370 | **wird Auswahlseite (Run 3)** |
| /app | WorkspaceRouter | ja | 140 | entfernen (Run 5) |
| /onboarding | OnboardingPage (in page.tsx) | nein | 130 | entfernen |
| /onboarding/create-club | CreateClubForm | ja | 309 | entfernen |
| /onboarding/create-club/start | CreateClubStartRouter | ja | 108 | entfernen |
| /invite/[token] | InviteAcceptancePage | ja | 139 | entfernen |
| /join/[code] | TeamJoinCodePage | ja | 171 | entfernen |
| /share/load | AthleteLoadShareView | nein | 70 | **bleibt** — siehe unten |

## Urteil zu /share/load: bleibt

Die Route läuft vollständig ohne Account und ohne Supabase. `AthleteLoadShareView`
(70 Zeilen) liest den Query-Parameter `data`, dekodiert ihn clientseitig über
`decodeAthleteLoadShare()` (Base64URL plus `JSON.parse`, in
`src/features/load/athleteLoadShare.ts`) und rendert das Ergebnis. Kein Netzwerk-,
Auth- oder Storage-Zugriff. Bei fehlendem oder ungültigem Parameter erscheint lokal
eine Fehleranzeige, keine Weiterleitung zur Anmeldung.

**Eine Fußangel für Run 5:** `AthleteLoadShareView` importiert `LoadChart` aus
`AthleteLoadWorkspace.tsx` — also aus genau der Datei, die Supabase nutzt. Unschädlich
ist das nur, weil alle `createBrowserSupabaseClient()`-Aufrufe dort in
Funktionsrümpfen liegen und nicht auf Modulebene; der Import allein löst keine
Initialisierung aus.

Wer `AthleteLoadWorkspace.tsx` in Run 4 oder 5 umbaut oder löscht, muss `LoadChart`
vorher herauslösen, sonst bricht `/share/load`. Das ist die unauffälligste
Abhängigkeit im ganzen Repo.

---

# Inventar der lokalen Speicherschlüssel

Erhoben in Run 1. 23 verschiedene Schlüssel, verteilt über 13 Dateien.

## Der eigentliche Befund

Nur 8 der Schlüssel sind in `demoStorage.ts` sauber deklariert. Die übrigen 15 werden
**in den Komponenten selbst** definiert, häufig mehrfach: `club-app.demo.facility-assignments`
steht in **sieben** Dateien als eigene Konstante mit eigenen get- und save-Helfern,
`club-app.demo.invites` in fünf, `club-app.demo.players` und `.player-groups` in je zwei.

Das ist die Doppelpflege, gegen die der Umbau antritt: Ein Fehler im Lesen einer
Hallenzuordnung muss heute an sieben Stellen behoben werden.

Zweiter Befund: `AthleteLoadWorkspace.tsx` führt **fünf eigene Demo-Schlüssel** für Last,
Pläne, Absagen, Bestätigungen und Verfügbarkeit. Die Spielerseite hat also bereits einen
lokalen Datenpfad — er steckt nur unerreichbar in einer 3216-Zeilen-Datei und ist fest
auf ein einziges Team (`DEMO_PRIMARY_ATHLETE_TEAM_ID`) verdrahtet. Für Run 3 und 4 ist
das eine Fundgrube, kein leeres Feld.

## Tabelle

Zielspalte: `neu` = geht in `club-app.local.db` auf; `bleibt` = versorgt die
Demo-Verwaltungsbereiche und wird nicht angefasst; `weg` = entfällt mit seinem Bereich.

| Schlüssel | Deklariert in | Inhalt | Ziel |
|---|---|---|---|
| `club-app.demo.club-setup` | demoStorage | Verein, Abteilungen, Hallen | neu → `club`, `departments`, `facilities` |
| `club-app.demo.teams` | demoStorage | Teams | neu → `teams` |
| `club-app.demo.sessions` | demoStorage | Einheiten | neu → `sessions` |
| `club-app.demo.session-series` | demoStorage | Serien | neu → `sessionSeries` |
| `club-app.demo.session-series-week-states` | demoStorage | Wochenbestätigungen | neu → `sessionSeriesWeekStates` |
| `club-app.demo.facility-assignments` | demoStorage + **6 weitere** | Abteilung ↔ Halle | neu → `departmentFacilities` |
| `club-app.demo.facility-meta` | demoStorage | Altlast, Hallendetails | weg, bereits durch `facilityDetails` ersetzt |
| `club-app.demo.version` | demoStorage | Datenversion | neu → `version` im Dokument |
| `club-app.demo.players` | DemoCoachWorkspaceRouter, DemoTeamWorkspace | Spieler | neu → `people` + `memberships` |
| `club-app.demo.player-groups` | DemoCoachWorkspaceRouter, DemoTeamWorkspace | Gruppen | neu → `playerGroups` |
| `club-app.demo.athlete-availability` | AthleteLoadWorkspace, DemoCoachWorkspaceRouter | Verfügbarkeit | neu → `availability` |
| `club-app.demo.athlete-load-entries` | AthleteLoadWorkspace | RPE und Dauer | neu → `loadEntries` |
| `club-app.demo.athlete-load-plans` | AthleteLoadWorkspace | geplante Einheiten | neu, falls Run 4 die Planung übernimmt |
| `club-app.demo.athlete-cancelled-sessions` | AthleteLoadWorkspace | Absagen | neu → `availability` mit Status `out` |
| `club-app.demo.athlete-pending-ack` | AthleteLoadWorkspace | Quittierung offener Meldungen | neu, falls Run 4 sie braucht |
| `club-app.demo.invites` | 5 Dateien | Einladungen | weg, setzt Accounts voraus |
| `club-app.demo.extra-coach-roles` | DemoTeamWorkspace, DemoAdminPeopleManager | Zusatzrollen | weg mit dem Admin-Bereich |
| `club-app.demo.facility-requests` | 3 Admin-Dateien | Hallenanfragen | bleibt (Demo-Verwaltung) |
| `club-app.demo.overview-dismissed-warnings` | DemoAdminOverview | ausgeblendete Hinweise | bleibt (Demo-Verwaltung) |
| `club-app.demo.facilities-changed` | Admin-Dateien | Änderungssignal | bleibt (Demo-Verwaltung) |
| `club-app.admin.overview-dismissed-warnings` | AdminOverview | ausgeblendete Hinweise | weg mit `/admin/*` |
| `club-app.admin.facilities-changed` | Admin-Dateien | Änderungssignal | weg mit `/admin/*` |
| `club-app.athlete-load.active-share-link` | AthleteLoadWorkspace | aktiver Teilen-Link | prüfen in Run 4, gehört zu `/share/load` |

## Entscheidung zur Namensgebung

Die neue Datenschicht nutzt den Namensraum `club-app.local.*` und **ein einziges**
Dokument: `club-app.local.db`, dazu `version` im Dokument selbst.

Zwei Gründe. Erstens kollidiert sie damit nicht mit `club-app.demo.*`, das die
Demo-Verwaltungsbereiche weiter versorgt — beide können nebeneinander bestehen, solange
die Entscheidung aus `docs/simplify-decisions.md` Punkt 4 offen ist. Zweitens nimmt es
Run 6 die Umbenennungsarbeit ab: Die neuen Schlüssel tragen von Anfang an den richtigen
Namen.

Ein Dokument statt 23 Schlüssel, weil die Datenmenge klein ist (gemessen: 327 KB bei
vollem Seed, gegen etwa 5 MB Budget) und ein einzelnes Dokument konsistent gelesen und
geschrieben wird. 23 Schlüssel, die nur zusammen Sinn ergeben, sind der Grund, warum
heute Trainer- und Spieleransicht auseinanderlaufen können.
