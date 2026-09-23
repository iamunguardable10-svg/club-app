# Prüfplan für den lokalen Modus

Das Repository hat keine automatisierten Tests. Was hier nicht abgehakt ist, gilt als
ungeprüft. Jeder Run der Vereinfachung trägt sein Ergebnis ein.

Voraussetzung für jeden Durchlauf: frisches Browserprofil, **keine**
Umgebungsvariablen gesetzt.

## Die Kette

| # | Schritt | Ab Run | Stand |
|---|---|---|---|
| 1 | Trainer erstellt eine Einheit | 2 | bestanden |
| 2 | Spieler sieht die Einheit in seinem Kalender | 3 | bestanden |
| 3 | Spieler meldet sich verspätet oder ab | 3 | bestanden |
| 4 | Trainer sieht die Meldung | 3 | bestanden |
| 5 | Spieler trägt RPE und Dauer ein | 4 | offen |
| 6 | Trainer sieht die neue Belastung beim richtigen Spieler | 4 | teilweise (Seed-Daten) |
| 7 | Reload: Daten und Identität bleiben erhalten | 2 | bestanden |
| 8 | Rollenwechsel in beide Richtungen | 3 | bestanden |
| 9 | Personenwechsel: jeder sieht nur seine eigenen Werte | 3 | bestanden |
| 10 | Reset legt Testdaten korrekt neu an | 4 | offen |
| 11 | Frisches Profil ohne Umgebungsvariablen: App läuft | 2 | bestanden |

## Run 2 — Trainerbereich (2026-09-22)

Geprüft mit Playwright gegen den laufenden Dev-Server, ohne
`NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

| Prüfung | Ergebnis |
|---|---|
| `/coach/today` öffnet, **keine** Weiterleitung zur Anmeldung | bestanden |
| `/coach/sessions`, `/coach/team`, `/coach/load`, `/coach/facilities`, `/coach/history`, `/coach/attendance` laden | bestanden, alle sieben |
| Seed-Daten erscheinen (U16 Jungen, Basketball, Sporthalle Nord) | bestanden |
| Einheit anlegen → nach Reload weiterhin vorhanden (73 → 74) | bestanden |
| Kader zeigt 12 Spieler mit Namen, ACWR und Gruppen | bestanden |
| ACWR-Werte gestreut und plausibel (0,62 bis 1,09, Zonen Low/Ready) | bestanden |
| Absagen aus dem Seed erreichen die Trainersicht („3 availability flags") | bestanden |
| Anwesenheitsquote echt berechnet (96 %, 92 %, 88 %, 96 %, 79 %) | bestanden |
| `/demo/coach/today` leitet auf `/coach/today` weiter | bestanden |
| Laufzeitfehler in der Konsole | keine |
| `npm run typecheck`, `npm run build` | grün |

**Schritt 4 ist nur teilweise erfüllt:** Der Trainer sieht Absagen und Verspätungen —
aber bisher nur die aus dem Seed, weil es noch keine Oberfläche gibt, über die ein
Spieler etwas meldet. Die Richtung Spieler → Trainer wird in Run 3 vollständig geprüft.

**Schritt 6 ebenso:** Belastungswerte erscheinen beim richtigen Spieler, stammen aber
aus dem Seed. Der Weg über eine echte RPE-Meldung kommt in Run 4.

### Nicht geprüft

- Hallenkalender unter `/coach/facilities/[facilityId]/calendar` samt Konfliktprüfung:
  nur die Übersicht wurde geöffnet, nicht der Wochenkalender selbst.
- Serienplanung und Wochenbestätigung.
- Mobile Darstellung. Die Prüfung lief in Desktop-Breite.


## Run 3 — Einstieg, Identität, Verfügbarkeit (2026-09-23)

Geprüft mit Playwright bei **Telefonbreite (390 × 844)**, ohne Umgebungsvariablen.

| Prüfung | Ergebnis |
|---|---|
| `/` zeigt „Wie möchtest du die App testen?", keine Anmeldung | bestanden |
| „Training melden" öffnet den Spielerbereich mit gesetzter Identität | bestanden |
| Spieler sieht Team, 7-Tage-Last und ACWR (Jonas Kern: U16, 0,86) | bestanden |
| Hinweis auf ungemeldete Einheiten („11 kommende Einheiten") | bestanden |
| Absage mit Grund melden (2 Taps: Absage → Krank) | bestanden |
| Verspätung melden (2 Taps: Später → 15 Min) | bestanden |
| Meldungen landen in der Datenschicht (`out/Krank`, `late/15`) | bestanden |
| Rollenwechsel zum Trainer **ohne Reload** | bestanden |
| Trainer sieht Name und Grund konkret („Emil Busch · Familientermin", „Noah Wagner · 16m · Bus verpasst") | bestanden |
| Reload: Identität und beide Meldungen bleiben | bestanden |
| Personenwechsel: Jonas Kern ACWR 0,86 / 37 Einheiten, Lena Sturm 1,33 / 36 Einheiten | bestanden |
| Spieler sieht nur Einheiten des eigenen Teams (36 von 73) | bestanden |
| Laufzeitfehler | keine |
| Supabase im Spielerpfad (19 Dateien über die Importkette) | keine |
| `npm run typecheck`, `npm run build` | grün |

### Gefundener und behobener Fehler

Der Rollenwechsel war auf Telefonbreite **nicht bedienbar**. Das Auswahlfenster saß
454 Pixel oberhalb des Bildschirms und ließ sich nicht antippen.

Ursache: `os-panel` setzt `backdrop-filter: blur(24px)`, und ein backdrop-filter macht
das Element zum Bezugsrahmen für `position: fixed` seiner Nachkommen. Das Fenster
verankerte sich am umgebenden Panel statt am Sichtfenster. Betroffen wäre auch die
Trainer-Seitenleiste gewesen, die dieselbe Klasse trägt.

Behoben, indem das Fenster über ein Portal direkt in `document.body` gerendert wird.
Damit ist die ganze Fehlerklasse ausgeschlossen, egal welche Filter oder Transformationen
eine spätere Umgebung mitbringt.

Der Fehler wäre bei einer reinen Desktop-Prüfung nicht aufgefallen: ab 640 Pixel
zentriert sich das Fenster und liegt zufällig im sichtbaren Bereich.

### Nicht geprüft

- Hallenkalender als Wochenansicht samt Konfliktprüfung (steht seit Run 2 offen).
- Serienplanung und Wochenbestätigung.
- Reset-Schaltfläche: existiert noch nicht, kommt in Run 4.
