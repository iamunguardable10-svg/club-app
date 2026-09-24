# Verbindliche Entscheidungen für den Vereinfachungsumbau

Stand: 2026-09-22. Diese Datei gilt für alle sechs Runs des Umbaus und hat Vorrang vor
älteren Festlegungen in `AGENTS.md` und `docs/v1-decisions.md`, solange der Umbau läuft.
Run 5 zieht die beiden Dateien nach.

> **Stand 2026-09-24: Die Vereinfachung ist abgeschlossen, das nächste Ziel ist ein
> Pilot im eigenen Verein.** Punkt 8 ändert die Grundlage von Punkt 1 und 2: Es wird
> echte Nutzer geben. Punkt 8 hat Vorrang, wo er den älteren Punkten widerspricht.

## 1. Ein einziger lokaler Modus

Für die aktuelle Testphase gibt es keine Registrierung, keine Anmeldung, keine
Benutzerkonten, keine Supabase-Verbindung zur Laufzeit und keine Trennung zwischen
Demo und Live. Alle Daten liegen lokal im Browser, hinter einer einzigen zentralen
Datenschicht.

Aktiv sind zwei Perspektiven: **Trainer** und **Spieler**.

## 2. Daten sind wegwerfbar

**Es gibt nichts zu migrieren. Kein Datenbestand ist erhaltenswert.**

Es existieren keine echten Nutzer. Weder die Inhalte der Supabase-Datenbank noch
bestehende lokale Testdaten müssen überführt, gesichert oder rekonstruiert werden.
Sie dürfen verloren gehen.

Daraus folgt für alle Runs:

- Die neue Datenschicht **importiert keine Altdaten**. Sie startet mit einem frischen,
  gut gemachten Seed.
- `migrations.ts` hat nur noch eine Aufgabe: die Version des **neuen** Schemas zu
  führen, während es sich über die sechs Runs weiterentwickelt. Kein Import aus alten
  Schlüsseln.
- Speicherschlüssel dürfen umbenannt werden, ohne dass eine Migration geschrieben
  werden muss. Wer beim Umbenennen Testdaten verliert, verliert nichts Wertvolles —
  der Reset legt sie neu an.
- Bei Zweifeln zwischen „sauberer Neuaufbau" und „Altbestand schonen" gewinnt immer
  der saubere Neuaufbau.

Die alten `club-app.demo.*`-Schlüssel wurden bis Run 5 geschont, solange die
Demo-Verwaltungsbereiche sie noch lasen. Seit Punkt 4 entschieden ist, dürfen sie
aufgeräumt werden.

## 3. Das Datenbankschema ist Referenz, nicht Vorgabe

Das bestehende Supabase-Schema (`teams`, `departments`, `facilities`,
`team_memberships`, `sessions`, `session_series`, `player_groups`, `load_entries`,
`availability` und weitere) ist durchdacht und bleibt als Referenz im Repository:
SQL-Dateien, Migrationen, `docs/database-schema.md` und `docs/rls-access-model.md`
werden nicht gelöscht.

Weil aber nichts migriert werden muss, ist es **keine bindende Vorlage**. Wo die alte
Struktur umständlich war, darf die lokale Datenschicht davon abweichen und es besser
machen. Eine spätere Datenbank muss sich nicht am alten Schema orientieren — sie darf
neu und besser aufgesetzt werden.

Abweichungen werden in `docs/simplify-progress.md` begründet, damit später
nachvollziehbar ist, was bewusst anders gelöst wurde.

Was bleibt: der Laufzeitcode unter `src/shared/lib/supabase/` verschwindet. Schema
bleibt, Client geht.

## 4. Entschieden: die Demo-Verwaltungsbereiche entfallen

Stand 2026-09-23. `/demo/admin/*`, `/demo/department/*` und `/demo/create-club` werden
in Run 5 gelöscht, zusammen mit `/admin/*` und `/department/*`.

Gründe, nachgeprüft vor der Entscheidung:

- **Sie zeigten einen anderen Verein.** Sie lasen die alten `club-app.demo.*`-Schlüssel
  und legten dort einen eigenen Seed an („Demo Club", München, U14 Boys bis First
  Team), während Trainer und Spieler mit dem SV Ruhrtal arbeiten. Nichts aus der App
  erschien dort. Zum Testen taugten sie deshalb nicht.
- **Sie waren verwaist.** Weder Startseite noch Trainer- oder Spielernavigation
  verlinkten darauf.
- **Sie kosteten, was der Umbau beseitigen soll:** rund 5.200 Zeilen, 17 Routen,
  11 der 12 verbliebenen Dateien mit eigenem `localStorage`-Zugriff und einen zweiten
  Datenpfad.

Die Verwaltungsoberflächen kommen später wieder, dann auf der Datenschicht. Vorlage
sind dafür die **Supabase-Originale**, nicht die Demo-Versionen: Beim Trainer trugen
die Live-Varianten die echte Produktlogik (siehe `docs/coach-zwillinge.md`). Das
Datenmodell dafür — Club → Abteilung → Team, Hallen, Hallenzuordnungen — ist schon da.

Alles Gelöschte liegt in Commit `543775f` auf `origin/main`.

## 5. Funktionierendes wird nicht aus Prinzip neu geschrieben

1. Funktioniert und ist sauber gebaut → übernehmen.
2. Funktioniert, ist aber umständlich oder doppelt gepflegt → zusammenführen.
   Verhalten bleibt, Umsetzung wird besser.
3. Wird noch nicht gebraucht → aus dem aktiven Pfad entfernen.

Beim Zusammenführen von Demo- und Live-Varianten gilt: **Struktur und Produktlogik
kommen von der Live-Variante, ersetzt wird nur der Datenzugriff.** Die Live-Container
tragen echte Rechteprüfung, Rollback und Fehlerbehandlung; die Demo-Container tragen
Fake-Daten-Generatoren und eine aus einem URL-Parameter abgeleitete Rechteprüfung.
Aus der Demo-Seite wird nur die Erzeugung von Testdaten übernommen, und die gehört in
`seed.ts`.

Siehe `docs/coach-zwillinge.md` für die Belege.

## 6. Gelöscht wird erst, wenn der Ersatz trägt

Reihenfolge der sechs Runs: Datenschicht, Trainer, Spieler (zwei Runs), löschen,
umbenennen. Der aktive Pfad läuft heute über Supabase — wer ihn abschaltet, bevor die
Datenschicht steht, hat dazwischen eine nicht lauffähige App.

Run 1 setzt den Tag `pre-simplify-2026-09`. Ab da ist jeder entfernte Stand
wiederherstellbar, was das Löschen in Run 5 unkritisch macht.

## 7. Zielwerte

Das ursprüngliche Ziel „etwa 12.000 Zeilen unter `src`" ist am 2026-09-23 **verworfen**
worden. Zeilenzahl ist kein Qualitätsmaß: Nach Run 5 steckte der Rest fast vollständig
in genutzten, funktionierenden Oberflächendateien, und weiter zu kürzen hätte
Funktionsverlust bedeutet. Gezählt wird weiterhin, aber nicht mehr als Ziel.

| Kennzahl | Start | Ziel |
|---|---|---|
| Aktive Routen | 67 | etwa 20 |
| Dateien mit Supabase-Bezug | 26 | 0 |
| Dateien mit `localStorage`-Zugriff | 13 | 1 |




## 8. Nächstes Ziel: Pilot im eigenen Verein, zuerst auf Teamebene

Entschieden am 2026-09-24.

**Es wird echte Nutzer geben.** Spieler nutzen ihre eigenen Handys, der Trainer sein
eigenes Gerät. Damit gilt die Annahme aus Punkt 1 und 2 („keine echten Nutzer, alles im
Browser") nicht mehr für den Pilotbetrieb. Alle müssen denselben Datenstand sehen; dafür
braucht es wieder einen Server.

**Umfang:** zuerst ein Team, nicht der ganze Verein. Hallen gehören trotzdem dazu.

**Reihenfolge, verbindlich:**

1. **Trainerrollen** mit einstellbaren Rechten, insbesondere was eine Rolle von den
   Spielern sehen darf. Das ist dem Auftraggeber am wichtigsten.
2. **Hallen:** anlegen, bearbeiten, Adresse, Zuordnung zu Teams.
3. **Server:** Supabase hinter der Datenschicht.
4. **Zugang ganz am Ende:** Anmeldung mit E-Mail und Passwort, Beitrittscode für
   Spieler, Einladung für Trainer.

Punkt 1 und 2 entstehen im lokalen Modus, weil sich dort ohne Server am schnellsten
entwickeln und prüfen lässt.

**Supabase wird neu aufgesetzt, nicht das alte Schema wiederbelebt.** Es gibt keine
Daten zu übernehmen (Punkt 2). Das alte Schema kennt nur feste Rollen und kein
Rechtemodell dafür, was eine Trainerrolle von Spielern sehen darf; das nachträglich in
über acht Monate gewachsene RLS-Regeln einzubauen, ist schwerer, als es von Anfang an
mitzudenken. Das neue Schema wird aus dem lokalen Datenmodell (`src/shared/data/schema.ts`)
abgeleitet, das die Oberflächen heute sprechen. Das alte Schema unter `supabase/` und
`docs/rls-access-model.md` bleiben Referenz, gute Teile werden übernommen.

Die App selbst wird **nicht** neu gebaut: Kalender, Hallenkalender, Serienplanung,
Spieler-Workspace und die Datenschicht bleiben. Supabase kommt als zweiter Speicher
hinter dieselbe Schnittstelle; der lokale Modus bleibt als Entwicklungs- und Testmodus.
Eine Oberfläche, zwei austauschbare Speicher — keine zweite App.

**Kein Echtbetrieb vor dem Zugang.** Server (Schritt 3) und Zugang (Schritt 4) gehen
nur gemeinsam an echte Nutzer. Ein Server ohne Anmeldung würde Belastungs- und
Abwesenheitsdaten, darunter Gesundheitsgründe von Jugendlichen, ungeschützt ausliefern.

**Was aus Run 5 zurückkommt,** wird aus den Live-Versionen in `543775f` gezielt
portiert, nicht pauschal zurückgespielt — sonst kämen die Demo-Zwillinge und die
Doppelpflege mit.

**Stand 2026-09-24:** Schritt 1 (Trainerrollen) und Schritt 2 (Hallen) sind erledigt,
siehe `docs/simplify-progress.md`, Run 7 und Run 8. Schritt 3 ist erledigt: Datenbank
(Run 9a, `supabase/pilot/`) und Server-Speicher hinter der Datenschicht (Run 9b,
Schalter `NEXT_PUBLIC_DATA_BACKEND=supabase`). Eingeschaltet wird er erst mit dem Zugang
(Schritt 4). Bis Schritt 3 und 4 formen die Rechte nur die
Oberfläche: im lokalen Modus kann jeder die Identität wechseln. Wer eine Ansicht
ändert, prüft Rechte über `coachPermissions`/`hasCoachPermission` aus `@/shared/data`,
nie über URL-Parameter.
