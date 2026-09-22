# Fortschritt der Vereinfachung

Übergabedatei zwischen den sechs Runs. Jeder Run startet kalt und kennt die
Entscheidungen der vorherigen nur aus dieser Datei. Jeder Run ergänzt sie.

Grundlagen: `docs/simplify-decisions.md`, `docs/simplify-inventar.md`,
`docs/coach-zwillinge.md`.

---

## Run 1 — Sicherung, Inventar, Datenschicht (erledigt)

### Was entstanden ist

`src/shared/data/` ist die zentrale lokale Datenschicht:

| Datei | Inhalt |
|---|---|
| `schema.ts` | Typen aller Entitäten, `LocalDatabase`, `LocalDataError` |
| `seed.ts` | Aufbau des Testvereins |
| `repository.ts` | einziger Lese- und Schreibzugriff, Selektoren, Mutationen |
| `migrations.ts` | Schemaversion, keine Datenübernahme |
| `useLocalData.ts` | React-Hook `useLocalDatabase()` |
| `index.ts` | öffentliche API |
| `loadTypes.ts`, `loadCalculations.ts` | aus `src/features/load/` hierher verschoben |

**Noch benutzt sie niemand.** Die App verhält sich exakt wie vorher. Das Umstellen der
Oberflächen ist Run 2 (Trainer) und Run 3/4 (Spieler).

### Öffentliche API

Alles über `import { ... } from '@/shared/data'`.

**Lesen**
- `useLocalDatabase()` → `{ database, error, ready }`. Abonniert Änderungen automatisch.
  Gibt `database: null` zurück, solange serverseitig gerendert wird oder der erste
  Client-Render läuft; dafür `ready` prüfen.
- `readDatabase()` → `LocalDatabase | null`. Nur außerhalb von React nötig.
- `subscribe(listener)` → Abmeldefunktion.

**Selektoren** (alle nehmen `database` als erstes Argument, sind rein):
`peopleWithRole`, `teamsForPerson`, `athletesForTeam`, `coachesForTeam`, `facilityById`,
`sessionsForTeam`, `sessionsForPerson`, `sessionsOnDay`, `seriesForTeam`,
`availabilityForSession`, `availabilityForPerson`, `availabilityFor`,
`loadEntriesForPerson`, `loadSummaryForPerson`, `getActivePerson`, `displayName`.

**Mutationen** (schreiben und benachrichtigen selbst):
`createSession`, `updateSession`, `deleteSession`, `setSeriesWeekState`,
`reportAvailability`, `recordLoadEntry`, `deleteLoadEntry`, `setActiveIdentity`,
`resetDatabase`, `mutate` (für alles Übrige).

**Belastung:** `loadSummaryForPerson(database, personId)` liefert `entries`, `series`,
`acwr`, `acuteLoad`, `chronicLoad`, `chronicFull`, `sevenDayLoad`, `zone`. **Rechne in
keiner Komponente selbst.** `chronicFull` ist false, solange weniger als 28 Tage
Historie vorliegen — dann keinen Quotienten anzeigen.

### Getroffene Entscheidungen und warum

**Ein Dokument statt vieler Schlüssel.** `club-app.local.db` hält die ganze Datenbank
als ein JSON-Objekt. Gemessen 327 KB bei vollem Seed, gegen etwa 5 MB Budget. 23
verstreute Schlüssel, die nur zusammen Sinn ergeben, sind genau der Grund, warum
Trainer- und Spieleransicht heute auseinanderlaufen können.

**Namensraum `club-app.local.*` von Anfang an.** Kollidiert nicht mit
`club-app.demo.*`, das die Demo-Verwaltungsbereiche weiter versorgt, und nimmt Run 6
die Umbenennung der Schlüssel ab. Run 6 findet in der Datenschicht nichts mehr zu
tun; sein Teil C betrifft nur noch die Altschlüssel.

**Keine Migration.** Laut `docs/simplify-decisions.md` Punkt 2 ist kein Datenbestand
erhaltenswert. `migrations.ts` führt nur die Schemaversion. Ändert ein späterer Run das
Schema, hebt er `SCHEMA_VERSION` an und die Daten werden beim nächsten Start neu gesät.

**Die alten `club-app.demo.*`-Schlüssel sind unangetastet.** Nicht gelesen, nicht
geschrieben, nicht gelöscht. Sie versorgen `/demo/admin/*` und `/demo/department/*`,
deren Verbleib offen ist (Punkt 4).

**`loadCalculations.ts` wurde nicht neu geschrieben.** Die ACWR-, EWMA-, Monotony- und
Strain-Rechnung war sauber gebaut und wurde unverändert nach `src/shared/data/`
verschoben. In `src/features/load/` stehen dünne Re-Export-Shims, damit
`AthleteLoadWorkspace` und `TeamWorkspaceView` unberührt weiterkompilieren.

**Abweichungen vom Supabase-Schema.** Zulässig laut Punkt 3, hier genutzt bei:
`Person` trägt keine Auth-Identität mehr (statt `profiles`); `Availability` ist ein
echter Datensatz mit Autor und Zeitstempel statt einer aus der Session-ID gehashten
Eigenschaft; `invites` und `team_coach_role_slots` entfallen ersatzlos.

**Fehler werden nicht verschluckt.** Fehlt das Dokument, wird gesät — das ist der
Normalfall beim ersten Start. Ist es vorhanden, aber nicht lesbar, wirft
`readDatabase()` einen `LocalDataError`. Der Hook reicht ihn als `error` durch. Eine
Oberfläche, die stillschweigend Testdaten anlegt, sähe für den Tester wie zufälliger
Datenverlust aus.

### Der Seed

`createSeedDatabase()` erzeugt den SV Ruhrtal, Abteilung Basketball:

- 2 Teams (U16 Jungen, U18 Mädchen), 24 Athletinnen und Athleten, 3 Trainerpersonen
- 3 Trainingsorte, davon einer abteilungsgebunden
- 8 wiederkehrende Einheiten, daraus 73 konkrete Einheiten über 42 Tage Vergangenheit
  und 21 Tage Zukunft
- 3 Spielergruppen
- Verfügbarkeitsmeldungen inklusive Absagen und Verspätungen
- 673 Belastungseinträge über **42 Tage** Historie

Gemessen nach dem Seed: alle 24 Athleten haben einen gültigen ACWR mit
`chronicFull: true`, Verteilung Ready 17 / Low 6 / High 1, Werte von 0,69 bis 1,37.
Der Seed ist für einen gegebenen Zeitpunkt deterministisch.

**Ein Fehler, der dabei gefunden und behoben wurde:** Die erste Fassung des
Zufallsgenerators nutzte einen `state * 31 + char`-Hash. Session-IDs unterscheiden sich
nur in den letzten Zeichen, weshalb die Ziehungen innerhalb einer Einheit korreliert
waren — bei manchen Einheiten meldete sich fast das ganze Team ab, bei anderen niemand.
Die Gesamtquote stimmte, die Verteilung nicht. Ersetzt durch FNV-1a plus Mulberry32 mit
Warmlauf. Wer den Seed erweitert, sollte die Verteilung messen und sich nicht auf die
Gesamtzahl verlassen.

### Sicherung

Tag `pre-simplify-2026-09` ist **lokal gesetzt**, ließ sich aber **nicht pushen**: Der
Remote bricht bei `git push origin refs/tags/...` reproduzierbar mit
`the remote end hung up unexpectedly` ab, während Branch-Pushes funktionieren. Das
sieht nach einer Einschränkung der Umgebung aus, nicht nach einem Repo-Problem.

Die Sicherung steht trotzdem: Der Ausgangsstand ist Commit **`543775f`**
(`fix: improve weekly graph modal hit targets`), und der liegt auf `origin/main`. Run 5
kann sich darauf berufen. Wer den Tag remote haben will, pusht ihn aus einer Umgebung
ohne diese Einschränkung nach.

### Was den nächsten Runs Probleme machen wird

**`AthleteLoadWorkspace.tsx` ist kein leeres Feld, sondern eine Fundgrube.** Die Datei
führt fünf eigene Demo-Schlüssel (`athlete-load-entries`, `athlete-load-plans`,
`athlete-cancelled-sessions`, `athlete-pending-ack`, `athlete-availability`) und hat
bereits einen funktionierenden lokalen Pfad für Last und Verfügbarkeit. Er ist nur fest
auf ein Team verdrahtet (`DEMO_PRIMARY_ATHLETE_TEAM_ID`) und in 3216 Zeilen vergraben.
Run 3 und 4 sollten dort zuerst nachsehen, bevor sie etwas neu bauen.

**`club-app.demo.facility-assignments` steht in sieben Dateien** als eigene Konstante
mit eigenen Helfern, `club-app.demo.invites` in fünf. Wer in Run 2 eine dieser Stellen
anfasst, sollte wissen, dass es die anderen sechs auch gibt.

**Die Attendance-Lücke ist echt.** Laut `docs/coach-zwillinge.md` setzt die
Live-Variante `attendanceRate` auf `null`, die Demo-Variante erfindet Werte. Mit
`availability` in der Datenschicht lässt sich die Quote jetzt erstmals **echt**
berechnen. Run 2 entscheidet das.

### Offene Punkte

1. `club-app.athlete-load.active-share-link` ist nicht einsortiert. Er gehört zu
   `/share/load`, das erhalten bleibt. Run 4 klärt ihn beim Umbau von
   `AthleteLoadWorkspace`.
2. `athlete-load-plans` und `athlete-pending-ack` haben noch keine Entsprechung im
   Schema. Ob die Spielerseite eine Planungsfunktion braucht, entscheidet Run 4; das
   Schema ist dafür erweiterbar.
3. Die Rechteprüfung ist noch nicht modelliert. `memberships` trägt die Rolle je Team,
   damit lässt sich `canManageSession()` in Run 2 lokal nachbauen — eine fertige
   Funktion dafür gibt es noch nicht.
4. Gruppenbasierte Einheiten (`groupIds`) sind im Schema vorhanden, aber der Seed
   erzeugt nur teamweite Einheiten. Run 2 sollte prüfen, ob der Kalender Gruppen
   braucht.

### Validierung

| Befehl | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün |
| Seed-Prüfung (42 Tage Historie, 24/24 gültiger ACWR, deterministisch) | bestanden |

---

## Run 2 — Trainerbereich auf die Datenschicht (erledigt)

### Was passiert ist

Alle drei datenholenden Container laufen jetzt auf `@/shared/data` und rufen keinen
Supabase-Client mehr auf.

| Datei | vorher | nachher | Vorgehen |
|---|---|---|---|
| `CoachWorkspaceRouter.tsx` | 1820 | 1327 | Ladeblock und Mutationen ersetzt, Oberfläche unberührt |
| `TeamWorkspace.tsx` | 1011 | 392 | neu geschrieben als dünner Container um `TeamWorkspaceView` |
| `FacilityCalendar.tsx` | 1201 | 1095 | nur Datenzugriff ersetzt, snake_case-Formen bewusst behalten |
| `coachData.ts` | — | 301 | neu: reiner Mapper von `LocalDatabase` auf die `Coach*`-Typen |

Die geteilte Oberflächenschicht (`TeamWorkspaceView`, `CoachSessionSurfaces`,
`CoachCalendarSurface`, `CoachSessionEditSheet`, `SmartSessionCalendar`,
`WeeklySeriesBoard` und die übrigen) wurde **nicht angefasst**. Das war der Punkt der
Kartierung in `docs/coach-zwillinge.md`: Die Doppelpflege saß nur in den Containern.

Netto: rund 1100 Zeilen weniger in den Containern, bei gleichem Funktionsumfang — die
301 neuen Zeilen im Mapper eingerechnet.

### Wichtig: der Trainerpfad erreicht Supabase weiterhin, über einen Umweg

Ein Import-Durchlauf über alle acht `/coach/*`-Einstiegspunkte erreicht 44 Dateien.
Zwei davon führen noch zu Supabase:

- `src/features/load/AthleteLoadWorkspace.tsx`
- `src/shared/lib/supabase/client.ts` (von ersterer importiert)

Ursache ist die `LoadChart`-Falle, die schon für `/share/load` dokumentiert war — sie
ist größer als gedacht. **Drei** Dateien importieren Diagrammkomponenten aus dem
3216 Zeilen langen Athleten-Workspace:

| Importeur | holt sich |
|---|---|
| `TeamWorkspaceView.tsx` | `LoadChart` |
| `features/players/PlayerLoadDetail.tsx` | `LoadChart`, `WeeklyLoadProfileGraph` |
| `features/load/AthleteLoadShareView.tsx` | `LoadChart` |

**Zur Laufzeit ist das folgenlos.** Alle `createBrowserSupabaseClient()`-Aufrufe liegen
in Funktionsrümpfen von `AthleteLoadWorkspace`, die der Trainerbereich nie rendert. Im
Browser ohne Umgebungsvariablen läuft der gesamte Trainerbereich fehlerfrei — das wurde
geprüft. Es ist ein Architektur- und Bündelungsproblem, kein Defekt.

**Nicht in Run 2 behoben, bewusst.** `LoadChart` hängt an Helfern, die in derselben
Datei stehen (`chartMargin`, `projectionSegments`, `plannedProjectionLoad`, der Typ
`LoadChartRange`). Ein sauberes Herauslösen ist ein eigener Durchgang durch eine sehr
große Datei und gehört dorthin, wo diese Datei ohnehin zerlegt wird: **Run 4**. Es an
das Ende eines bereits großen Runs zu hängen, ohne es danach vollständig nachzuprüfen,
wäre genau die Art Übergriff, die diese Reihenfolge verhindern soll.

**Für Run 4 heißt das:** Die Diagramme gehören in eine eigene Datei, etwa
`src/features/load/LoadCharts.tsx`, mit allen Helfern, die nur sie brauchen. Danach
ziehen die drei Importeure nach, und erst dann ist `grep` im Trainerpfad wirklich
leer. `/share/load` muss nach dieser Änderung mit einem echten Link geprüft werden.

### Entscheidungen

**`attendanceRate` wird jetzt echt berechnet.** Die Supabase-Variante setzte das Feld
auf `null`, die Demo-Variante erfand `82 + (index % 4) * 3`. Mit `availability` in der
Datenschicht ist die Quote ableitbar: vergangene Einheiten des Teams minus die, für die
sich die Person abgemeldet hat. Gemessene Werte im Seed: 96 %, 92 %, 88 %, 96 %, 79 %.
`missedSessions` und `attendanceEvents` kommen aus derselben Quelle. Bei null
vergangenen Einheiten liefert die Funktion `null`, damit die Oberfläche „keine Daten"
zeigen kann statt eines selbstbewussten 100 %.

**`/coach/calendar` wurde nicht eingeführt.** Die Kalenderfunktion bleibt unter
`/coach/sessions`. Grund: `/coach/sessions` ist an fünf Stellen verlinkt,
`/coach/calendar` an keiner. Eine Umbenennung hätte Verweise angefasst, ohne dass ein
Mensch etwas davon hat. Die Routenliste in `docs/simplify-decisions.md` war an dieser
Stelle illustrativ, nicht bindend.

**Die Rechteprüfung in `FacilityCalendar` ist erhalten und wurde härter.** Sie leitet
sich weiter aus Mitgliedschaften ab, jetzt aus den lokalen. Es gibt ohne Accounts keine
Clubadmins, also stammen Rechte ausschließlich aus Trainer-Mitgliedschaften: Man
verwaltet die eigenen Teams. Die URL-Heuristik der Demo-Variante
(`from?.startsWith('coach')`) wurde nicht übernommen — mit ihr konnte man sich durch
Ändern der Adresszeile Schreibrechte geben.

**Der Rollback bei der Serienbestätigung bleibt.** Ein lokaler Schreibvorgang schlägt
selten fehl, aber eine halb bestätigte Woche ist genau der Zustand, den ein Trainer
nicht von Hand reparieren kann.

**Invites, Join-Codes und getrennte Head-/Assistant-Rollen sind entfallen.** Sie setzen
Accounts voraus. Die zugehörigen Handler werden nicht mehr übergeben; die Ansicht
blendet ihre Bedienelemente selbst aus.

### Eine Korrektur an Run 1

Der Seed setzte `activeIdentity: null` — in der Annahme, die Auswahlseite aus Run 3
würde die Identität setzen. Damit wäre der Trainerbereich bis Run 3 leer und Run 2
nicht prüfbar gewesen. Der Seed setzt jetzt `{ role: 'coach', personId: 'coach-1' }`
als Startwert. `SCHEMA_VERSION` wurde entsprechend auf `-v2` angehoben.

Run 3 ersetzt diesen Startwert durch die Auswahlseite, behält ihn aber sinnvollerweise
als Rückfall, wenn noch nichts gewählt wurde.

### Muster für Run 3 und 4

Der Spielerbereich soll dieselbe Form benutzen, keine zweite erfinden:

1. `useLocalDatabase()` im Container, nicht `readDatabase()`.
2. Einen reinen Mapper danebenlegen (`coachData.ts` als Vorbild), der aus
   `LocalDatabase` die Typen baut, die die Ansicht schon erwartet. Der Mapper enthält
   keine Effekte und ist damit auch ohne Browser prüfbar.
3. Ableitungen in `useMemo` über `database`, kein `useEffect` mit `setState` für Daten.
4. Mutationen direkt über die Repository-Funktionen. Kein eigener Reload-Key — das
   Abonnement löst das Neuzeichnen aus.
5. Die Sichtbarkeit über Mitgliedschaften einschränken, so wie `buildCoachData` es tut.
   Ohne Accounts erzwingt das niemand mehr für uns.

### Offene Punkte

1. **Der Kader zeigt weiter eine Schaltfläche „Invite players".** Sie stammt aus
   `TeamWorkspaceView`, die laut Auftrag nicht angefasst wird, und läuft jetzt ins
   Leere. Run 5 räumt sie beim Entfernen der Einladungslogik mit weg.
2. **Der Hallenkalender wurde nur als Übersicht geöffnet**, nicht als Wochenansicht.
   Drag-and-drop, Konfliktprüfung und Serienbestätigung sind umgestellt, aber nicht
   von Hand durchgespielt. Run 3 sollte das mitnehmen, wenn es ohnehin im Kalender ist.
3. **Mobile Darstellung ungeprüft.** Die Prüfung lief in Desktop-Breite.
4. **`/admin/teams/[teamId]` rendert jetzt ebenfalls lokale Daten**, weil es dieselbe
   `TeamWorkspace` benutzt. Das ist unschädlich und eher eine Verbesserung; die Route
   entfällt ohnehin in Run 5.

### Validierung

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün |
| Prüfkette, Schritte 1, 7, 11 | bestanden, siehe `docs/local-mode-testplan.md` |
| Supabase-Aufrufe in den drei Trainer-Containern | keine mehr |
| Supabase über Importkette erreichbar | ja, 2 Dateien über `LoadChart` (siehe oben) |
| Trainerbereich ohne Umgebungsvariablen im Browser | läuft fehlerfrei |
