Zurückgestellt (2026-10-08): Onboarding und Tipps sind komplett entfernt und werden später neu aufgesetzt; dieses Konzept ist nur noch Ideensammlung.

# Onboarding-Konzept v4: so wie in iOS-Apps (Entwurf 2026-10-07, wartet auf Go von Ben)

Ersetzt die Abdunkel-Touren und den Übungsmodus (Run 70–72, entfernt in Run 73).
Vorbild: Apples eigene Apps und TipKit, dazu Things, Notion, Strava.

## 1. Grundsätze

1. **Die App erklärt sich im Moment, nicht vorab.** Kein Rundgang am Anfang, keine Schrittzähler,
   nichts wird abgedunkelt, nichts blockiert. Die Seite bleibt immer bedienbar.
2. **Echte Daten statt Übung.** Wer eine Einheit anlegt, legt eine echte an. Löschen und Rückgängig
   gibt es ja.
3. **Höchstens ein Tipp gleichzeitig**, höchstens einer pro Seitenbesuch, nie über einem offenen Blatt.
4. **Ein Tipp verschwindet für immer**, sobald man ✕ tippt oder das Gezeigte selbst gemacht hat.
5. **Kurz.** Titel mit höchstens 4 Wörtern, ein Satz mit höchstens 12 Wörtern, ein Symbol.
6. **Leere Seiten sind die beste Anleitung.** Jede leere Liste sagt, was hier hinkommt, und hat
   genau einen Knopf dafür.
7. Gemerkt wird pro Konto (wie bisher `tours_seen`). In den Einstellungen gibt es
   „Tipps wieder zeigen“.

## 2. Bausteine

| | Baustein | Vorbild | Wann |
|---|---|---|---|
| A | **Willkommen-Blatt** | Apples „Willkommen bei …“ / „Neu in …“ | einmal nach dem ersten Anmelden |
| B | **Tipp-Blase** (Popover mit Pfeil am Knopf) | TipKit-Popover | beim ersten Besuch einer Seite oder Funktion |
| C | **Tipp-Karte im Inhalt** (grau, mit ✕) | TipKit-Inline-Tipp | wenn eine Funktion keinen eindeutigen Knopf hat (z. B. Wischen) |
| D | **Leere Zustände** | Notizen, Erinnerungen | immer, solange die Liste leer ist |
| E | **Einrichtungs-Liste** | „Erste Schritte“ in Notion / Stripe | Trainer und Verein, auf „Heute“, bis alles erledigt ist |
| F | **„Neu“-Blatt nach Updates** | „Neu in iOS“ | einmal nach einem Update mit neuen Funktionen (max. 3 Zeilen) |

### A Willkommen-Blatt (ein Bildschirm, kein Wischen)

```
          [App-Symbol]
   Willkommen bei Club OS, Martin
   Trainer · U16 Boys · SV Ruhrtal

   📅  Plane Einheiten mit einem Tipp
       Tippe in den Kalender, zieh sie zurecht.
   ✅  Sieh sofort, wer kommt
       Zu- und Absagen kommen live an.
   💬  Erreiche dein Team
       Nachrichten an Team oder Gruppen.

   [ Benachrichtigungen erlauben ]   (nur wenn noch nicht gefragt)
   [          Weiter            ]
```

Drei Zeilen je Rolle:
- **Spieler:** „Deine Termine an einem Ort“ · „Sag mit einem Tipp ab“ · „Sag, wie hart es war“
  (nur wenn das Team Belastung nutzt, sonst „Nachrichten vom Trainer“).
- **Trainer:** wie oben.
- **Abteilungsleitung:** „Alle Teams deiner Abteilung“ · „Hallen fair verteilen“ · „News an alle“.
- **Vereinsadmin:** „Abteilungen und Teams anlegen“ · „Trainer einladen“ · „Hallen verwalten“.
- Wer mehrere Rollen hat, sieht darunter eine graue Zeile: „Rolle wechseln: tippe oben rechts auf
  deinen Namen.“

Symbole als SVG im Stil der App, keine Emojis (die stehen hier nur zur Skizze).

### B Tipp-Blase: Aussehen und Verhalten

```
        ┌──────────────────────────────┐
        │ ✨ Einheit planen          ✕ │
        │ Tippe auf eine freie Zeit.   │
        └──────────────▼───────────────┘
                   [ Bearbeiten ]
```

- Erscheint 0,6 s nach dem Laden der Seite mit kurzem Einblenden (Deckkraft + 4 px).
- Kein Hintergrund-Abdunkeln. Ein Tippen außerhalb schließt sie nicht (nur ✕ oder die Aktion).
- Geht man von der Seite weg, ohne ✕ zu tippen, erscheint sie beim nächsten Besuch wieder,
  höchstens 3-mal, dann gilt sie als gesehen.
- Kettentipps: Hat man das Gezeigte getan, darf direkt der nächste Tipp derselben Funktion kommen
  (z. B. nach dem Anlegen: „Zum Verschieben gedrückt halten und ziehen“). Höchstens 3 in einer Kette.
- Handy: Blase über oder unter dem Knopf, je nach Platz; nie unter der Tab-Leiste. Desktop: gleich.

## 3. Tipps pro Seite (genaue Texte)

Schreibweise: **Titel** — Satz. *(Anker · Auslöser · weg wenn)*

### Spieler

**Heute** (`/athlete/home`)
1. **Absagen geht schnell** — Tippe auf deine nächste Einheit und sag ab. *(athlete-next · erster
   Besuch mit kommender Einheit · Blatt geöffnet)*
2. **Länger weg?** — Trag Urlaub oder Verletzung einmal ein. *(athlete-away · 2. Besuch · Blatt geöffnet)*

**Kalender** (`/athlete/calendar`)
1. Tipp-Karte (C): **Wischen für andere Tage** — Wisch nach links oder rechts. *(oben in der Liste ·
   erster Besuch auf dem Handy · einmal gewischt)*
2. **Eigenes Training** — Trag hier dein Krafttraining ein. *(athlete-add-own · 2. Besuch)*

**Belastung** (`/athlete/load`, nur mit Belastung)
1. **Deine Belastung** — Grün heißt passend, rot heißt zu viel auf einmal. *(load-metrics · erster Besuch)*

**Nachrichten** (`/athlete/messages`)
1. **Nach Absender filtern** — Tippe auf Team, Abteilung oder Verein. *(messages-chips · erster Besuch
   mit Nachrichten aus 2+ Quellen)*

**Moment-Tipps** (wann immer es passiert, einmal)
- Erste Abfrage nach einer Einheit: **Wie hart war es?** — Zwei Tipps, dann ist es erledigt.
  *(rate-scale)*
- Erste Umfrage: **Abstimmen** — Tippe auf eine Antwort, ändern geht jederzeit. *(messages-poll)*


**Spiel-Blatt: Fahrgemeinschaften** (Run 74, nur geplant; keine Tipps gebaut)
- Tipp: **Rides · Offer seats or ask for one.** *(data-tour="carpools" · erstes zukünftiges
  Auswärtsspiel eines Teammitglieds · weg nach Angebot, Anfrage oder Mitfahren; nie über einem
  offenen Blatt, daher künftig als Inline-Tipp in der Sektion)*
  EN: “Rides · Offer seats or ask for one.” · DE: „Fahrgemeinschaften · Biete Plätze an oder frag nach einem.“ ·
  FR: « Trajets · Propose des places ou demande une place. » · ES: « Viajes · Ofrece plazas o pide una. »
- Leerzustand: EN “No rides yet. Offer seats for your team.” · DE „Noch keine Fahrgemeinschaften. Biete deinem Team Plätze an.“ ·
  FR « Aucun trajet. Propose des places à ton équipe. » · ES « Aún no hay viajes. Ofrece plazas a tu equipo. »
  *(carpools · keine Angebote/Anfragen · Knopf Angebot machen; nur geplant)*

### Trainer

**Heute** (`/coach/today`)
- Einrichtungs-Liste (E), siehe Abschnitt 5. Danach:
1. **Wer kommt?** — Tippe auf eine Einheit für Zusagen und Kader. *(coach-session oder
   coach-upcoming · erster Besuch)*

**Kalender** (`/coach/sessions`)
1. **Einheit planen** — Tippe auf „Bearbeiten“, dann auf eine freie Zeit. *(calendar-plan ·
   erster Besuch · Bearbeiten an)*
2. **Freie Zeit antippen** — Hier entsteht deine Einheit. *(calendar-slot · direkt nach 1 ·
   Entwurf da)*
3. **Verschieben und Länge** — Ziehen verschiebt, der untere Rand ändert die Dauer.
   *(neue Einheit · nach dem Speichern · einmal gezogen)*
4. Tipp-Karte (C) auf dem Handy: **Andere Tage** — Wisch nach links oder rechts.
   Desktop stattdessen: **Woche wechseln** — Pfeile oben, „Heute“ springt zurück. *(calendar-weeknav)*
5. **Jede Woche gleich?** — Leg das Training einmal als Serie an. *(series-add · 3. Besuch)*

**Team** (`/coach/team`)
1. **Spieler einladen** — Teil den Link oder QR-Code mit deinem Team. *(team-setup · solange
   weniger als 3 Spieler)*
2. **Gruppen** — Teile dein Team, z. B. „Starting Five“ oder „Torhüter“. *(Tab Gruppen · erster
   Besuch mit 5+ Spielern)*
3. Nach der ersten Gruppe: **Gruppen nutzen** — Einheiten und Nachrichten können nur an sie gehen.

**Nachrichten** (`/messages` bzw. Team-Tab)
1. **An wen?** — Wähl das Team oder nur eine Gruppe. *(compose-to · erster Besuch)*
2. **Wichtig anpinnen** — Wichtige Nachrichten bleiben oben. *(compose-important · beim ersten
   Schreiben)*
3. **Umfrage** — Frag ab, z. B. Trikotgröße oder Fahrgemeinschaft. *(compose-poll · 2. Nachricht)*
4. Nach dem ersten Senden: **Wer hat gelesen?** — Tippe auf „Gelesen 3/12“. *(message-stats)*

**Hallen** (`/coach/facilities`)
1. **Hallenzeiten** — Sieh, wann deine Halle frei ist. *(halls-open · erster Besuch)*

**Verlauf** (`/coach/history`)
1. **Belastung im Blick** — Rot markiert Spieler mit zu viel auf einmal. *(history-metrics)*

**Moment-Tipps**
- Erste Einheit in der Vergangenheit: **Anwesenheit** — Hak ab, wer da war. *(attendance-panel)*
- Erstes Spiel: **Kader** — Wähl aus, wer dabei ist, und veröffentliche. *(squad-panel)*
- Erste offene Prüfung: **Eintrag prüfen** — Ein Spieler bittet um deinen Blick. *(athlete-check)*


**Spiel-Blatt für Trainer: Fahrgemeinschaften** (Run 74, nur geplant; keine Tipps gebaut)
- Tipp: **Rides · Offer seats or ask for one.** *(data-tour="carpools" · erstes zukünftiges
  Auswärtsspiel eines Teammitglieds · weg nach Angebot, Anfrage oder Mitfahren; nie über einem
  offenen Blatt, daher künftig als Inline-Tipp in der Sektion)*
  EN: “Rides · Offer seats or ask for one.” · DE: „Fahrgemeinschaften · Biete Plätze an oder frag nach einem.“ ·
  FR: « Trajets · Propose des places ou demande une place. » · ES: « Viajes · Ofrece plazas o pide una. »
- Leerzustand: EN “No rides yet. Offer seats for your team.” · DE „Noch keine Fahrgemeinschaften. Biete deinem Team Plätze an.“ ·
  FR « Aucun trajet. Propose des places à ton équipe. » · ES « Aún no hay viajes. Ofrece plazas a tu equipo. »
  *(carpools · keine Angebote/Anfragen · Knopf Angebot machen; nur geplant)*

### Abteilungsleitung und Vereinsadmin

**Verein** (`/club`)
1. **Team anlegen** — Gib einen Namen ein, dann lädst du den Trainer ein. *(club-add-team ·
   solange 0 Teams)*
2. Nach dem ersten Team: **Trainer einladen** — Schick dem Trainer seinen Link. *(club-team)*
3. **Wer darf schreiben?** — Leg fest, wer News an alle schickt. *(club-writers · 2. Besuch)*
4. Nur Admin: **Abteilungen** — Für jede Sportart eine. *(club-new-department · solange 1 Abteilung)*

**Hallen** (`/club/halls`)
1. **Halle anlegen** — Name und Adresse genügen. *(halls-add · solange 0 Hallen)*
2. **Belegung** — Tippe auf eine Halle für ihren Wochenplan. *(halls-open · nach der ersten Halle)*

## 4. Leere Zustände (D)

| Seite | Text | Knopf |
|---|---|---|
| Trainer Kalender, keine Einheiten | „Noch keine Einheiten. Plane die erste.“ | Einheit planen |
| Trainer Team, keine Spieler | „Noch keine Spieler. Lade dein Team ein.“ | Einladen |
| Gruppen leer | „Teile dein Team in Gruppen, z. B. nach Position.“ | Gruppe anlegen |
| Nachrichten leer (Trainer) | „Noch keine Nachrichten. Schreib deinem Team.“ | Schreiben |
| Nachrichten leer (Spieler) | „Hier landen Nachrichten von Trainer und Verein.“ | — |
| Spieler Heute, keine Einheit | „Nichts geplant. Dein Trainer trägt Einheiten ein.“ | Kalender |
| Belastung, noch keine Werte | „Nach deiner ersten Einheit siehst du hier deine Belastung.“ | — |
| Verlauf leer | „Sobald Spieler Einheiten bewerten, siehst du hier den Verlauf.“ | — |
| Verein, keine Teams | „Leg dein erstes Team an.“ | Team anlegen |
| Hallen leer | „Noch keine Hallen. Leg die erste an.“ | Halle anlegen |
| Spiel-Blatt, Spieler/Trainer, keine Fahrten | Texte für Rides in Abschnitt 3 (EN/DE/FR/ES), nur geplant | Angebot machen |

## 5. Einrichtungs-Liste (E)

Karte oben auf „Heute“, mit Fortschrittsring, Haken erscheinen automatisch, jede Zeile führt
direkt hin. Sie verschwindet nach dem letzten Haken mit einem kurzen „Alles bereit ✓“ und lässt sich
vorher über „…“ ausblenden.

- **Trainer:** Team benennen · 3 Spieler einladen · erste Einheit planen · erste Nachricht senden.
- **Vereinsadmin:** Abteilung anlegen · erstes Team anlegen · Trainer einladen · erste Halle anlegen.
- **Abteilungsleitung:** erstes Team anlegen · Trainer einladen · Hallen prüfen.
- **Spieler:** keine Liste (zu wenig zu tun). Stattdessen nur „Benachrichtigungen an“, falls aus.

## 6. Technik (kurz)

- Ein Baustein `Tip` (Blase oder Inline-Karte) plus eine kleine Regelstelle `useTip(id, { anchor,
  when, doneWhen })`. Sie fragt `isTourSeen`/`markTourSeen` (pro Konto) und erlaubt global nur
  einen sichtbaren Tipp.
- Die Anker sind die vorhandenen `data-tour`-Attribute.
- Keine Overlays, keine Übungskopie, keine Sonderwege im Datenteil.
- Texte in allen vier Sprachen. Test: ein kleines Playwright-Skript prüft pro Rolle, dass der erste
  Tipp erscheint, ✕ ihn dauerhaft schließt und die Seite darunter bedienbar bleibt.

## 7. Regel für neue Funktionen (bleibt)

Jede neue Funktion plant mit, wie man sie entdeckt: Leerzustand, höchstens ein Tipp mit Text in vier
Sprachen, bei Bedarf eine Zeile im „Neu“-Blatt (F). Steht in `AGENTS.md` (Schritt 6) und `CLAUDE.md`.

## 8. Offene Fragen an Ben

1. Willkommen: ein Bildschirm wie oben ok, oder lieber 2–3 Seiten zum Wischen?
2. Einrichtungs-Liste auch für Spieler (z. B. Profilbild, Benachrichtigungen, erste Zusage)?
3. „Neu“-Blatt nach Updates gewünscht?

## 9. Abdeckung neuer Funktionen

| Funktion | Wer / Ort | Entdecken / Geste | Anker | Stand |
|---|---|---|---|---|
| Fahrgemeinschaften (Run 74) | Spieler und Trainer eines Teams, Spiel-Blatt; auswärts sichtbar, zuhause aufklappbar | Plätze anbieten, Platz anfragen, beim Angebot mitfahren; Tipp/Leerzustand in §3 in vier Sprachen | `data-tour="carpools"` | Funktion und Anker gebaut; v4-Tipp/Leerzustand nur geplant |

„Neu“-Zeile für bestehende Nutzer, ebenfalls nur geplant:
EN “Rides · Arrange rides for your next game.” · DE „Fahrgemeinschaften · Organisiere Fahrten zu deinem nächsten Spiel.“ ·
FR « Trajets · Organise les trajets pour ton prochain match. » · ES « Viajes · Organiza los viajes para tu próximo partido. »
