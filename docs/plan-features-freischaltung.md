# Umsetzungsplan: fehlende Funktionen und Freischaltung

Stand 2026-10-18. Grundlage: Hooplayer-Liste vom 2026-10-01 (`docs/plan-next-runs.md`,
„Vergleich mit Hooplayer“) und der heutige Stand der App.

## Was es schon gibt und was fehlt

| Hooplayer | Bei uns |
|---|---|
| Teamkalender mit Hallen, Push bei neuen/geänderten Terminen | ✅ (dazu Serien, Apple-Kalender, ICS, offline) |
| Zu-/Absagen mit einem Tipp, Live-Liste für den Trainer, „noch nicht reagiert“ | ✅ (seit Run 84 live ohne Neuladen; automatisch/selbst zusagen, Erinnerung) |
| Kaderplanung | ✅ (Kader je Spiel) |
| News/Pinnwand, Umfragen, Fahrgemeinschaften | ✅ (Team-, Abteilungs- und Vereins-News, angepinnt, Umfragen, Fahrgemeinschaften) |
| Alles in einer App statt WhatsApp/Excel | ✅ |
| Termin-Arten: Besprechung, Turnier, Hallenbuchung | ⚠️ teilweise: Training, Kraft, Spiel, Regeneration, Sonstiges; **Besprechung und mehrtägiges Turnier fehlen** (Hallenbuchung = Termin mit Halle, gibt es) |
| Eltern-Zugang für Jugendteams | ⚠️ nur die Eltern-Einwilligung per Link; **kein Eltern-Konto, das Termine sieht und für das Kind zu-/absagt** |
| Videoanalyse (teilen mit Team oder einzelnen, Feedback an Zeitstellen) | ❌ |
| Playbook/Taktik-Editor (Phasen, Animation, Bibliothek, Kategorien) | ❌ |

Zusätzlich bei uns, ohne Gegenstück: Belastung/RPE/ACWR, Abwesenheiten mit Gründen,
Vereins- und Hallenverwaltung über alle Teams, Abteilungen, vier Sprachen.

## 0 Grundsatz: Freischaltung in drei Ebenen

Jede Funktion (die bestehenden und alle neuen) hängt ab jetzt an einem **Funktions-Schlüssel**
(`load`, `video`, `playbook`, `parents`, `carpools` …). Ob sie an ist, entscheiden drei Ebenen,
und alle drei müssen „an“ sagen:

1. **Freigeschaltet (durch uns, je Verein):** Was der Verein gebucht hat (Paket, Pilot,
   Einzelfreischaltung). Nur wir setzen das, später automatisch durch die Bezahlung.
   Basisfunktionen sind für jeden Verein freigeschaltet.
2. **Vom Verein eingeschaltet (Vereins-Admin):** Innerhalb des Freigeschalteten kann der
   Verein jede Funktion aus- und einschalten, auch Basisfunktionen (z. B. „wir nutzen keine
   Fahrgemeinschaften“). Kernfunktionen (Kalender, Zu-/Absagen, Team-Nachrichten) sind nicht
   abschaltbar.
3. **Im Team eingeschaltet (nur Team-Funktionen):** Wie heute `teams.features` für Belastung:
   Der Verein (oder der Head Coach, wenn der Verein es erlaubt) wählt, welche Teams eine
   Team-Funktion nutzen (z. B. Belastung nur für die Leistungsteams, Video nur für die erste
   Mannschaft). Bei Paketen mit Team-Grenze zählt hier, wie viele Teams es haben dürfen.

**Wirkung von „aus“:** Echte Sperre auf dem Server (Zugriffsregeln, Trigger, Funktionen),
nicht nur ausgeblendet. Die Oberfläche blendet Tabs, Knöpfe, Push und Einstellungen aus. Die
Daten bleiben erhalten und sind beim Wiedereinschalten wieder da (wie heute bei Belastung).
Ein Wechsel kommt über die Live-Aktualisierung sofort bei allen an (er gehört zu den
Tabellen, nach denen alles neu lädt).

### Funktions-Katalog (Vorschlag, Paketnamen und Preise offen)

| Schlüssel | Ebene | Paket | Vom Verein abschaltbar |
|---|---|---|---|
| `calendar`, `rsvp`, `team_messages` | Kern | Basis | nein |
| `absences` (Abwesenheiten mit Zeitraum) | Verein | Basis | ja |
| `squads` (Kader je Spiel) | Verein | Basis | ja |
| `polls` (Umfragen) | Verein | Basis | ja |
| `carpools` (Fahrgemeinschaften) | Verein | Basis | ja |
| `club_news` (Abteilungs-/Vereins-News) | Verein | Basis | ja |
| `phone_calendar` (Apple-Kalender, Abo-Link) | Verein | Basis | ja |
| `attendance_check` (Anwesenheit bestätigen) | Verein | Basis | ja |
| `meetings_tournaments` (Besprechung, Turnier) | Verein | Basis | ja |
| `parents` (Eltern-Zugang) | Verein | Basis | ja |
| `hall_planning` (Hallenbelegung über alle Teams, Abteilungsüberblick) | Verein | Verein | ja |
| `load` (Belastung, RPE, ACWR) | Team | Leistung | ja |
| `video` (Videoanalyse) | Team | Leistung | ja |
| `playbook` (Taktik) | Team | Leistung | ja |

Pakete als Arbeitsnamen: **Basis** (kostenlos), **Verein** (Hallen/Abteilungen,
pro Verein und Jahr) und **Leistung** (pro Team und Monat). Das passt zur
Preis-Hypothese aus „Weg zum Umsatz“. Pilotvereine bekommen bis Saisonende alles
freigeschaltet.

## Stück F: Freischaltungs-Schicht (zuerst, vor allen neuen Funktionen)

**Server (Migration 0046):**
- `public.club_entitlements (club_id, feature, source 'pilot'|'plan'|'manual', valid_until, limits jsonb)`.
  Lesen dürfen Mitglieder ihres Vereins, schreiben nur wir (Service-Rolle). `limits` enthält
  z. B. `{"teams": 3}` oder `{"video_gb": 20}`.
- `public.club_feature_settings (club_id, feature, enabled)`: schreibt nur der Vereins-Admin.
  Ein Trigger verhindert, dass nicht Freigeschaltetes eingeschaltet wird.
- `teams.features` bleibt für Team-Funktionen, mit Prüfung gegen Freischaltung und Team-Grenze.
- `app.feature_on(club, feature, team default null)` ist die eine Prüfung, die alle
  Zugriffsregeln nutzen. `app.team_has_load` ruft sie ab dann intern auf.
- Lesbare Sicht `club_features` (Ergebnis je Verein/Team), wird in der App wie eine Tabelle geladen.
- `app.grant_feature(club, feature, until, limits)` für unsere Freischaltung (nur Service-Rolle),
  vorerst per SQL. Später ruft ein Bezahl-Webhook (Stripe) dieselbe Funktion auf.
- Nachrüsten: Alle bestehenden Vereine bekommen `pilot` für alles bis 2027-06-30. Bestehende
  Funktionen bekommen ihre Sperre: Umfragen, Fahrgemeinschaften, News, Abwesenheiten, Kader und
  Kalender-Abo prüfen beim Anlegen `feature_on`. Push-Arten werden für abgeschaltete
  Funktionen nicht erzeugt.

**App:**
- `useFeature(key, teamId?)` aus dem Dokument; alle bestehenden Stellen (heute `teamHasFeature`)
  laufen darüber.
- Verein → Einstellungen → **Funktionen**: Schalter je Funktion. Nicht Freigeschaltetes
  erscheint ausgegraut mit „Im Paket Leistung“. Bei Team-Funktionen gibt es eine Auswahl der Teams.
- Im Demo-Verein ist alles freigeschaltet. Damit man es sieht, lässt sich eine Funktion
  testweise abschalten.

**Fertig, wenn:** SQL-Tests für jede Ebene (nicht freigeschaltet → Anlegen abgelehnt;
freigeschaltet aber vom Verein aus → abgelehnt; Team ohne Funktion → abgelehnt; Daten bleiben
nach Aus/An). Store-Test: ein Wechsel lädt alles neu. Browser-Check: Verein schaltet
Fahrgemeinschaften aus, und beim Spieler verschwindet der Knopf live. Vier Sprachen.

## Stück 1: Besprechung und mehrtägiges Turnier (`meetings_tournaments`, Basis)

- Neue Termin-Arten `meeting` (ohne Halle möglich, Ort frei oder online-Link, keine RPE-Abfrage)
  und `tournament` (Start- und Enddatum über mehrere Tage, optional mehrere Spiele darunter).
- Kalender: mehrtägige Balken in Wochen- und Monatsansicht, eine Zusage für das ganze Turnier,
  optional je Tag. Kader und Fahrgemeinschaften gelten für das Turnier.
- Belastung: Spiele im Turnier fragen wie Spiele nach RPE; die Besprechung fragt nicht.
- Server: Erweiterung der Prüfung von `session_type`, `ends_at` darf über mehrere Tage gehen
  (heute auf eine Einheit ausgelegt). ICS und Apple-Kalender liefern Ganztags- bzw.
  Mehrtages-Termine.
- Fertig, wenn: Anlegen, Verschieben und Zusagen für beide Arten, Kalenderansichten Handy und
  Desktop, ICS-Test, vier Sprachen.

## Stück 2: Eltern-Zugang (`parents`, Basis)

- **Modell:** `guardians (parent_user_id, person_id, relation, created_at)`. Ein Elternteil
  ist ein eigenes Konto ohne Person im Team. Es kann mehrere Kinder haben, ein Kind kann
  zwei Elternteile haben.
- **Einladung:** Der Trainer oder das Kind schickt einen Eltern-Link (wie heute der
  Einwilligungs-Link, den wir erweitern). Bei unter 16 ist die Eltern-Einwilligung gleich
  Teil davon.
- **Was Eltern sehen und tun:** Kalender des Kindes, Zu-/Absagen für das Kind (mit Hinweis
  „von Mama gemeldet“), Abwesenheiten melden, Team-Nachrichten mit Zielgruppe „Eltern“,
  Fahrgemeinschaften (fahren selbst mit Plätzen), Push. **Keine Belastungsdaten**, außer das
  Kind ist unter 16 und die Eltern haben in die Gesundheitsdaten eingewilligt. Dann sehen sie
  dieselbe Ansicht wie das Kind, nur lesend.
- **Rechte:** Neue Prüfung `app.is_guardian_of(person)` in den Zugriffsregeln für
  Verfügbarkeit, Abwesenheit, Fahrgemeinschaft und Nachrichten-Lesen.
  Rollenumschalter: „Als Elternteil von Mia“.
- **Nachrichten:** Neue Zielgruppe „Eltern“ bzw. „Spieler und Eltern“. „Gelesen“ zählt je Familie.
- Fertig, wenn: SQL-Tests (Eltern sieht nur eigenes Kind, kein Load ohne Einwilligung,
  Kind 16+ kann den Eltern-Zugang beenden), Live-Test mit drei Konten (Trainer, Kind,
  Elternteil), vier Sprachen.

## Stück 3: Videoanalyse (`video`, Leistung, Team-Funktion)

In zwei Phasen, damit wir früh etwas haben und keine Speicherkosten raten müssen:

- **3a Links und Zeitstellen (ohne Upload):** Trainer fügt ein Video per Link hinzu (YouTube
  nicht gelistet, Vimeo, Hudl, Google Drive). Es wird im eingebetteten Player abgespielt.
  Freigabe für das ganze Team oder einzelne Spieler. Feedback an Zeitstellen
  (`video_notes: video_id, at_seconds, body, for_person`); ein Tipp springt an die Stelle.
  Spieler sehen „Für dich“ zuerst, mit Push bei neuer Freigabe. Spieler können an
  Zeitstellen antworten (optional, Schalter).
- **3b Hochladen:** Supabase Storage, privater Bucket je Verein, nur signierte Links. Größen-
  und Speichergrenze aus `limits` (z. B. 20 GB je Verein). Hochladen vom Handy mit Fortschritt
  und Fortsetzen. Löschen gibt den Speicher frei. Braucht Supabase Pro (siehe Liste
  „Vor Werbung und Pilot“).
- **CSP:** Erlaubte Einbett-Quellen (frame-src) werden gezielt ergänzt.
- Fertig, wenn: SQL-Tests (Spieler sieht nur ihm freigegebene Videos, anderes Team nichts,
  ohne Funktion nichts), Abspielen und Springen auf Handy/Desktop, vier Sprachen, bei 3b ein
  Upload-Test mit Grenze.

## Stück 4: Playbook / Taktik (`playbook`, Leistung, Team-Funktion)

Größtes Stück, deshalb in vier Teilen:

- **4a Daten und Ansicht:** `plays (team_id, name, category, court, phases jsonb,
  shared_with, updated_at)`. Eine Phase ist eine Aufstellung von Spielern (O1–O5, X1–X5),
  Ball und Pfeilen (Pass, Laufweg, Block, Dribbling). Die Ansicht als SVG-Feld (zuerst
  Basketball, halbes und ganzes Feld). Phasen wechseln per Wischen.
- **4b Editor:** Auf Handy und Desktop Spieler ziehen, Pfeile zeichnen, Phase duplizieren und
  weiterziehen, rückgängig machen. Gespeichert über die normale Datenschicht (offline-fähig).
- **4c Animation:** Zwischen den Phasen fließend bewegen (Laufweg entlang der Pfeile, Ball
  folgt dem Pass), mit Abspielen/Pause/Tempo. Für die Spieler als Hauptansicht.
- **4d Bibliothek:** Kategorien (Out-of-Bounds, Baseline, Press-Break, Zone, Mann …,
  frei erweiterbar), Suche, Favoriten, offline verfügbar. Teilen mit Team oder Gruppe.
  Ein Spielzug lässt sich an einen Termin hängen („heute üben wir das“).
- Später: weitere Sportarten (Feld-Vorlagen Fußball, Handball, Volleyball).
- Fertig, wenn: SQL-Tests (nur eigenes Team, Spieler nur lesen), Editor-Gesten auf Handy
  (Playwright mit Touch), Animation flüssig mit 4× gedrosselter CPU, vier Sprachen.

## Stück Z: Bezahlung (nach dem Pilot)

- Erst wenn Pakete und Preise aus den Pilotgesprächen feststehen.
- Stripe Checkout bzw. Rechnung für Vereine. Der Webhook ruft `app.grant_feature` auf. Läuft
  die Zahlung aus, endet `valid_until`, und die Funktionen gehen aus, die Daten bleiben.
- Seite „Paket und Rechnung“ für den Vereins-Admin.

## Reihenfolge (Empfehlung)

1. **F Freischaltung.** Das ist das Fundament; danach entsteht jede neue Funktion gleich mit
   ihrem Schalter.
2. **1 Besprechung/Turnier.** Klein, in Gesprächen oft gefragt.
3. **2 Eltern-Zugang.** Wichtig für Jugendvereine, die im Pilot typisch sind.
4. **3a Video per Link.** Wenig Aufwand, sichtbarer Mehrwert für das Paket „Leistung“.
5. **4a–4d Playbook.**
6. **3b Video-Upload.** Erst mit Supabase Pro und wenn die Nachfrage da ist.
7. **Z Bezahlung.**

Für jedes Stück gilt wie bisher: Sperre auf dem Server, App, vier Sprachen, Tests in der CI,
Vorher-/Nachher-Screenshots, Live-Test mit Wegwerf-Konten, und beim Abschalten bleiben die Daten.

## Offene Fragen an Ben

- Paketnamen und Preise (Arbeitsnamen oben). Soll der Eltern-Zugang wirklich kostenlos sein?
- Video: Reichen am Anfang Links (3a), oder muss Hochladen von Anfang an dabei sein?
- Playbook: Nur Basketball zum Start, oder gleich eine zweite Sportart?
- Darf ein Head Coach Team-Funktionen selbst einschalten, wenn der Verein sie gebucht hat, oder
  nur der Vereins-Admin?
