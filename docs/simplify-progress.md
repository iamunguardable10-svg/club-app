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


---

## Run 5 — Löschen (erledigt)

### Zielwerte

| Kennzahl | Start | Ziel | nach Run 5 |
|---|---|---|---|
| Aktive Routen | 67 | etwa 20 | **14** |
| Zeilen unter `src` | 28.244 | ~~etwa 12.000~~ verworfen | 13.612 |
| Dateien unter `src` | — | — | 50 |
| Dateien mit Supabase-Code | 26 | 0 | **0** |
| Dateien mit `localStorage`-Zugriff | 13 | 1 | **1** (`repository.ts`) |
| Laufzeitabhängigkeiten | 9 | — | 4 (`next`, `react`, `react-dom`, `recharts`) |

Das Zeilenziel wurde nach Run 5 verworfen (siehe `docs/simplify-decisions.md`, Punkt 7).
Zur Einordnung: Das verbliebene Volumen steckt fast
vollständig in wenigen großen Oberflächendateien, die funktionieren und genutzt werden:
`AthleteLoadWorkspace` (2691), `TeamWorkspaceView` (1994), `CoachWorkspaceRouter`
(1312), `FacilityCalendar` (1062), `CoachSessionSurfaces` (915). Weiteres Löschen wäre
dort Funktionsverlust. Der nächste sinnvolle Schritt wäre, diese Dateien zu zerlegen —
das macht sie wartbarer, aber kaum kürzer, und es ist ein eigener Auftrag.

### Was entfernt wurde

**Routen (53):** `/admin/*` (12), `/department/*` (6), `/demo/*` (26, darunter die
Weiterleitungen aus Run 2), `/auth/*` (3), `/onboarding/*` (3), `/invite/[token]`,
`/join/[code]`, `/app`.

**Dateien (53, rund 13.900 Zeilen):** per Importanalyse aller verbliebenen Seiten
bestimmt, nicht nach Liste. Darunter der gesamte Admin-Baum (live und demo), Auth,
Onboarding, Einladungen, die drei Demo-Zwillinge des Trainerbereichs,
`DepartmentLeadWorkspaceRouter`, `DepartmentLeadDrawer`, `SessionComposer` (beide
Varianten), `demoStorage.ts`, `DemoAreaNav`, der Supabase-Client
(`src/shared/lib/supabase/`), die Hallen-Enhancer aus dem Admin-Bereich,
`AdminShell`, `Card`, `PlaceholderPage`, `src/entities/`, der
`GeoapifyAddressEnhancer` samt Geoapify-Anbindung.

**Pakete (5):** `@supabase/supabase-js`, `framer-motion`, `lucide-react`, `clsx`,
`tailwind-merge`. Keine Nutzung mehr, auch nicht in Konfigurationsdateien.

**Innerhalb verbliebener Dateien:** Admin- und Department-Navigation in
`FacilityCalendar`, der `departmentNav`-Zweig in `TeamWorkspaceView`, `CoachTopNav`
(toter Code), die Karte „Invite players", die Pfadvariante `/demo/coach` in den Typen.

**Bleibt:** `supabase/` mit SQL und Migrationen, `docs/database-schema.md`,
`docs/rls-access-model.md` — Referenz für ein späteres Backend. `/share/load` und
`AthleteLoadShareView`.

### Wiederherstellen

Alles Entfernte liegt in Commit **`543775f`** auf `origin/main`. Der Tag
`pre-simplify-2026-09` existiert nur lokal (Tag-Pushes brachen in dieser Umgebung ab,
siehe Run 1).

```bash
git checkout 543775f -- src/features/admin      # Beispiel: Admin-Bereich zurückholen
```

### Weitere Änderungen

**`GeoapifyAddressEnhancer` entfernt.** Er hing global im Layout und beobachtete jede
Seite, um Adressfelder mit Autovervollständigung über eine externe API zu versehen. Es
gibt kein einziges Adressfeld mehr; alle lagen in den Admin-Formularen. Die App braucht
damit keine Umgebungsvariable mehr, auch keine optionale.

**Verwaiste Speicherschlüssel werden beim Start entfernt.** `club-app.demo.*`,
`club-app.admin.*`, `club-app.athlete-load.*` — ihre Leser sind gelöscht. Das
Repository räumt sie einmal pro Seitenaufruf weg (`LEGACY_KEY_PREFIXES` in
`migrations.ts`).

**Hallenkalender: Rückweg und Rechte.**
- Fehlte `?from=` in der Adresse, führte „Back" nach `/app` — gerade gelöscht. Jetzt
  immer zurück zur Hallenübersicht oder zum Team.
- Ob man eine Einheit öffnen durfte, hing an `from?.startsWith('coach')`. Ohne den
  Parameter ließ sich die Detailansicht fremder Einheiten öffnen. Jetzt entscheidet
  ausschließlich `canManageSession()`, und die Schreibstelle für Verschiebungen prüft
  zusätzlich selbst.
- **Korrektur einer Einschätzung im Gespräch:** Ich hatte zunächst gesagt, man hätte
  ohne `from` fremde Einheiten verschieben können. Das stimmt nicht — `startSessionDrag`
  prüfte schon vorher selbst, und Bearbeiten und Löschen prüften beim Schreiben. Es war
  eine Ungereimtheit mit Lesezugriff, kein Schreibloch. Im Browser belegt: Eine fremde
  U18-Einheit bleibt beim Ziehen unverändert, eine eigene U16-Einheit verschiebt sich.
- Die Trainer-Navigation erscheint jetzt immer; die Route liegt ausschließlich unter
  `/coach`.

**Identitätswechsel in der Team-Ansicht auf dem Telefon.** Fehlte seit Run 3, siehe
`docs/local-mode-testplan.md`.

**„Invite players"** war entgegen meiner Notiz aus Run 2 keine Schaltfläche ins Leere,
sondern eine statische Karte. Sie versprach eine Funktion, die es ohne Konten nicht
gibt, und ist entfernt.

### Projektregeln nachgezogen

`AGENTS.md`, `CLAUDE.md`, `.agents/skills/club-os/SKILL.md`, `README.md`,
`docs/v1-decisions.md`, `docs/core-flows.md`. Ausgesetzte Regeln sind markiert, mit
Datum und Grund, nicht gelöscht:

- „Keep demo flows and Supabase-backed flows aligned" — ausgesetzt, es gibt nur noch
  einen Modus; ersetzt durch „keine parallele Implementierung wieder einführen".
- Auth, Einladungen, Join-Codes, Admin- und Department-Rollen — ausgesetzt bis ein
  Backend zurückkommt.
- **Weiter gültig:** Rollen aus Mitgliedschaften, `Club → Department → Team`, keine
  sensiblen Belastungsdaten an Unbefugte, mobil und Desktop in einem Durchgang.
- **Neu:** Daten nur über `@/shared/data`; Rechte nie aus URL-Parametern ableiten.
- `README.md` beschreibt jetzt, wie man die App ohne `.env` startet, welche Routen
  aktiv sind und wo die entfernten liegen.

### Was Run 6 vorfindet

Deutlich weniger als ursprünglich geplant. Die Datenschicht trägt seit Run 1 den
Namensraum `club-app.local.*`, `demoStorage.ts` ist gelöscht, die alten Schlüssel
werden automatisch entfernt. Nachgezählt bleiben 25 Vorkommen von `demo`/`Demo` in
`src`:

- **Gewollt:** Kommentare, die erklären, woher etwas kommt, und der Präfix
  `club-app.demo.` in `LEGACY_KEY_PREFIXES`, den die Bereinigung braucht.
- **Toter Code:** In `TeamWorkspaceView` die optionale Eigenschaft `onAddDemoPlayers`
  samt Handler, Aktionstyp `demoPlayers` und Knopf „Add demo players". Übergeben hat sie
  nur die gelöschte `DemoTeamWorkspace`; der Knopf rendert nie.

Diese Eigenschaft gehört zu einer größeren Gruppe toter optionaler Eigenschaften in
`TeamWorkspaceView`, die an entfernten Funktionen hingen: `onCreatePlayerJoinLink`,
`onInviteStaff`, `onCopyStaffInvite`, `onRevokeStaffInvite`, `onAddCoachRole`,
`onRemoveCoachRole`. Keiner übergibt sie mehr. Sie wurden in Run 5 bewusst nicht
entfernt: Das betrifft den Staff- und Settings-Bereich einer 2000-Zeilen-Datei, und
das ans Ende eines großen Löschlaufs zu hängen, ohne den Bereich danach neu zu prüfen,
wäre genau der Übergriff, den die Reihenfolge verhindern soll.

**Empfehlung für Run 6:** statt einer reinen Umbenennung diese toten Eigenschaften
entfernen und den Staff-/Settings-Tab danach bei Telefonbreite prüfen. Die eigentliche
Umbenennung `demo` → `local` hat sich weitgehend erledigt.

### Offene Punkte

1. **Sprache ist gemischt:** Startseite und Identitätswechsel deutsch, der Rest
   englisch.
2. **Die Trainerseite unterscheidet Seed-Meldungen nicht von echten** (seit Run 3).
3. **Eigene Trainingspläne** der Spieler sind portiert, aber nicht von Hand
   durchgespielt.
4. **Serienplanung und Wochenbestätigung** beim Trainer nicht von Hand durchgespielt.
5. **Die großen Oberflächendateien** (siehe Zielwerte) sind der nächste Hebel für
   Wartbarkeit.

### Validierung

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run build` | grün, 14 Routen |
| Prüfkette 1–11 plus Hallenkalender-Rechte | bestanden, Telefonbreite |
| Importanalyse: unerreichbare Dateien | 0 |
| Laufzeitfehler | keine |


---

## Run 6 — tote Einladungs- und Rollenlogik entfernt (erledigt)

Ursprünglich als Umbenennung `demo` → `local` geplant. Die hatte sich weitgehend
erledigt (Datenschicht seit Run 1 richtig benannt, `demoStorage` in Run 5 gelöscht).
Stattdessen hat Run 6 entfernt, was an den gelöschten Funktionen hing.

### Geändert

`src/features/teams/TeamWorkspaceView.tsx`, 1994 → 1885 Zeilen:

- Sieben optionale Eigenschaften, die niemand mehr übergab: `onAddDemoPlayers`,
  `onCreatePlayerJoinLink`, `onInviteStaff`, `onCopyStaffInvite`,
  `onRevokeStaffInvite`, `onAddCoachRole`, `onRemoveCoachRole` — samt Handlern,
  Zuständen und Bedienelementen.
- `staffRoles` und `staffHref` aus `TeamWorkspaceData`. Nur der Admin-Bereich hatte
  sie gesetzt; `staffHref` zeigte auf die gelöschte Admin-Personalseite.
- `StaffRoleGrid` ist jetzt eine reine Anzeige.

### Ein sichtbarer Fehler, der dabei verschwunden ist

Die Staff-Ansicht zeigte zwei Zeilen: „Head Coach" und „Assistant Coach". Der lokale
Workspace übergibt alle Trainer als Head Coaches, weil Mitgliedschaften keine
Hierarchie kennen. Folge: Bei **jedem** Team stand „Assistant Coach" auf „fehlt",
daneben ein **Einladen-Knopf, der nichts tat**. Jetzt steht dort eine Zeile „Coaches"
mit allen Trainern des Teams.

### Geprüft bei Telefonbreite

| Prüfung | Ergebnis |
|---|---|
| Staff-Ansicht: „Coaches: Martin Weber, Tobias Neumann" | bestanden |
| Sichtbare Knöpfe für Einladen, Kopieren, Widerrufen, Rolle hinzufügen | 0 |
| Standardhalle ändern → gespeichert | bestanden |
| Gruppe anlegen (Edit groups → Add) | bestanden |
| Spieler-Tab zeigt den Kader, keine Demo- oder Einladungskarte | bestanden |
| Alle 14 Routen, beide Rollen, plus Team-Detail und Hallenkalender | 16 von 16 |
| Laufzeitfehler | keine |
| `npm run typecheck`, `npm run build` | grün |

### Stand danach

`demo`/`Demo` kommt in `src` nur noch in Kommentaren vor, die erklären, woher etwas
stammt, und im Präfix `club-app.demo.` für die Bereinigung alter Schlüssel. Beides
gewollt.

---

## Abschluss der Vereinfachung

Die sechs Runs sind durch.

| Kennzahl | vorher | nachher |
|---|---|---|
| Routen | 67 | 14 |
| Zeilen unter `src` | 28.244 | 13.503 |
| Dateien mit Supabase-Code | 26 | 0 |
| Dateien mit `localStorage`-Zugriff | 13 | 1 |
| Laufzeitpakete | 9 | 4 |
| benötigte Umgebungsvariablen | 3 | 0 |

**Bewusst entfernt, per Produktentscheidung:** Vereins- und Abteilungsverwaltung,
Anmeldung, Registrierung, Vereinsgründung, Einladungen, Beitrittscodes, der Demo-Modus
als zweite App. Alles liegt in `543775f` auf `origin/main`. Die dazugehörige
Supabase-Logik (Abfragen, Rechteprüfung über RLS, Rollback über die Datenbank) ist
damit ebenfalls nicht mehr im Baum; das Schema unter `supabase/` bleibt.

**Nicht verloren:** Alles, was Trainer und Spieler tun konnten. Der Beleg ist die
Prüfkette in `docs/local-mode-testplan.md` und der Routen-Durchlauf aus Run 6.

**Offene Punkte, die bleiben:**

1. Sprache gemischt: Startseite und Identitätswechsel deutsch, der Rest englisch.
2. Die Trainerseite unterscheidet Seed-Meldungen nicht von echten.
3. Eigene Trainingspläne der Spieler sowie Serienplanung und Wochenbestätigung beim
   Trainer sind portiert, aber nicht von Hand durchgespielt.
4. Die großen Oberflächendateien (`AthleteLoadWorkspace` 2691 Zeilen,
   `TeamWorkspaceView` 1885, `CoachWorkspaceRouter` 1312) sind der nächste Hebel für
   Wartbarkeit, nicht für Kürze.
5. Das Favicon fehlt — schon im Ausgangsstand.

## Run 7 — Trainerrollen und Sichtbarkeit (erledigt)

Schritt 1 aus Entscheidung 8. Jede Trainerrolle gehört zu einem Team und trägt Rechte
aus einer festen Liste (`COACH_PERMISSIONS` in `src/shared/data/schema.ts`). Welche
Rolle jemand hat, steht an der Mitgliedschaft (`membership.coachRoleId`); daraus
berechnet `coachPermissions(database, personId, teamId)` die Rechte.

### Rechte

| Recht | wirkt auf |
|---|---|
| `viewRoster` | Spielerliste, Spieler in Einheiten |
| `viewAttendance` | Zu- und Absagen, Anwesenheitsquote |
| `viewAbsenceReasons` | Absagegründe (braucht `viewAttendance`) |
| `viewLoadSummary` | ACWR-Ampel ohne Rohdaten |
| `viewLoadDetails` | RPE, Einträge, Diagramme, Monotonie (braucht `viewLoadSummary`) |
| `viewAthletePlans` | vorgesehen; Spielerpläne haben beim Trainer noch keine Ansicht |
| `editSessions` | Einheiten anlegen, verschieben, bearbeiten, löschen — Trainer- und Hallenkalender |
| `planSeries` | Wochenserien |
| `manageGroups` | Gruppen |
| `manageFacilities` | Standardhalle des Teams; seit Run 8 auch Hallen anlegen, bearbeiten, freigeben, löschen |
| `manageStaff` | Trainerteam und Rollen |

Vorlagen pro Team: **Head Coach** (alle, gesperrt), **Co-Trainer** und
**Athletiktrainer** (alle, änderbar), **Betreuer** (`viewRoster`, `viewAttendance`).

### Regeln in der Datenschicht

- Head Coach hat immer alle Rechte, lässt sich weder ändern noch löschen.
- Ein Team behält immer mindestens eine Person mit `manageStaff`; Umbesetzen,
  Entfernen und Rechte-Entzug, die das verletzen würden, werden abgelehnt.
- Vergebene Rollen lassen sich nicht löschen; Rollennamen sind pro Team eindeutig.
- Abhängige Rechte werden beim Speichern ergänzt (`COACH_PERMISSION_REQUIRES`);
  die Oberfläche nimmt beim Abwählen die abhängigen mit.

### Geändert

- `src/features/load/loadAccess.ts` (neu): Zugriffsgrad `full | summary | none` und
  die eine Ampel-Berechnung, die Teamansicht, Spielerdetail und Einheitendetail teilen
  (vorher zwei Kopien). Bei `summary` wird die Ampel dort berechnet, wo die Einträge
  liegen; die Rohwerte erreichen die Ansicht nicht.
- `coachData.ts`, `TeamWorkspace.tsx`: Spielerdaten werden nach Rechten weggelassen,
  Handler ohne Recht nicht übergeben — die Ansichten blenden die Bedienelemente dann
  selbst aus.
- `CoachWorkspaceRouter.tsx`, `FacilityCalendar.tsx`: Bearbeiten, Ziehen und Serien nur
  für Teams mit dem jeweiligen Recht, zusätzlich in den Schreibpfaden geprüft.
- `PlayerLoadDetail.tsx`, `CoachSessionSurfaces.tsx`, `TeamWorkspaceView.tsx`: Hinweise
  „nicht für deine Rolle freigegeben" statt leerer Werte, die wie „niemand hat
  gemeldet" aussehen würden.
- `src/features/teams/TeamStaffPanel.tsx` (neu): Trainerteam und Rollen unter
  „Staff / Settings". Alle im Trainerteam sehen es, nur `manageStaff` kann ändern.
- Identitätswechsel zeigt bei Trainern die Rolle pro Team.
- Schema-Version `2026-09-24-coach-roles-v4`: vorhandene lokale Daten werden neu
  aufgesetzt (Entscheidung 2).

### Grenze bis Run 9/10

Im lokalen Modus kann jeder die Identität wechseln, und die Schreibfunktionen der
Datenschicht kennen keinen handelnden Nutzer. Die Rechte formen also die Oberfläche,
schützen aber keine Daten. Durchgesetzt werden sie erst mit Supabase-RLS; die
Rechte-Schlüssel sind dafür der Vertrag.

### Validierung

`npm run typecheck`, `npm run build` grün; Browserlauf siehe
`docs/local-mode-testplan.md`, Abschnitt Run 7.

## Run 8 — Hallen (erledigt)

Schritt 2 aus Entscheidung 8. Unter „Facilities“ (`/coach/facilities`) sieht jeder
Trainer die Hallen, die seine Teams buchen können: Name, Adresse mit Link in die
Karte, welches Team dort standardmäßig trainiert, anstehende Einheiten, Hallenkalender.
Wer `manageFacilities` hat, schaltet mit „Edit halls“ in den Bearbeiten-Modus.

### Was man dort tun kann

- **Halle anlegen** mit Name, Adresse und Freigabe für die eigene Abteilung in einem
  Schritt. Liegt an der Adresse schon eine Halle, erscheint vorher eine Warnung.
- **Bearbeiten:** Name und Adresse.
- **Freigeben:** für welche Abteilungen die Halle buchbar ist. Wird eine Freigabe
  entzogen, verlieren die Teams dieser Abteilung sie als Standardhalle; bestehende
  Einheiten behalten ihre Halle.
- **Standardhalle** der eigenen Teams direkt an der Halle setzen (wie bisher auch in
  den Teameinstellungen).
- **Löschen** mit Rückfrage, die nennt, wie viele Einheiten und Serien danach ohne
  Halle weiterbestehen und welche Teams ihre Standardhalle verlieren.

### Rechteregel

`manageFacilities` gilt pro Team, Hallen gehören dem Verein und werden über
Abteilungen geteilt. Deshalb: Man verwaltet Hallen in den Abteilungen, in denen man
ein Team mit diesem Recht hat (`facilityManagerDepartmentIds`). Ändern oder löschen
darf man eine Halle nur, wenn **jede** Abteilung, die sie nutzt, eine solche ist
(`canManageFacility`) — eine mit einer fremden Abteilung geteilte Halle bleibt lesend.
Im Pilot mit einer Abteilung ist das gleichbedeutend mit „hat das Recht“.

### Aus `543775f` übernommen

| alt | jetzt |
|---|---|
| `shared/lib/facilities/accent.ts` | `features/facilities/facilityAccent.ts`, unverändert; Seed ist die Hallen-ID |
| `shared/lib/facilities/matching.ts` | `features/facilities/facilityMatching.ts`, ohne die ungenutzten Scope-Felder |
| `shared/lib/geoapify/addressAutocomplete.ts` | `features/facilities/addressAutocomplete.ts`, unverändert |
| `GeoapifyAddressEnhancer` (suchte Eingabefelder über den Platzhaltertext und änderte das DOM) | `AddressField`, ein normales Eingabefeld mit Vorschlagsliste |
| `AdminFacilitiesManager` (Vereinsadmin, Supabase) | `FacilitiesManager` für die Trainerseite, Datenschicht |

Nicht übernommen: die vereinsweite Abteilungsübersicht, die Aufteilung „vereinsweit /
nur Abteilung“ (liest im Code niemand), `FacilityAccentEnhancer` und
`FacilityRowsEditor` (DOM-Nachrüstungen für Oberflächen, die es nicht mehr gibt).

**Adressvorschläge sind optional.** Ohne `NEXT_PUBLIC_GEOAPIFY_API_KEY` bleibt das
Adressfeld ein Textfeld und es gehen keine Anfragen raus; die App braucht weiterhin
keine Umgebungsvariable.

### Weitere Änderungen

- Neue Repository-Funktionen: `createFacility`, `updateFacility`,
  `setFacilityDepartment`, `deleteFacility`, `setTeamDefaultFacility`,
  `facilityUsage`, `facilityDepartmentIds`, `canManageFacility`,
  `facilityManagerDepartmentIds`. Die Teameinstellungen setzen die Standardhalle jetzt
  auch über `setTeamDefaultFacility` (prüft, ob die Halle für die Abteilung frei ist).
- Die Standardhalle in den Teameinstellungen trägt denselben Farbakzent wie in der
  Hallenliste (vorher eigene Farbberechnung über den Namen).
- Hallenkalender: leere Adresse zeigt „No address set“ statt einer Leerzeile.

### Offen

- Spieler sehen die Adresse ihrer Halle noch nicht (nur den Namen).
- Mehrere Abteilungen sind in der Oberfläche vorgesehen, aber nur mit einer geprüft.

### Validierung

`npm run typecheck`, `npm run build` grün; Browserlauf siehe
`docs/local-mode-testplan.md`, Abschnitt Run 8.

## Run 9a — Pilot-Datenbank (erledigt)

Schritt 3 aus Entscheidung 8, erster Teil: das neue Supabase-Schema mit Zugriffsregeln.
Projekt `CLUB_ProjectV2` (`tszxeainmwowmixqmphn`, EU/Paris), leer angelegt am
2026-09-24; die alten Projekte „Club-app“ und „Health APP ACWR“ sind unberührt.

Alles liegt unter `supabase/pilot/` (siehe dortige README): drei Migrationen, eine
lokale Stellvertretung für Supabases `auth`-Schema und 75 Prüfungen, die jeweils als
eine Person laufen. Die Prüfungen liefen gegen ein lokales Postgres 16, danach wurden
die Migrationen unverändert eingespielt.

### Entscheidungen im Schema

- **Aus dem lokalen Modell abgeleitet**, nicht aus dem alten Schema. Tabellen und
  Felder entsprechen `src/shared/data/schema.ts` in `snake_case`.
- **Absagegründe in eigener Tabelle** (`availability_reasons`): Zeilenregeln kennen
  keine Spaltenrechte, und „wer kommt“ (`viewAttendance`) ist ein anderes Recht als
  „warum nicht“ (`viewAbsenceReasons`).
- **Belastungsampel als eigene Tabelle** (`load_summaries`): Rollen mit nur
  `viewLoadSummary` bekommen den ACWR-Wert, aber nie die RPE-Einträge. Die App des
  Spielers schreibt ihn, wenn sich Einträge ändern oder die App öffnet; er kann also
  altern, wenn ein Spieler die App tagelang nicht öffnet.
- **Regeln, die unabhängig vom Schreibenden gelten**, sind Trigger in der Datenbank:
  Halle muss für die Abteilung freigegeben sein, Head Coach gesperrt, ein Team behält
  immer einen Staff-Verwalter, jedes neue Team bekommt die vier Rollenvorlagen,
  abhängige Rechte werden ergänzt, Verein und Abteilung einer Einheit kommen immer vom
  Team.
- **Verein, Abteilungen und Teams** sind für die App nur lesbar (außer der
  Standardhalle). Angelegt werden sie beim Einrichten des Pilots (Run 10).
- `anon` hat auf keine Tabelle Zugriff.

### Supabase-Prüfungen nach dem Einspielen

- Sicherheit: keine Befunde zu den eigenen Objekten. Gemeldet wird nur
  `public.rls_auto_enable()`, eine Funktion, die Supabase beim Anlegen des Projekts
  selbst mitbringt; nicht angefasst.
- Performance: nach Migration 0003 nur „Index noch nie benutzt“, bei leerer Datenbank
  erwartet.

### Noch nicht verbunden

Die App liest die Datenbank noch nicht. Das kommt in 9b (Supabase-Speicher hinter der
Datenschicht) und wird erst mit Run 10 (Anmeldung) für echte Nutzer eingeschaltet.
`.env.example` nennt die beiden Variablen; die Werte liegen nicht im Repository.

## Run 9b — Server-Speicher hinter der Datenschicht (erledigt)

Die App kann jetzt statt localStorage die Pilot-Datenbank benutzen. Alle Oberflächen
und alle Schreibfunktionen bleiben, wie sie sind: Sie arbeiten weiter auf einem
Dokument, nur wo es liegt, ändert sich.

**Schalter:** `NEXT_PUBLIC_DATA_BACKEND=supabase` (plus URL und Publishable Key). Ohne
ihn bleibt der lokale Testmodus, auch wenn die Supabase-Variablen gesetzt sind.

### Wie eine Änderung zum Server kommt

1. `mutate` wendet sie wie immer auf das Dokument an; die Ansicht zeigt sie sofort.
2. Der Server-Speicher (`src/shared/data/remote/remoteStore.ts`) übersetzt Dokument vorher
   und nachher in Tabellenzeilen (`tables.ts`) und schickt nur die Differenz: erst
   Löschungen von unten nach oben, dann Neues und Geändertes von oben nach unten.
3. Danach lädt er, was der Nutzer lesen darf, und vergleicht. Was die Zugriffsregeln
   still abgelehnt haben (eine Änderung an einer Zeile, die man nicht ändern darf,
   ändert einfach nichts) oder eine Datenbankregel laut abgelehnt hat, springt zurück;
   ein Hinweis unten am Bildschirm sagt, was nicht gespeichert wurde.

Änderungen gehen der Reihe nach raus; neu geladen wird nur, wenn nichts mehr unterwegs
ist. Zusätzlich lädt die App neu, wenn sie wieder in den Vordergrund kommt, und alle
30 Sekunden, solange sie sichtbar ist.

### Was sich im lokalen Modell dafür geändert hat

- **IDs sind UUIDs** (`newId()`), in der Datenschicht und in Team-, Kalender- und
  Spieler-Oberfläche. Eine geänderte Zu- oder Absage behält ihre Zeile.
- **Belastungsampel als eigene Sammlung** (`loadSummaries`), neu berechnet, sobald sich
  die Einträge eines Spielers ändern, und einmal am Tag beim Öffnen. Rollen mit nur
  „Ampel“ lesen sie, statt aus Rohdaten zu rechnen — auch lokal, damit beide Modi
  gleich aussehen.
- **Einheit löschen** wie auf dem Server: Zu- und Absagen gehen mit, geloggte Belastung
  bleibt beim Spieler (ohne Bezug zur Einheit).
- Personen haben `userId` (lokal immer leer), Hallen verlieren die ungenutzten Felder
  `scope`/`ownerDepartmentId`.
- Schema-Version `2026-09-24-pilot-shape-v5`: lokale Testdaten werden neu angelegt.
- Serien-Bestätigung erkennt eine schon angelegte Einheit jetzt über `seriesId` statt
  über ein ID-Präfix, das nach dem alten Schema nie mehr passte.

### Im Servermodus anders

- Man ist immer man selbst: Der Identitätswechsel zeigt nur die eigenen Rollen, „Test-
  daten zurücksetzen“ gibt es nicht.
- Ohne Anmeldung zeigen die Seiten „Nicht angemeldet.“, ohne Vereinszuordnung „Dein
  Konto ist noch keinem Verein zugeordnet.“ Die Anmeldung kommt in Run 10.
- supabase-js speichert die Anmeldung im Browser; den Speicher reicht die Datenschicht
  hinein, sie bleibt die einzige Stelle mit `localStorage`.
- supabase-js wird nur im Servermodus nachgeladen; die Seiten im lokalen Modus sind so
  groß wie vorher.

### Geprüft

- `npm run test:pilot`: 38 Prüfungen, die echten Funktionen der Datenschicht über den
  Server-Speicher gegen die lokale Postgres mit den Pilot-Migrationen, als Head Coach,
  Betreuer und Spieler (Details in `docs/local-mode-testplan.md`).
- Browser, lokaler Modus, Telefonbreite: alle Routen fehlerfrei; Spieler sagt mit Grund
  ab und korrigiert RPE; Ampel neu berechnet; Head Coach sieht den Grund, Betreuer nicht.
- Browser, Servermodus ohne Anmeldung: „Nicht angemeldet.“, keine Anfrage an Supabase,
  keine lokalen Testdaten, keine Laufzeitfehler.

### Nicht geprüft

Der Servermodus gegen das echte Supabase-Projekt: Aus dieser Umgebung ist
`tszxeainmwowmixqmphn.supabase.co` gesperrt, und ohne Anmeldung (Run 10) gäbe es dort
ohnehin nichts zu lesen. Die supabase-js-Anbindung (`supabaseBackend.ts`) ist deshalb
nur über Typen und den Probelauf ohne Anmeldung belegt; sie ist bewusst dünn (lesen mit
Seitenweise-Abruf, anlegen, ändern und löschen nach Schlüssel).

## Run 10 — Zugang (erledigt)

Schritt 4 aus Entscheidung 8. Anmeldung mit E-Mail und Passwort, Beitrittscode für
Spieler, Einladungslink für Trainer — und, auf Wunsch vom 2026-09-24, weiterhin ein Weg
ohne Anmeldung, bei dem alles lokal läuft.

### Zwei Wege, pro Gerät gewählt

- Die Startseite zeigt „Mit deinem Verein“ (Anmelden, Konto erstellen) und darunter
  den lokalen Testmodus wie bisher. Die Wahl merkt sich das Gerät
  (`getBackendChoice`); zurück geht es jederzeit über „Ohne Anmeldung lokal testen“
  (Startseite, Anmeldeseite, Identitätsmenü) bzw. „Mit Konto anmelden“.
- Der lokale Modus berührt den Server nie (im Browser geprüft: 0 Anfragen) und zeigt
  keine Codes oder Einladungen.
- Der Schalter `NEXT_PUBLIC_DATA_BACKEND` aus Run 9b entfällt. Sind URL und Key gesetzt,
  gibt es beide Wege; sonst nur den lokalen.

### Wie Menschen hineinkommen

| Wer | Weg |
|---|---|
| erster Head Coach | Verein per `app.setup_club(...)` anlegen (SQL, einmalig); der zurückgegebene Link `/join?invite=…` führt zu Konto und Team |
| weitere Trainer | im Trainerteam per Name anlegen, „Einladungslink erstellen“, Link schicken; gilt 30 Tage, einmal |
| Spieler | Konto erstellen, Beitrittscode des Teams eingeben (oder Link `/join?code=…`); Code im Trainerteam, erneuerbar |

Wer ohne Anmeldung eine geschützte Seite öffnet, landet auf `/login` und danach wieder
dort; wer angemeldet, aber in keinem Team ist, auf `/join` (`AccessGate`). Abmelden im
Identitätsmenü. Nimmt jemand, der schon Trainer im Verein ist, eine weitere Einladung an,
bleibt er eine Person mit beiden Teams.

### Datenbank (Migrationen 0004, 0005)

- `team_join_codes`, `staff_invites`, je mit Zugriffsregeln (nur `manageStaff`).
- `join_team`, `accept_staff_invite`, `invite_preview`: die einzigen Funktionen, die die
  App direkt aufruft. `app.setup_club` nur für den Datenbank-Eigentümer.
- 35 neue Zugriffsprüfungen, alle bestanden.

### Live gegen Supabase geprüft (Handybreite, Testverein danach gelöscht)

Nicht angemeldet → Weiterleitung auf `/login`; Einladung zeigt „Testa Trainerin · Head
Coach · Test-U16“; Anmelden, Einladung annehmen → Trainerstart; im Trainerteam Code und
„Konto verbunden“; Person angelegt und eingeladen; Spieler meldet sich an, Code ist
vorbefüllt, Beitritt → Spielerstart; Absage mit Grund landet als `availability` und
`availability_reasons`; die Trainerin sieht den neuen Spieler; Abmelden; lokaler Modus
startet mit Testverein. Keine Laufzeitfehler. Danach: 0 Vereine, 0 Konten im Projekt.

### Offen, außerhalb des Codes

- **E-Mail-Bestätigung:** im Projekt eingeschaltet. Supabases eingebauter Mailversand
  erreicht nur wenige Adressen pro Stunde. Für den Pilot die Bestätigung ausschalten
  oder eigenes SMTP einrichten; außerdem die App-Adresse als Site URL und
  Redirect-URL eintragen.
- „Passwort vergessen“ fehlt noch (braucht ebenfalls Mailversand).
- Der echte Verein ist noch nicht angelegt: Es fehlen Name, Stadt, Abteilung, Team,
  Name des Head Coaches und optional die Halle.
- Die App muss unter einer festen Adresse laufen (z. B. Vercel), mit URL und Key als
  Umgebungsvariablen.

## Run 11a — Oberfläche durchgehend englisch (erledigt)

Entscheidung vom 2026-09-24: Die ganze Oberfläche ist englisch. Bisher war sie gemischt
(Einstieg deutsch, Trainer- und Spielerbereich englisch).

- Übersetzt: Startseite, `/login`, `/join`, Identitätsmenü, Trainerteam (Code,
  Einladungen), Hinweise bei abgelehnten Änderungen, Lade- und Fehlertexte, alle
  Meldungen der Datenschicht und der Anmeldung.
- Datenbank: Migration 0006 definiert die Trigger und Funktionen mit englischen
  Meldungen neu, 0007 benennt die Rollenvorlagen um (Head Coach, Assistant Coach,
  Athletic Coach, Team Manager). Die lokalen Testdaten nutzen dieselben Namen
  (Schema-Version `2026-09-24-english-roles-v7`).
- Mitgenommen, weil sie an denselben Stellen hängen: „Forgot password?“ auf der
  Anmeldeseite (Mail mit Link) und `/reset-password` zum Setzen eines neuen Passworts;
  im Identitätsmenü mit Anmeldung „Your name“ zum Ändern des eigenen Namens
  (`renameOwnPerson`, nur die eigene Person, auf dem Server durch die Zugriffsregeln
  abgesichert).

Geprüft: 75 + 35 Zugriffsprüfungen, 52 Ende-zu-Ende-Prüfungen (neu: eigener Name
ändern, fremder Name abgelehnt), Typecheck, Build; im Browser (Handybreite) Startseite,
Anmeldung mit „Forgot password?“, Beitreten, Reset-Seite mit ungültigem Link,
Identitätsmenü, Trainerteam: keine deutschen Texte mehr außer Personennamen, keine
Laufzeitfehler. Der Versand der Reset-Mail selbst ist nicht geprüft (Mailversand, siehe
offene Punkte aus Run 10).

## Run 11b — Stück 1: Startseite neu (erledigt)

Plan in `docs/plan-next-runs.md`. Eine Startseite für jeden Zustand eines Geräts:

- **Nicht angemeldet:** „Sign in to your club“ als Hauptweg mit „Sign in“ und „Create
  account“ (führt nach der Registrierung zu `/join`), dazu je ein Satz, woher Spieler
  (Beitrittscode) und Staff (Einladungslink) ihren Zugang bekommen. Darunter klein
  „Try the demo club“ als Coach oder Player.
- **Angemeldet:** Vereinsname, „Welcome back, Vorname“, je eigener Rolle ein Knopf
  „Continue as coach/player“ mit Team und Rollenname, Abmelden.
- **Angemeldet ohne Team:** „Join with a code“.
- **Ohne Server (Build ohne Supabase-Variablen):** nur der Demo-Verein, groß.
- Der Demo-Verein berührt den Server nie: Aus dem Servermodus schaltet der Knopf das
  Gerät auf lokal und startet die gewählte Rolle direkt (`/?demo=coach|athlete`); die
  Rechte kommen wie immer aus den Mitgliedschaften, nicht aus dem Parameter.
- Mitgenommen: Wer Trainer und Spieler zugleich ist, behält im Servermodus die zuletzt
  gewählte Rolle über das Neuladen hinweg (`club-app.identity`, nur über
  `repository.ts`; der Server-Speicher nimmt sie beim ersten Laden als Vorgabe, gilt
  aber nur, wenn die Mitgliedschaft noch besteht).

Geprüft: Typecheck, Build; im Browser gegen Supabase (Handybreite und Desktop) frisches
Gerät, abgemeldet mit Demo als Trainer, angemeldet mit Doppelrolle (Rolle bleibt nach
Neuladen, Wechsel zu Trainer), angemeldet ohne Team. Keine Laufzeitfehler. Testverein
und Testkonten danach gelöscht (0 Vereine, 0 Konten).

## Run 11c — Stück 2: Oberfläche überarbeitet (erledigt)

Auftrag: die Teile der Oberfläche überarbeiten, die noch nicht gut sind, ohne
Funktionen zu verlieren. Vorher und nachher wurde jede Trainer- und Spielerseite auf
Handy und Desktop fotografiert.

**Rahmen und Navigation**
- Ein gemeinsamer Rahmen für alle Trainer- und Spielerseiten (`RoleShell`): Seitenleiste
  auf dem Desktop, Tab-Leiste mit Symbolen auf dem Handy, ein Seitentitel mit Unterzeile,
  Konto-Knopf (Initialen) oben rechts. Ersetzt `CoachDrawer`, den eigenen Kopf und die
  zweite untere Leiste der Teamansicht und den „Load cockpit“-Kopf der Spielerseiten.
- **Behobener Fehler:** Auf dem Desktop lag die Seitenleiste über der Teamansicht.
- Trainer: Today · Calendar · Team (bzw. Teams) · Halls · History. Spieler: Today ·
  Calendar · Load. Doppelte Überschriften („COACH OS Today“ über „TODAY Sessions and
  availability“) sind weg.

**Ein Kalender statt zwei**
- Die Teamansicht hatte einen eigenen Kalender (rund 950 Zeilen, parallel zum
  Trainerkalender). Er ist entfernt; „Team calendar“ öffnet den Trainerkalender auf das
  Team gefiltert. Wer mehrere Teams betreut, hat dort Filter-Knöpfe je Team. Doppelte
  Serien-Handler in `TeamWorkspace.tsx` sind mit weg.
- Handy: Tagesansicht als Standard, mit Tagesleiste (Punkt = an dem Tag gibt es etwas),
  „Whole week“ für die Wochenansicht, Hinweis bei leeren Tagen. Kacheln zeigen den Titel
  der Einheit statt nur den Teamnamen. Im Bearbeitungsmodus erklärt eine Zeile, was geht.

**Inhalte**
- **Behobener Fehler:** Spielerliste zeigte Gruppen-IDs (`group-u16-rehab`) statt Namen.
- **Behobener Fehler:** Die Teamübersicht zeigte für kommende Einheiten immer „Out 0,
  Late 0“, weil sie nur Absagen vergangener Einheiten kannte. Sie nutzt jetzt dieselben
  Sitzungsdaten wie Today (mit denselben Rechten), die beiden Seiten stimmen überein.
- Today: Einheiten heute als Karten, „Coming up“ als Liste mit „2 out“/„1 late“.
- Teamansicht: Tabs Overview · Players · Groups · Staff & settings; Overview mit nächster
  Einheit, den folgenden Einheiten und offenen Einrichtungsschritten; bedeutungslose
  Plaketten „12“/„OK“ und „SECONDARY“ entfernt.
- Spielerliste: „Load low / in range / high“ statt „Low/Ready“, „3× out or late“.
- History: kompakte Karten (There · RPE · Load · Reported), „Wk 32“ statt „KW 32“.
- Datum und Uhrzeit überall einheitlich europäisch (`src/shared/format.ts`, `en-GB`,
  24 Stunden: „Fri 25 Sept · 16:30–17:30“) statt je nach Browser „04:30 PM“.
- Zahlwörter („1 session“, „3 sessions“) über `plural`.
- Einheitlich „Hall“ statt „Facility“ in der Oberfläche.
- Spieler: Kennzahlen lesbar statt abgeschnitten („Room to high 1231 AU“, „≈ 2.4
  sessions“); Today = was jetzt zu tun ist (Einschätzen, nächste Einheit mit dem eigenen
  Status „You are in / late“), Load = die Auswertung mit dem Diagramm. Die Aufwärmphase
  vor einem Spiel ist nicht mehr die Schlagzeile, das Spiel ist es. Diagramm-Tooltip
  zeigt bei Prognosetagen „—“ statt leerer Felder.

**Geprüft:** Typecheck, Build; Screenshots aller Seiten (Handy 390 px, Desktop 1280 px),
auf dem Handy keine Seite breiter als der Bildschirm; 17 Klick-Abläufe im Demo-Modus:
Einheit öffnen, Einheit im Kalender anlegen, Wochenplan, Spielerliste mit
Gruppennamen, Spielerdetail, Gruppen bearbeiten, Trainerteam, Teamkalender-Link,
Hallenkalender und zurück, History, Rollenwechsel über den Konto-Knopf, Trainer mit zwei
Teams (Teamliste, Zurück-Link, Teamfilter), Spieler meldet sich verspätet, Load-Diagramm.
Keine Laufzeitfehler.

**Nicht gemacht (bewusst):** Der Spielerkalender ist weiterhin eine eigene
Implementierung neben dem Trainerkalender (andere Funktionen: eigene Pläne, Belastung).
Zusammenlegen wäre ein eigenes Stück. Nicht gegen den echten Server geprüft: Die
Datenschicht ist unverändert, die Oberfläche ist in beiden Modi dieselbe.

## Run 11d — Stück 3: Spieler aus dem Team entfernen (erledigt)

Entscheidung vom 2026-09-24: Spieler entfernen darf, wer das Trainerteam verwalten darf
(`manageStaff`, Standard: Head Coach, Assistant Coach, Athletic Coach; nicht Team
Manager).

- **Datenbank (Migration 0008, im Projekt angewendet):** Eine Löschregel für
  Mitgliedschaften (Trainer und Spieler) mit `manageStaff`, statt einer zweiten Regel
  daneben. Ein Trigger nimmt den Spieler dabei aus den Gruppen dieses Teams, auch wenn
  der Entfernende keine Gruppen verwalten darf. Person, Meldungen und Belastung bleiben.
- **Datenschicht:** `removeAthleteFromTeam(teamId, personId)` in `repository.ts`, lokal
  und auf dem Server gleich.
- **Oberfläche:** In der Spieleransicht unten „Remove from team“, nur mit dem Recht, mit
  Rückfrage. Die Rückfrage sagt, was bleibt und dass der Spieler mit dem Beitrittscode
  wieder beitreten kann, bis man ihn ersetzt. Der Bestätigungsdialog heißt allgemein
  „Please confirm“ statt „Confirm deletion“.
- Was der Spieler danach sieht: angemeldet, aber in keinem Team (Startseite bietet „Join
  with a code“). Ist er noch in einem anderen Team, bleibt alles andere wie es war.

Geprüft: 86 + 35 Zugriffsprüfungen (neu: Team Manager, Spieler und fremder Head Coach
dürfen nicht; Head Coach darf; danach keine Sicht mehr auf Person und Belastung; Gruppen
verlassen; Person und Belastung bleiben; der Spieler sieht die Einheiten nicht mehr),
61 Ende-zu-Ende-Prüfungen (neu: Mia tritt dem falschen Team bei, Team Manager wird
abgelehnt, Head Coach entfernt sie, Mia ist danach ohne Team), Browser (Demo-Modus,
Handybreite): entfernen mit Rückfrage, Liste zeigt 11 Spieler, Team Manager sieht den
Knopf nicht; keine Laufzeitfehler. Supabase-Sicherheitsprüfung: keine neuen Befunde.
