# Verbindliche Entscheidungen für den Vereinfachungsumbau

Stand: 2026-09-22. Diese Datei gilt für alle sechs Runs des Umbaus und hat Vorrang vor
älteren Festlegungen in `AGENTS.md` und `docs/v1-decisions.md`, solange der Umbau läuft.
Run 5 zieht die beiden Dateien nach.

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

**Eine einzige Ausnahme:** Die alten `club-app.demo.*`-Schlüssel werden nicht aktiv
gelöscht, solange die Entscheidung zu den Demo-Verwaltungsbereichen offen ist
(siehe Punkt 4). Sie werden nur ignoriert — nicht gelesen, nicht geschrieben, nicht
entfernt. Das kostet nichts und hält die Option offen.

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

## 4. Offen: die Demo-Verwaltungsbereiche

Ob `/demo/admin/*` und `/demo/department/*` (19 Routen) erhalten bleiben, ist noch
nicht entschieden. Tendenz: vorerst behalten, um die Verwaltungsansichten beim Testen
noch anschauen zu können. Run 5 fragt ausdrücklich nach und löscht sie nicht ohne
Bestätigung.

Anders als ihre Live-Gegenstücke nutzen sie kein Supabase und laufen rein lokal aus den
alten `club-app.demo.*`-Schlüsseln.

`/admin/*` und `/department/*` entfallen dagegen in jedem Fall: Zehn ihrer Komponenten
hängen am Supabase-Client und würden beim ersten Klick an
`Missing NEXT_PUBLIC_SUPABASE_URL` sterben.

Preis des Behaltens: Die Verwaltungsansichten lesen die alten Schlüssel, nicht die neue
Datenschicht. Was ein Trainer anlegt, erscheint dort nicht — die Stände driften
auseinander. Zum Anschauen taugen sie, zum Prüfen von Abläufen nicht.

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

| Kennzahl | Start | Ziel |
|---|---|---|
| Aktive Routen | 67 | etwa 20 |
| Zeilen unter `src` | 28.244 | etwa 12.000 |
| Dateien mit Supabase-Bezug | 26 | 0 |
| Dateien mit `localStorage`-Zugriff | 13 | 1 |

Bleiben die Demo-Verwaltungsbereiche erhalten, sind die Werte für Routen, Zeilen und
Speicherzugriff planmäßig nicht erreichbar — rechne dann mit etwa 39 Routen und zwei
Dateien mit Speicherzugriff. Das ist dann Folge einer bewussten Entscheidung, kein
Fehlschlag.
