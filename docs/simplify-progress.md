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

---

## Run 3 — Einstieg, Identität, Verfügbarkeit (erledigt, teilweise zurückgenommen)

> **Überholt durch Run 4.** Die Spielerseiten aus diesem Run (`AthleteHome`,
> `AthleteCalendar`, `AthleteAvailability`, `AthleteLoadFrame`, `AthleteShell`) waren
> Doppelungen von Funktionen, die `AthleteLoadWorkspace` längst hatte, und wurden in
> Run 4 wieder entfernt. Bestand haben aus Run 3 nur die Startseite, der
> Identitätswechsel und der Portal-Fix. Siehe Run 4.

### Was entstanden ist

| Datei | Zeilen | Inhalt |
|---|---|---|
| `src/app/page.tsx` | 137 | Einstiegsseite, ersetzt die 370-zeilige Marketingseite |
| `features/identity/IdentitySwitcher.tsx` | 165 | Rollen- und Personenwechsel, überall erreichbar |
| `features/athlete/AthleteShell.tsx` | 122 | Hülle: Navigation, Identität, die drei geteilten Zustände |
| `features/athlete/AthleteHome.tsx` | 138 | heute und als Nächstes |
| `features/athlete/AthleteCalendar.tsx` | 106 | eigener Kalender, vergangen und kommend |
| `features/athlete/AthleteAvailability.tsx` | 196 | **Neubau**: melden, absagen, verspäten |
| `features/athlete/AthleteLoadFrame.tsx` | 116 | Rahmen mit den vorhandenen Werten, Eingabe folgt in Run 4 |

Der Spielerbereich und die Startseite erreichen über die gesamte Importkette
**19 Dateien und keinen Supabase-Client**. `AthleteLoadWorkspace` wird von keiner
Route mehr gerendert.

Drei Routen zeigten vorher dieselbe Komponente, die vierte war ein Platzhalter. Jetzt
hat jede ihre eigene Aufgabe.

### Ein Fehler, der ohne Prüfung bei Telefonbreite durchgerutscht wäre

Der Rollenwechsel war auf dem Telefon **nicht bedienbar**: Das Auswahlfenster lag
454 Pixel oberhalb des Bildschirms.

`os-panel` setzt `backdrop-filter: blur(24px)`. Ein backdrop-filter macht das Element
zum Bezugsrahmen für `position: fixed` seiner Nachkommen — das Fenster verankerte sich
am umgebenden Panel statt am Sichtfenster. Die Trainer-Seitenleiste trägt dieselbe
Klasse, wäre also genauso betroffen gewesen.

Behoben über ein Portal nach `document.body`. Ab 640 Pixel zentriert sich das Fenster
und lag zufällig im sichtbaren Bereich — eine reine Desktop-Prüfung hätte nichts
gemerkt. **Für Run 4: bei Telefonbreite prüfen, nicht am Desktop.** Und wer ein
Overlay in einen `os-panel` hängt, braucht ein Portal.

### Entscheidungen

**Die Verfügbarkeit ist auf Tempo gebaut.** Der alte Platzhalter nannte als Ziel
„unter 10 Sekunden, mobil einwandfrei" — das ist übernommen. Dabei und Absage sind ein
Tipp, nur die zwei Fälle, die für den Trainer sonst nutzlos wären, fragen nach:
wie viel später, warum nicht. Große Schaltflächen, weil das im Hallenausgang einhändig
benutzt wird.

**Keine Meldung heißt „dabei".** Es wird nur eine Zeile gespeichert, wenn jemand
später kommt oder absagt. Damit bedeutet „kein Eintrag" immer „wird erwartet", und der
Trainer sieht ausschließlich Abweichungen.

**Der Seed markiert seine Meldungen.** `Availability.seeded` trennt Testdaten von dem,
was jemand wirklich eingetippt hat. Die Spieleransicht zeigt „Gemeldet: …" nur für
echte Eingaben, sonst wäre nie erkennbar, ob eine Meldung angekommen ist.

**`/athlete/load` bekommt nur den Rahmen.** Die Werte stehen schon da, weil die
Datenschicht sie liefert; RPE-Eingabe, Diagramme und die ausführliche ACWR-Erklärung
sind Run 4. Der Rahmen sagt das ausdrücklich, statt Vollständigkeit vorzutäuschen.

**Keine Trainings- oder Gesundheitsempfehlung.** Der ACWR-Text ordnet ein („um 1 herum
heißt ähnlich viel wie zuletzt") und sagt ausdrücklich, dass es keine Empfehlung ist.

### Was Run 4 wissen muss

1. **Die `LoadChart`-Verflechtung ist jetzt der letzte Supabase-Rest im aktiven Pfad.**
   Der Trainerbereich erreicht über `TeamWorkspaceView` → `LoadChart` weiterhin
   `AthleteLoadWorkspace` und damit den Client. Run 4 zerlegt diese Datei ohnehin:
   Diagramme samt ihrer Helfer (`chartMargin`, `projectionSegments`,
   `plannedProjectionLoad`, Typ `LoadChartRange`) in eine eigene Datei, dann ziehen die
   drei Importeure nach. Danach ist `/share/load` mit einem echten Link zu prüfen.
2. **In `AthleteLoadWorkspace` steckt Brauchbares.** Fünf eigene Demo-Schlüssel und ein
   funktionierender lokaler Pfad für Last und Pläne — fest auf ein Team verdrahtet, aber
   die Logik ist da. Vor dem Neubau dort nachsehen.
3. **Der Rahmen in `AthleteLoadFrame` ist der Andockpunkt.** Werte und Erklärung stehen,
   es fehlen Eingabe, Diagramm und das Nachtragen ungeplanter Einheiten.
4. **Die Reset-Schaltfläche fehlt noch.** `resetDatabase()` liegt bereit; sie gehört
   sinnvollerweise in die Hülle, damit sie aus beiden Perspektiven erreichbar ist.

### Offene Punkte

1. `CoachTopNav` in `CoachWorkspaceRouter.tsx` ist toter Code — wird nirgends
   gerendert, die Navigation macht `CoachDrawer`. Run 5 räumt es weg.
2. Der Hallenkalender ist weiterhin nur als Übersicht geprüft, nicht als Wochenansicht.
   Steht seit Run 2 offen.
3. Die Trainersicht unterscheidet Seed-Meldungen nicht von echten. Für den Test war das
   kein Problem, könnte aber irritieren.
4. `/athlete/load` verweist auf „kommt im nächsten Schritt". Wenn Run 4 ausfällt, steht
   dieser Hinweis in der App.

### Validierung

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün |
| Prüfkette, Schritte 1–4 und 7–9, 11 | bestanden bei Telefonbreite |
| Supabase im Spieler- und Startseitenpfad | keine Treffer |
| Laufzeitfehler im Browser | keine |


---

## Run 4 — Spieler-Workspace portiert statt neu gebaut (erledigt)

### Eine Korrektur vorweg

Run 3 hat behauptet, die Verfügbarkeitsmeldung habe es „nirgends gegeben, weder demo
noch live", und die Spielerseite sei Neubau. **Das war falsch.** `AthleteLoadWorkspace`
enthielt die ganze Zeit:

- Verfügbarkeit mit Available / Late / Out, Pflichtgrund und Verspätungsminuten
- einen eigenen Wochenkalender (`AthleteCalendar`, rund 370 Zeilen), der auf dem
  Telefon sauber funktioniert
- ein RPE-Eingabeformular mit Lastvorschau (`PendingInlineForm`)
- ACWR-Anzeige mit Zoneneinordnung, Belastungsdiagramm, Wochenprofil, Prognose
- eigene Trainingspläne und automatische Aufwärmeinheiten vor Spielen

Die drei Routen `/athlete/home`, `/calendar`, `/load` zeigten nicht „dreimal dasselbe",
wie Run 3 schrieb, sondern übergaben `initialView` — eine Komponente mit drei Ansichten.

Der Fehler war methodisch: Run 3 hat sich auf den Platzhalter unter
`/athlete/availability` verlassen und nicht in die Datei geschaut, obwohl Run 1 den
Schlüssel `athlete-availability` genau dort gefunden hatte. Der Auftraggeber hat es
bemerkt, nicht der Run.

### Was stattdessen passiert ist

Derselbe Weg wie beim Trainer in Run 2: Datenzugriff austauschen, Oberfläche und
Produktlogik unverändert lassen.

1. **Neuer Adapter `src/features/load/athleteLocalStore.ts`.** Er bietet dieselben Lese-
   und Speicherformen, die der Workspace für seinen Demo-Modus schon benutzte, legt aber
   die gemeinsame Datenschicht darunter — pro aktiver Person statt fest auf ein Team.
2. **`AthleteLoadWorkspace` umgestellt.** Ladeeffekt aus der Datenschicht, sechs
   Supabase-Zweige entfernt, alle Demo-Helfer mit eigenen Schlüsseln entfernt. 3216 →
   2691 Zeilen. An der Oberfläche wurde nichts geändert außer dem Identitätswechsel im
   Kopf und einer Schutzabfrage, wenn kein Spieler gewählt ist.
3. **Run-3-Doppelungen entfernt.** Fünf Dateien unter `src/features/athlete/` sind weg.
   Die drei Routen zeigen wieder auf den Workspace, `/athlete/availability` leitet auf
   den Kalender um, wo die Verfügbarkeit gemeldet wird.
4. **Schema ergänzt:** `athletePlans` (eigene Trainingspläne), `acknowledgedSessions`
   (weggeklickte offene Einheiten), `shareLinks` (letzter Trainer-Link je Person).
   Version auf `2026-09-23-athlete-plans-v3` angehoben.
5. **Reset-Schaltfläche** im Identitätswechsel, aus beiden Perspektiven erreichbar,
   mit Bestätigung im selben Fenster statt Browser-Dialog.

### Die `LoadChart`-Verflechtung hat sich von selbst erledigt

Run 2 und 3 hatten dokumentiert, dass der Trainerpfad über `LoadChart` weiterhin den
Supabase-Client erreicht, und für Run 4 empfohlen, die Diagramme in eine eigene Datei
herauszulösen. **Das war nicht nötig.** Nachdem `AthleteLoadWorkspace` selbst kein
Supabase mehr importiert, ist der Import von `LoadChart` daraus unproblematisch. Die
Diagramme wurden nicht angefasst.

Nachgemessen über die gesamte Importkette:

| Pfad | Dateien | Supabase | eigene `localStorage`-Zugriffe |
|---|---|---|---|
| Startseite | 10 | 0 | 0 |
| Trainer (8 Routen) | 43 | 0 | 0 |
| Spieler (4 Routen) | 20 | 0 | 0 |
| Teilen | 18 | 0 | 0 |
| **alle zusammen** | | **0** | **nur `repository.ts`** |

Die aktive App erfüllt damit zwei Zielwerte der Definition of Done bereits: kein
Supabase, genau eine Datei mit Speicherzugriff. Die übrigen elf Dateien mit
`localStorage` sind ausschließlich Admin-, Department- und Demo-Zwillingsdateien.

### Entscheidungen

**Speichern aus State-Updatern, zeitversetzt.** Der Workspace speichert an sieben
Stellen *innerhalb* von React-State-Updatern (`setEntries((current) => { …; save(next);
return next; })`). Solange das nur localStorage schrieb, war es harmlos. Ein Schreiben
über das Repository benachrichtigt Abonnenten und setzt State — mitten in einem Render
ist das ein React-Fehler. Der Adapter verschiebt Schreibvorgänge per `queueMicrotask`
hinter den Render. Jeder Speichervorgang ersetzt die Sammlung der Person vollständig,
ein doppelter Aufruf im StrictMode schreibt also zweimal dasselbe. Die sieben Stellen
selbst wurden nicht umgebaut — das hätte Produktlogik berührt.

**Verfügbarkeit liest die ganze Menge, nicht das sichtbare Fenster.** Der Speicher-
vorgang ersetzt alle Meldungen der Person. Läse der Adapter nur die Einheiten im
Kalenderfenster, würde jeder Speichervorgang alle älteren Meldungen löschen.

**Seed-Markierung bleibt erhalten.** Eine unveränderte Meldung behält ihr
`seeded`-Flag. Sonst würde das Speichern einer einzigen Absage alle Seed-Meldungen als
„vom Tester eingetragen" umetikettieren.

**`loadSummaryForPerson` rechnet jetzt EWMA.** Vorher gleitendes Mittel, während
Spieler-Cockpit und Trainerkader EWMA zeigen. Nachdem die Run-3-Seiten weg sind, nutzt
die Funktion niemand — aber ein späterer Run hätte sich darauf verlassen und für
denselben Spieler eine andere Zahl bekommen als auf dem Bildschirm.

**Keine separate Verfügbarkeitsseite.** Der alte Platzhalter hatte eine eigene
Schnellmelde-Seite vorgesehen („unter 10 Sekunden"). Die bestehende Meldung im Kalender
braucht zwei Taps plus einen kurzen Grund. Zwei Oberflächen für dieselbe Sache wären
genau die Doppelpflege, die der Umbau beseitigen soll. Wenn eine Schnellliste später
gewünscht ist, gehört sie in den Workspace, nicht daneben.

### Offene Punkte

1. **Sprache ist gemischt.** Startseite und Identitätswechsel sind deutsch, der
   Spieler-Workspace und der Trainerbereich englisch. Das war schon vorher uneinheitlich
   und ist kein Teil dieses Umbaus, fällt aber jetzt stärker auf.
2. **Die Trainerseite unterscheidet Seed-Meldungen nicht von echten** (seit Run 3).
3. **Eigene Trainingspläne** sind portiert, aber nicht von Hand durchgespielt.
4. **Hallenkalender** als Wochenansicht nicht von Hand geprüft (seit Run 2).
5. `CoachTopNav` ist toter Code (seit Run 3), die Schaltfläche „Invite players" läuft
   ins Leere (seit Run 2). Beides für Run 5.

### Was Run 5 wissen muss

- Die aktive App ist Supabase-frei. Was Run 5 löscht, ist ausschließlich Code, den
  keine aktive Route mehr erreicht. Die Tabelle oben ist der Beleg.
- `src/features/load/AthleteLoadShareView.tsx` bleibt, `/share/load` bleibt. Die
  `LoadChart`-Warnung aus Run 2 ist gegenstandslos.
- Die Frage nach `/demo/admin/*` und `/demo/department/*` ist weiter offen. Diese
  Bereiche lesen die alten `club-app.demo.*`-Schlüssel, die weiter unangetastet liegen.

### Validierung

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün |
| Prüfkette | Schritte 1–11 bestanden, Details in `docs/local-mode-testplan.md` |
| Supabase im aktiven Pfad | 0 Dateien |
| Laufzeitfehler im Browser | keine |
