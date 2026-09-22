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
