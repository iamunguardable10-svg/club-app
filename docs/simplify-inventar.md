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
