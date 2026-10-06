# Onboarding-Konzept: jede Seite, jede Rolle (praktische Touren, Run 72)

Auftrag (Ben, 2026-10-03): Für jede Funktion und jede Seite ein richtiges Onboarding planen, damit
neue Nutzer – Spieler, Trainer, Abteilungsleitung, Vereinsadmin – alle Funktionen gezeigt bekommen.
Erst dieses Konzept, dann gebaut (Ben, 2026-10-03: „baue es jetzt“, ohne vorherige Durchsicht; fällt
es nicht gut aus, wird es zurückgerollt). Neue Funktionen planen ihr Onboarding ab jetzt immer mit
(Regel in Abschnitt 7).

**Stand (Run 72):** Willkommen mit persönlicher Begrüßung und drei ruhigen Karten,
echte Übungen in den bestehenden Ansichten, isolierter Übungsmodus in der Datenschicht,
Seiten-Touren, Moment-Tipps, „?“ und Zurücksetzen in den Einstellungen sind implementiert.
Der Browser-Durchlauf und die visuelle Abnahme stehen beim Reviewer aus: diese Arbeitsumgebung
verweigert lokale Server-Sockets (`EPERM`). Lehrende Leerzustände und die Einrichtungs-Liste bleiben
eigene spätere Stücke; „Neu“ kennzeichnet die überarbeiteten Touren für bestehende Nutzer.

Gemeint ist ein interaktives Onboarding wie bei iOS-Apps beim ersten Öffnen einer Seite: Es zeigt am
echten Bildschirm die Gesten und Knöpfe der Seite, kurz animiert, Schritt für Schritt (siehe
`plan-next-runs.md`, „Onboarding pro Seite, richtig gemeint“).

## 1. Ursprünglicher Ausgangszustand (Run 69)

- **Einstieg:** Startseite „Wer bist du?“ (Spieler, Trainer, Abteilungsleitung, Gründer), Beitritt
  per Code/Link/QR (`/join`), Einladungen, Vereinsgründung (`/found`), Demo-Verein.
- **Hinweis-Karten** (`PageTip`, Run 59): eine Karte pro Seite beim ersten Besuch, mit × weg, in den
  Einstellungen zurückholbar (15 Seiten). Nur Text, keine Gesten.
- **Einzelne Karten:** Telefon-Kalender beim ersten Kalender-Öffnen, „Als App installieren“,
  Benachrichtigungen erlauben, „Noch einzurichten“ beim Team.
- **Lücke:** Gesten (Tippen auf freie Zeit, Ziehen, Kante ziehen, Wischen) sieht man nirgends.
  Viele Funktionen findet man nur durch Ausprobieren: Gruppen, Kader, Wochenvorlagen, Abwesenheit,
  „Prüfen lassen“, Rollenwechsel, Teilen der Belastung, Umfragen, „An:“-Feld, Anpinnen,
  Schreibrechte, Hallen-Konflikte.

## 2. Grundsätze

1. **Zeigen statt erklären.** Jeder Schritt hebt das echte Bedienelement hervor (Rest abgedunkelt)
   und spielt die Geste kurz vor (Finger: tippen, ziehen, Kante ziehen, wischen). Ein Satz pro
   Schritt.
2. **Kurz.** Höchstens sieben Schritte pro Seite. „Weiter“, „Überspringen“ jederzeit; eine beobachtete Änderung
   bestätigt einen Übungsschritt.
3. **Zur rechten Zeit.** Eine Seite erklärt sich beim ersten Öffnen – nicht alles am Anfang. Tiefere
   Funktionen erklären sich beim ersten Gebrauch (Moment-Tipps, Abschnitt 3C).
4. **Nur was zählt.** Nur Schritte, die die Rolle darf und das Team nutzt (Belastung an/aus, Rechte
   der Trainerrolle, Gruppen vorhanden, Spiel statt Training …). Fehlt ein Element, entfällt der
   Schritt.
5. **Nichts geht kaputt.** Geübt wird mit einer tiefen Kopie des aktuellen Dokuments im Speicher;
   die echten Komponenten lesen und ändern diese Kopie, die anschließend verworfen wird.
6. **Leere Seiten lehren.** Jeder Leerzustand sagt den nächsten Schritt („Noch keine Spieler →
   Code teilen“) mit Knopf dorthin.
7. **Wiederholbar.** „?“ oben auf jeder Seite spielt ihre Tour erneut; Einstellungen → „Einführungen“
   setzt alle zurück.
8. **Einmal pro Konto.** Wer die Tour gesehen hat, sieht sie auf dem nächsten Gerät nicht wieder
   (im Demo-Verein: pro Browser).
9. **Neues für Bestehende.** Kommt eine Funktion dazu, sehen bestehende Nutzer nur deren Schritt
   („Neu: …“), nicht die ganze Seite noch einmal.
10. **Handy und Desktop.** Auf dem Handy Finger-Gesten, auf dem Desktop Maus-Hinweise (ziehen,
    klicken); eigener Satz, wo es sich unterscheidet. Beides wird geprüft (390 px und breit).
11. **Für alle bedienbar.** Weniger Bewegung (Systemeinstellung) → Standbild statt Animation;
    Schritttexte für Screenreader; Esc/Enter am Desktop.
12. **Vier Sprachen**, wie alle Texte (en, de, fr, es; du/tu/tú).

**Historie: Gefühl wie in nativen Apps (Run 71, Ben: „es fehlt die Luft bzw. das fertige Ergebnis zwischen den
Gesten“):** Jeder Schritt hat drei Takte. (1) Das Licht gleitet zum Element, (2) die Karte kommt herein,
(3) erst dann startet der Gesten-Hinweis. Bei der Geste hebt sich eine Kopie des Elements ab und folgt
dem Finger: gezogen, an der Unterkante länger gezogen, weggewischt (der nächste Tag schiebt sich
herein) bzw. beim Tippen eingedrückt. Beim Loslassen rastet sie ein, ein Haken erscheint, und ein Satz
sagt, was gerade passiert ist (`tour.<key>.result`). Das Ergebnis bleibt kurz stehen, dann blendet die
Karte aus und das Licht gleitet weiter. Eine falsche Geste federt zurück. Android vibriert kurz.

**Rückmeldung Ben (2026-10-06):** noch etwas durcheinander.
- Die Gesten sollen **wirklich etwas tun** wie in einer echten Übung: im Kalender eine Einheit anlegen,
  sie verschieben, in der Länge ändern und am Ende wieder löschen; in den Nachrichten genauso (eine
  Nachricht schreiben und wieder entfernen). Bisher passiert auf der Seite nichts – nur die Kopie bewegt
  sich. Umsetzung: eine echte Übungs-Einheit/-Nachricht, die die Tour anlegt und am Ende sicher wieder
  entfernt (auch wenn die Tour abgebrochen wird), ohne Benachrichtigungen an Spieler.
- **Gruppen** innerhalb des Teams erklären (anlegen, Spieler zuordnen, Einheit/Nachricht nur an eine
  Gruppe).
- Das **Willkommen am Anfang** ist verwirrend und wird neu gemacht.

### Umsetzung der Rückmeldung (Run 72)

Ein `show`-Schritt erklärt ein Element; ein `do`-Schritt lässt die echte Oberfläche durch ein Loch
in vier Abdunklungsflächen bedienen. Die Tour prüft das Dokument oder den geöffneten Dialog,
nicht die Fingerbewegung. Nach Erfolg: Haken, ein Ergebnissatz, 1,4 Sekunden zum Anschauen,
danach der nächste Schritt. Das Ergebnis selbst wird beleuchtet (z. B. die gesendete Nachricht).
„Weiter“ und „Überspringen“ bleiben erreichbar. Ein falscher Versuch erhält einen ruhigen Hinweis.
Tastatur und Screenreader werden berücksichtigt; bei weniger Bewegung entfallen Animationen.

| Rolle / Ort | Gebaute Übung | Schritte |
| --- | --- | --- |
| Spieler Heute | Einheit öffnen → Absage mit Grund speichern → dieselbe Einheit öffnen und wieder zusagen → RPE und Minuten speichern (nur mit Load) → Nachrichtenhinweis | höchstens 5 |
| Spieler Kalender | am Handy Tag wischen → zukünftige Teameinheit öffnen → absagen → wieder zusagen | höchstens 4 |
| Spieler Nachrichten | Absender-Chip wählen → in einer Übungsumfrage abstimmen → Angepinntes erklären | höchstens 3 |
| Trainer Kalender | am Handy Tag wischen → Bearbeiten → freien Platz antippen → Entwurf im echten Editor mit Team speichern → verschieben → Unterkante ziehen → öffnen und im Bestätigungsdialog löschen | Handy 7, Desktop 6 |
| Trainer Team | Team wählen, falls nötig, und Gruppen öffnen → Bearbeiten → vorgeschlagenen Namen übernehmen oder ändern → zwei Spieler antippen → Gruppen als Empfänger erklären → Nachrichten öffnen → Einstellungen erklären | 7 |
| Staff Nachrichten, auch Team-Reiter | Empfänger öffnen → Team und darunter Gruppe wählen → Beispieltext übernehmen oder selbst schreiben → Wichtig einschalten → senden und Lesestand/Pin sehen → löschen und bestätigen → Umfrage einschalten | 7 |
| Vereinsadmin / Abteilungsleitung, Verein | Team in der eigenen Abteilung erstellen → Head-Coach-Bereich erklären → wiederverwendete Hallenverwaltung öffnen → Halle erstellen → Übung beenden | 5 |
| Vereinsadmin / Abteilungsleitung, Hallen | Bearbeiten → Halle erstellen → Übung beenden | 3 |

Die normale RPE-Abfrage wartet beim ersten Einstieg auf das Willkommen. Tour-eigene Editor-,
Absage-, Bewertungs- und Bestätigungsdialoge werden weiter bedient; sie blockieren ihre Tour nicht.
Dialoge bekommen während der Übung Platz unter der Tour-Karte und keine zweite Abdunklung.
Beim Beenden verschwinden offene Übungsdialoge und Entwürfe. Der Nachrichten-Reiter verwendet
denselben Nachrichten-Rundgang wie `/messages`.

Leere Teams bekommen bei Bedarf eine Übungseinheit bzw. eine Beispielumfrage in der Kopie.
Für Nachrichten wird bei fehlenden Gruppen eine Übungsgruppe aus vorhandenen Spielern vorbereitet.
Dabei entstehen keine zusätzlichen Rechte oder Mitgliedschaften. Für eine Gruppenübung mit zwei
Spielern müssen zwei echte Team-Mitglieder vorhanden sein; sonst kann der Nutzer mit „Weiter“
fortfahren. Der Kalender berücksichtigt das echte Planungsrecht und vorhandene Hallen.

Das Willkommen nennt Vorname, Verein und Rolle/Teams, dann ein passendes Versprechen für Spieler,
Trainer, Abteilungsleitung oder Admin. Die letzte Karte bietet ausdrücklich „Zeig mir die App
(2 Min.)“ oder „Ich schaue mich selbst um“; Push ist nur ein leiser optionaler Knopf. Mehrere Rollen
werden einmal mit dem Weg zum Rollenwechsel erwähnt. Neue Speicherkennungen `.practice-v1`
bieten den überarbeiteten Einstieg einmal an, auch wenn die alte Tour bereits gesehen wurde.

Die folgenden detaillierten Funktionslisten bewahren den ursprünglichen Gesamtplan; die Tabelle
oben beschreibt die jetzt gebauten praktischen Abläufe. Leerzustände und Einrichtungs-Listen aus
diesem Gesamtplan sind weiterhin offen.

## 3. Bausteine

| Baustein | Was | Wann |
| --- | --- | --- |
| A. Willkommen | drei Karten: persönliche Begrüßung, Nutzen je Rolle, Üben oder selbst entdecken; optional Push | einmal nach dem ersten Beitritt, je Rolle |
| B. Seiten-Tour | Hervorhebung + echte Aktion oder Erklärung + ein Satz, höchstens sieben Schritte | erstes Öffnen einer Seite (ersetzt die Hinweis-Karte) |
| C. Moment-Tipp | kleine Sprechblase am Element, ein Satz | erster Gebrauch einer Funktion (erste Umfrage, erster Kader …) |
| D. Lehrender Leerzustand | Satz + Knopf zum nächsten Schritt | solange etwas leer ist |
| E. Einrichtungs-Liste | Haken-Liste „Erste Schritte“ mit Fortschritt | Trainer, Abteilungsleitung, Admin bis alles erledigt |
| F. „Neu“-Hinweis | „Neu“-Markierung und neue Kennung der praktischen Tour | bestehende Nutzer, einmal |
| G. „?“-Knopf | spielt die Seiten-Tour erneut | immer |

## 4. Ursprünglicher Rollenplan (Baustein A; aktuelle Umsetzung oben)

- **Spieler:** 1) „Heute“: deine nächste Einheit, zu- oder absagen. 2) „Kalender“: alle Termine,
  Treffpunkt und Halle. 3) „Belastung“ (nur mit Belastung): nach jeder Einheit „Wie hart war es?“.
  4) „Nachrichten“: alles von Trainern, Abteilung und Verein. Letzte Karte: Benachrichtigungen
  erlauben + App installieren.
- **Trainer:** 1) „Heute“: wer kommt, wer fehlt. 2) „Kalender“: planen durch Tippen. 3) „Team“:
  Spieler, Gruppen, Nachrichten, Trainerteam. 4) „Verlauf“: Anwesenheit und Belastung im Rückblick.
  Danach die Einrichtungs-Liste (E).
- **Abteilungsleitung:** Abteilung mit Teams und Head Coaches, Hallen, Nachrichten an die Abteilung,
  wer noch schreiben darf. Danach Einrichtungs-Liste.
- **Vereinsadmin/Gründer:** Verein aufbauen (Abteilungen, Teams, Leitungen), Hallen, Nachrichten an
  den ganzen Verein. Danach Einrichtungs-Liste.
- **Mehrere Rollen** (z. B. Spieler-Trainer): zusätzliche Karte „Rolle wechseln“ (Symbol oben rechts).

## 5. Touren pro Seite (Bausteine B, C, D)

Geste: 👆 tippen · ✋ ziehen · ↕ Kante ziehen · ↔ wischen. „(B)“ = nur mit Belastung, „(R)“ = nur mit
dem passenden Recht.

### Spieler

**Heute** (`/athlete/home`)
1. 👆 Karte „Als Nächstes“ antippen → absagen oder „komme später“ mit Grund.
2. 👆 „Dabei“ / „Absagen“ – nur wer „selbst antworten“ eingestellt hat.
3. 👆 „Ich bin eine Weile weg“ – Abwesenheit für mehrere Tage (krank, Urlaub …).
4. 👆 Nachrichten-Karte: Neues und Angepinntes.
5. (B) 👆 „Mit Trainer teilen“ – Belastung per Link teilen.
- Moment-Tipps: erste „Wie hart war es?“-Abfrage (Skala 1–10 mit Beispielen, Minuten; „Später“
  hebt sie auf); erste Bitte „Bitte prüfen“ vom Trainer; erster veröffentlichter Kader („Du bist im
  Kader / Ersatz“); erste Einheit mit Treffpunkt.
- Leerzustand: „Keine Einheiten geplant – dein Trainer plant sie im Kalender.“

**Kalender** (`/athlete/calendar`)
1. 👆 Tag oder ganze Woche wählen. (Wischen zwischen Tagen gibt es hier noch nicht, nur beim
   Trainer – beim Bau angleichen?)
2. 👆 ‹ › wechselt die Woche, „↺ Woche“ springt zur aktuellen zurück.
3. 👆 Einheit antippen → Zeit, Halle mit Karte, Treffpunkt, Notiz, zu-/absagen.
4. (B) 👆 Freie Zeit antippen → eigenes Training, einmal oder wöchentlich; es zählt zur Belastung.
- Moment-Tipp: Telefon-Kalender verbinden (Apple oder Link) – die Karte gibt es schon.

**Belastung** (`/athlete/load`, nur (B))
1. Ampel und ACWR: grün 0,8–1,3 ist gut, ab 1,5 steigt das Verletzungsrisiko – mit Beispiel.
2. Belastung = Anstrengung (RPE) × Minuten; der Trend zeigt die Richtung.
3. 👆 Eintrag antippen → bearbeiten oder löschen.
4. Hinweis: verlässlich erst nach etwa 30 Tagen mit Einträgen.

**Nachrichten** (`/athlete/messages`)
1. 👆 Chips (Team, Abteilung, Verein): antippen filtert, nochmal antippen zeigt alles; die Zahl ist
   ungelesen.
2. „Angepinnt“ bleibt oben, auch gelesen – weil es wichtig ist; danach rutscht es in den Verlauf.
3. Blauer Punkt = neu; Öffnen der Seite zählt als gelesen.
4. 👆 Umfrage: Antwort antippen, ändern bis sie geschlossen ist.

**Einstellungen** (`/settings`, Moment-Tipps statt Tour): Zusagen automatisch oder selbst,
Benachrichtigungen und Ruhezeiten, Kalender aufs Handy, Sprache, Team verlassen, Konto und Daten.

### Trainer

**Heute** (`/coach/today`)
1. 👆 Einheit antippen → Teilnehmer, Kader, Anwesenheit, Belastung.
2. Absagen und Verspätungen erscheinen hier sofort, mit Grund (R).
3. 👆 „1 ohne Antwort · Erinnern“ – einmal erinnern.
4. 👆 Nach der Einheit „Wer war da?“: antippen, wer fehlte, dann bestätigen.
- Leerzustand: „Noch nichts geplant → Kalender“.

**Kalender** (`/coach/sessions`), die wichtigste Gesten-Tour
1. 👆 „Bearbeiten“ einschalten.
2. 👆 Freie Zeit antippen → neue Einheit; Team wählen, Häkchen bestätigt.
3. ✋ Einheit ziehen → verschieben.
4. ↕ Untere Kante ziehen → kürzer oder länger.
5. ↔ Tagesansicht am Handy: zum nächsten / vorigen Tag wischen (außerhalb von „Bearbeiten“);
   ‹ › wechselt die Woche, „↺ Woche“ springt zurück; Tag- oder Wochenansicht.
- Moment-Tipps: erste Einheit öffnen (Art, Halle, Gruppen als Teilnehmer, Notiz); erstes Spiel
  (Gegner, Heim/Auswärts, Treffpunkt, Kader); erste Wochenvorlage (R: Wochenplan → Vorlage →
  „Woche bestätigen“ legt die Einheiten an); erster Hallen-Konflikt (Warnung erklärt).
- Leerzustand: „Erst eine Halle anlegen“ (gibt es schon) → Knopf zu den Hallen.

**Einheit-Blatt** (aus Heute, Kalender, Verlauf; Moment-Tipps)
- **Kader** (Spiel, R): 👆 pro Spieler Kader / Ersatz / raus; „Alle Verfügbaren → Kader“;
  „Veröffentlichen“ – erst dann sehen Spieler ihren Status; Änderungen später melden.
- **Anwesenheit:** 👆 wer nicht da war, dann bestätigen.
- (B) **Einblick:** Rückmeldungen, gefühlt härteste/leichteste, fehlende Einträge.

**Team** (`/coach/team`)
1. 👆 Bereiche: Übersicht, Spieler, Gruppen, Nachrichten, Trainerteam & Einstellungen.
2. Spieler sortiert nach „Braucht Aufmerksamkeit“ (B); 👆 Spieler → Belastung, Anwesenheit,
   „Abwesend eintragen“, „Bitte prüfen“ für einen Eintrag (R).
3. 👆 Gruppen anlegen (z. B. Starting Five) – für Einheiten und Nachrichten an Teile des Teams.
4. 👆 Spieler einladen: Link, QR-Code oder Code teilen.
5. (R) Trainerteam: Person hinzufügen, Einladungslink, Rollen mit Rechten (Head Coach hat immer
   alle).
- Leerzustand: „Noch keine Spieler → Code teilen“ (gibt es; Knopf ergänzen).

**Nachrichten** (`/messages` und Team → Nachrichten)
1. 👆 „An:“: Team antippen = ganzes Team; darunter Gruppen antippen = nur diese Gruppen; Abteilung
   oder Verein, wenn die Rolle es darf. Wer in zwei Teams ist, bekommt es einmal.
2. 👆 „Wer:“ alle / nur Trainer / nur Spieler.
3. 👆 „Wichtig“ = angepinnt bis zum gewählten Datum, auch gelesen; die Benachrichtigung lässt sich
   nicht abschalten.
4. 👆 „Umfrage“: Frage und Antworten, eine oder mehrere.
5. 👆 „Gelesen 3/5“ antippen → wer noch nicht; einmal erinnern; Umfrage schließen.
- Symbol oben rechts: neue Nachrichten an dich (z. B. „nur Trainer“).

**Verlauf** (`/coach/history`)
1. 👆 Woche im Diagramm antippen → ihre Einheiten.
2. Kennzahlen umschalten: Anwesenheit, RPE, Belastung, Rückmeldungen (B).
3. 👆 Einheit → Einblick.

**Hallen** (`/coach/facilities`) und **Hallenkalender**
1. 👆 Halle öffnen → Kalender mit allen Teams; die eigenen sind hervorgehoben.
2. (R) „Bearbeiten“: wie im Kalender; Überschneidungen warnt die App sofort.

### Abteilungsleitung und Vereinsadmin

**Verein** (`/club`)
1. 👆 Abteilung anlegen (nur Admin), darin Teams anlegen.
2. 👆 „+“ am Team: Head Coach mit Namen anlegen und Einladungslink schicken.
3. 👆 Leitungen und Admins hinzufügen; Teams archivieren und wiederherstellen.
4. 👆 „Wer darf schreiben?“ – Trainer für die Abteilung, Leitungen für den Verein freigeben.
- Einrichtungs-Liste (E): Abteilung · Team · Head Coach eingeladen · Halle · erste Nachricht.

**Hallen** (`/club/halls`)
1. 👆 Halle anlegen, Adresse (mit Vorschlägen).
2. 👆 „Buchbar für“ – welche Abteilungen sie nutzen dürfen; Standardhalle der Teams.
3. 👆 Halle öffnen → Hallenkalender.

**Nachrichten:** wie bei Trainern, zusätzlich Abteilung bzw. ganzer Verein und „nur Trainer“; der
ganze Verein umfasst alle Abteilungen und Teams.

### Für alle (Moment-Tipps)

- **Rolle wechseln** (Kopf-Symbol) – sobald jemand zwei Rollen hat.
- **Offline:** „Wartet auf Netz“ – Änderungen gehen später raus.
- **Problem melden** (Kopf-Symbol → „Problem melden“).
- **Benachrichtigungen** und **App installieren** (Karten gibt es; in die Willkommens-Tour holen).
- **Datenschutz / Konto löschen** – in den Einstellungen, keine Tour nötig.

### Abdeckung: jede Funktion hat einen Ort

| Funktion | gezeigt in |
| --- | --- |
| Zu-/Absagen, Grund, Antwort zurückändern | echte Übung Spieler Heute / Kalender; Verspätung im selben Blatt |
| Selbst antworten / automatisch | Spieler Heute 2, Einstellungen |
| Abwesenheit (Spieler / vom Trainer) | Spieler Heute 3 / Trainer Team 2 |
| „Wie hart war es?“: RPE und Minuten | echte Übung Spieler Heute (mit Load), Moment-Tipp `moment.rate` |
| Eigenes Training, Serien | bestehender Kalender; weiterer Gesamtplan oben |
| Belastung, ACWR, Teilen, „Bitte prüfen“ | Spieler Belastung, Heute 5, Moment-Tipp |
| Kalender-Gesten, Wochenvorlagen, Spiele, Treffpunkt | Trainer Kalender + Moment-Tipps |
| Kader, Anwesenheit, Einblick | Einheit-Blatt |
| Gruppen anlegen und zwei Spieler zuordnen | echte Übung Trainer Team; Zielgruppen für Einheiten und Nachrichten erklärt |
| Einladen, Trainerteam & Rechte | Trainer Team Einstellungen; Verein Head-Coach-Bereich |
| Nachrichten senden/löschen, Team → Gruppe, Beispieltext, Wichtig/Pin, Lesestand | echte Übung Staff Nachrichten und Team-Reiter |
| Filter-Chip und Umfrage beantworten | echte Übung Spieler Nachrichten |
| Erinnern | bestehende Nachrichtenzählung; während der Übung ohne Serverwirkung |
| Team und Halle erstellen, Head Coach einladen | echte Übung Verein und Hallen, für Admin und Leitung im erlaubten Bereich |
| Leitungen, Schreibrechte, Archiv | bestehender Vereinsbereich, ursprünglicher Gesamtplan oben |
| Hallen, Hallenkalender, Konflikte | Hallen-Touren, Moment-Tipp |
| Telefon-Kalender, Push, Installieren, Sprache | Willkommen, Moment-Tipps, Einstellungen |
| Rollenwechsel, Offline, Problem melden | Moment-Tipps für alle |

## 6. Technik (so gebaut)

Code: `src/features/onboarding/` – `tours.ts` (alle Schritte), `Tour.tsx` (Licht, Gesten, Karte),
`TourHost.tsx` (welche Tour wann), `Welcome.tsx`, `MomentTip.tsx`, `tourBus.ts`. Fortschritt in
`repository.ts` (`isTourSeen`, `markTourSeen`, `resetTours`, `loadToursFromAccount`; mit Konto in den
Konto-Metadaten `tours_seen`, keine Migration). Test: `npm run test:tours` (CI, nach dem Rundgang);
der Rundgang (`test:smoke`) schaltet die Touren ab (`club-app.tours-off`).
Neue Schritte: Element mit `data-tour="…"` markieren, Schritt in `tours.ts`, Texte
`tour.<key>.title/text` in allen vier Sprachen.

**Übungsgrenze:** `startPractice()` kopiert das aktuelle Dokument tief im Speicher;
`readDatabase()` und `useLocalDatabase()` liefern diese Kopie. `mutate()` benachrichtigt die Ansichten,
aber schreibt weder lokale Speicherung noch `RemoteStore.write`. RPC-, Auth-, Push-, Erinnerungs-,
Lesemarken- und Kalenderaufrufe sind in der Datenschicht abgesichert; asynchrone Client-Ketten behalten
zusätzlich ihre Übungs-Generation. Reale Hintergrundaktualisierungen können die Kopie nicht ersetzen.
`endPractice()` verwirft sie und zeigt das aktuelle echte Dokument. Ende, Überspringen, Navigation,
Neuladen und Fehler beenden die Übung. Kein Übungsdatensatz erreicht andere Nutzer oder erzeugt Push.

`usePracticeReset` räumt offene Editor-/Bestätigungsdialoge und Eingaben auf. Ziele dürfen Funktionen
sein, damit neue Einheiten, Gruppen, Nachrichten und nachfolgende Dialoge erreichbar bleiben. Im
Übungsmodus bleiben Rechte und Load-Schalter der Mitgliedschaften maßgeblich.

Fortschritt wird erst nach dem Verwerfen gespeichert, im Browser getrennt je Konto und auf dem
Server weiter in `tours_seen`. Dafür gibt es keine Migration. `test:practice` prüft Isolation,
Verwerfen, Fehler, Speichergrenzen, Hintergrundupdates und Server-Spione; die CI führt es mit i18n aus.
`test:tours` führt echte Taps, Touch-Wischen, Drag/Resize, Editor-Eingaben, Gruppen, Nachrichten,
Absagen, Bewertungen und Umfragen aus (Handy 390 px/fr und Desktop 1280 px/en), prüft Ergebnissätze
und vergleicht das gespeicherte Dokument vor/nach Übung, Abbruch und Neuladen. Die Browserprüfung
steht wegen der Socket-Sperre dieser Arbeitsumgebung noch aus; auch 360–430 px und Dialog-/Tastatur-
Übergänge gehören zur visuellen Abnahme. `scripts/smoke.mjs` bleibt unverändert.

## 7. Regel für neue Funktionen (ab jetzt)

Jeder Plan für eine neue Funktion bekommt einen Abschnitt **„Onboarding“**:

- **Wer** sieht sie (Rollen, Rechte, Team-Funktionen)?
- **Wo** wird sie gezeigt: Schritt in einer Seiten-Tour, Moment-Tipp oder Leerzustand?
- **Geste**, **ein Satz** und das **Ergebnis** (was die Geste bewirkt, `tour.<key>.result`) je Schritt
  (en, de, fr, es).
- **„Neu“-Hinweis** für bestehende Nutzer?
- Eintrag in der Abdeckungs-Tabelle oben.

Eine Funktion ist erst fertig, wenn ihr Onboarding gebaut und geprüft ist (steht auch in
`AGENTS.md`). Bis der Baukasten steht, wird das Onboarding im Plan festgehalten und beim Bau des
Baukastens nachgezogen.

## 8. Reihenfolge zum Bauen (nach „Go“)

1. **Baukasten:** Tour-Komponente, Gesten-Animation, Fortschritt (lokal + Server), „?“-Knopf,
   Einstellungen „Einführungen“; erste Tour: Spieler „Heute“.
2. **Spieler:** Kalender, Nachrichten, Belastung, Willkommen.
3. **Trainer:** Kalender (Gesten), Heute, Einheit-Blatt (Kader, Anwesenheit), Team, Nachrichten,
   Verlauf, Hallen.
4. **Abteilungsleitung und Admin:** Verein, Hallen, Hallenkalender, Einrichtungs-Liste.
5. **Moment-Tipps, Leerzustände, „Neu“-Hinweise**; Hinweis-Karten entfernen.

Jede Stufe ist ein eigener PR mit Bildern (Handy und Desktop).

## 9. Ursprüngliche Fragen an Ben (Run 69)

Fragen 1–4 und 6 sind inzwischen entschieden und umgesetzt: Übungskopie, Konto-Fortschritt,
drei Willkommens-Karten, Touren statt alter Hinweis-Karten und Wischen in beiden Kalendern.
Frage 5 bleibt außerhalb dieses Auftrags; bestehende Funktionalität und Dauertexte bleiben erhalten.
Die damaligen Fragen sind hier als Historie festgehalten.

1. **Üben ohne Speichern** (Übungs-Einheit, Empfehlung) oder echte Aktionen mit „Rückgängig“?
2. **Fortschritt pro Konto** (einmal auf allen Geräten, Empfehlung) oder pro Gerät?
3. **Willkommens-Karten** nach dem Beitritt ja (Empfehlung: ja, höchstens 4) oder gleich in die
   Seiten-Touren?
4. **Hinweis-Karten** durch die Touren ersetzen (Empfehlung: ja)?
5. **Entschlacken (#9)** mitnehmen: erklärende Dauertexte entfernen, sobald eine Tour sie erklärt
   (z. B. „Du bist dabei · tippe hier …“)?
6. **Wischen im Spieler-Kalender:** Trainer wischen in der Tagesansicht zwischen Tagen, Spieler noch
   nicht. Beim Bau angleichen (Empfehlung: ja), damit beide Touren dasselbe zeigen?
