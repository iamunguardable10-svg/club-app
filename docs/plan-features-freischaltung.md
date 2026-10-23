# Umsetzungsplan: fehlende Funktionen und Freischaltung

Stand 2026-10-22 (Entscheidungen von Ben eingearbeitet). Grundlage: Hooplayer-Liste vom
2026-10-01 (`docs/plan-next-runs.md`, „Vergleich mit Hooplayer“) und der heutige Stand der App.

## Was es schon gibt und was fehlt

| Hooplayer | Bei uns |
|---|---|
| Teamkalender mit Hallen, Push bei neuen/geänderten Terminen | ✅ (dazu Serien, Apple-Kalender, ICS, offline) |
| Zu-/Absagen mit einem Tipp, Live-Liste für den Trainer, „noch nicht reagiert“ | ✅ (live ohne Neuladen seit Run 84/85) |
| Kaderplanung | ✅ (Kader je Spiel) |
| News/Pinnwand, Umfragen, Fahrgemeinschaften | ✅ |
| Alles in einer App statt WhatsApp/Excel | ✅ |
| Termin-Arten: Besprechung, Turnier | ⚠️ **Besprechung und mehrtägiges Turnier fehlen** |
| Eltern-Zugang für Jugendteams | ⚠️ nur Eltern-Einwilligung per Link → **Familienkonto** (Stück 2) |
| Videoanalyse | ❌ später, eigenes Projekt (Stück 3) |
| Playbook/Taktik-Editor | ✅ Playbook-Reiter mit PDF/Bild und Freigabe (Run 90, 0049); Taktik-Editor später, eigenes Projekt |

## Entscheidungen (Ben, 2026-10-22)

- **Teams entscheiden selbst ist der Standard.** Der Verein kann eine Funktion für alle Teams
  festlegen (an oder aus), muss aber nicht. Im Pilot gibt es meist einzelne Teams statt ganzer
  Abteilungen, deshalb muss alles auch ohne Vereins-Admin-Arbeit sinnvoll laufen.
- **Eltern: Familienkonto statt eigenem Eltern-Bereich** (Stück 2).
- **Playbook und Video** werden später als eigene Projekte geplant (mit dem
  Reverse-Engineer-Skill). Hier stehen nur die Andockpunkte.

## 0 Grundsatz: Freischaltung in drei Ebenen

Jede abschaltbare Funktion hat einen Schlüssel. Wirksam ist sie in einem Team nur, wenn alle
drei Ebenen „an“ sagen:

1. **Freigeschaltet (durch uns, je Verein).** Basisfunktionen sind immer freigeschaltet.
   Bezahlfunktionen (heute: Belastung) brauchen eine Freischaltung
   (`club_entitlements`: Pilot, Paket oder Einzelfreischaltung, mit Ablaufdatum). Nur wir
   setzen das, später die Bezahlung.
2. **Vereins-Einstellung je Funktion (Vereins-Admin):** `Teams entscheiden` (Standard),
   `An für alle` oder `Aus für alle`.
3. **Team-Wahl (Head Coach bzw. wer `manageStaff` hat):** Gilt, wenn der Verein „Teams
   entscheiden“ eingestellt hat.

Der Server rechnet die drei Ebenen in `teams.features` zur **wirksamen** Liste zusammen. Die
Team-Wahl steht getrennt in `teams.feature_choices`. Alles, was heute `teams.features` liest
(Zugriffsregeln, Push, App), bleibt dadurch richtig.

**Wirkung von „aus“:** echte Sperre auf dem Server (zusätzliche einschränkende
Zugriffsregeln), die App blendet die Funktion aus, Push entsteht nicht. Die Daten bleiben
erhalten und sind beim Einschalten wieder da. Ein Wechsel kommt über die Live-Aktualisierung
sofort bei allen an.

### Funktions-Katalog

| Schlüssel | Was | Paket | Standard für neue Teams |
|---|---|---|---|
| `load` | Belastung, RPE, ACWR | Leistung (im Pilot freigeschaltet) | an, außer U8–U11 |
| `carpools` | Fahrgemeinschaften | Basis | an |
| `polls` | Umfragen in Nachrichten | Basis | an |
| `squads` | Kader je Spiel | Basis | an |
| `attendance` | Anwesenheit nach der Einheit bestätigen | Basis | an |
| später `video`, `playbook` | Stück 3 und 4 | Leistung | – |

Immer an und nicht abschaltbar: Kalender, Zu-/Absagen, Team-Nachrichten, Abwesenheiten,
Hallen. Vereins-/Abteilungs-News bleiben vorerst wie sie sind; einen Schalter bekommen sie,
wenn Vereine mit mehreren Abteilungen danach fragen.

Pakete als Arbeitsnamen: **Basis** (kostenlos), **Leistung** (pro Team und Monat, später auch
Video und Playbook). Ein mögliches Vereins-Paket (Hallen und Abteilungen über alle Teams) kommt
erst, wenn ganze Vereine kommen. Pilotvereine haben „Leistung“ bis 2027-06-30 freigeschaltet;
das gilt auch für neu gegründete Vereine, solange wir nur per Gründungs-Code freigeben.

## Stück F: Freischaltungs-Schicht (erledigt, Run 86)

**Server (Migration 0046):**
- `club_entitlements (club_id, feature, source, valid_until)`. Lesen dürfen Mitglieder des
  Vereins, schreiben nur wir. `app.grant_feature(club, feature, until, source)` setzt sie.
- `club_feature_settings (club_id, feature, mode)` mit `mode in ('on','off')`; ohne Zeile gilt
  „Teams entscheiden“. Schreiben darf der Vereins-Admin.
- `teams.feature_choices text[]` (die Team-Wahl) und `teams.features` als wirksame Liste.
  Ein Trigger berechnet `features` neu bei Änderungen an der Team-Wahl, an
  Vereins-Einstellungen oder an Freischaltungen. Ein täglicher Job berücksichtigt abgelaufene
  Freischaltungen.
- Einschränkende Zugriffsregeln: Fahrgemeinschaften, Umfragen (neue Umfrage und Abstimmen),
  Kader und Anwesenheits-Bestätigung nur, wenn die Funktion im Team wirksam ist. Belastung
  ist schon über `features` gesperrt.
- Nachrüsten: Alle bestehenden Teams bekommen alle Basisfunktionen und behalten ihren
  Belastungs-Stand. Alle Vereine bekommen „Leistung“ als Pilot bis 2027-06-30.

**App:**
- Team-Einstellungen (Head Coach): Schalter je Funktion. Hat der Verein festgelegt, steht dort
  „Vom Verein festgelegt“. Fehlt die Freischaltung, steht dort „Nicht freigeschaltet“.
- Verein → Funktionen (Vereins-Admin): je Funktion „Teams entscheiden / An für alle / Aus für
  alle“, mit Hinweis auf Freischaltung und Ablaufdatum.
- Ausgeschaltete Funktionen verschwinden überall: Fahrgemeinschaft in der Einheit, Umfrage im
  Verfassen, Kader, Anwesenheit bestätigen, Belastung wie bisher.
- Im Demo-Verein ist alles freigeschaltet; die Schalter lassen sich ausprobieren.

**Fertig, wenn:** Für jede Ebene gibt es einen SQL-Test (nicht freigeschaltet, vom Verein aus,
im Team aus, Daten bleiben). Der Store-Test zeigt, dass ein Wechsel alles neu lädt. Dazu der
Browser-Check: Der Trainer schaltet Fahrgemeinschaften aus, und beim Spieler verschwindet der
Knopf live. Vorher-/Nachher-Bilder, vier Sprachen.

## Stück 1: Besprechung und mehrtägiges Turnier (Basis, immer an)

**1a Besprechung: erledigt (Run 88, Migration 0048).** Offen: Video-Link für Serien und im ICS. **1b Turnier** folgt.

- Neue Termin-Arten `meeting` (Ort frei oder Online-Link, keine RPE-Abfrage) und `tournament`
  (Start- und Enddatum über mehrere Tage, optional mehrere Spiele darunter).
- Kalender: mehrtägige Balken, eine Zusage für das ganze Turnier, optional je Tag. Kader und
  Fahrgemeinschaften gelten für das Turnier.
- Server: Erweiterung von `session_type`, mehrtägige Zeiträume. ICS und Apple-Kalender liefern
  Ganztags- bzw. Mehrtages-Termine.

## Stück 2: Familienkonto (statt Eltern-Bereich)

- **Idee:** Ein Konto kann mehrere Personen führen. Eltern treten mit dem Team-Code bei und
  wählen „Ich melde mein Kind an“. Das Konto legt dann das Profil des Kindes an und bedient es
  wie ein Spieler: Zu-/Absagen, Abwesenheiten, Nachrichten, Fahrgemeinschaften, Push. Bei
  mehreren Kindern wechselt man oben zwischen ihnen, so wie heute zwischen Rollen.
- **Einwilligung:** Bei unter 16 gibt der Elternteil sie direkt im eigenen Konto. Der
  Extra-Link ist dann nur noch nötig, wenn das Kind selbst ein Konto hat.
- **Übergabe:** „An Kind übergeben“ per Link. Das Kind bekommt ein eigenes Konto, das Profil
  und alle Daten wandern mit, und das Elternkonto verliert den Zugriff.
- **Server:** `people.user_id` ist heute eindeutig (ein Konto = eine Person); das wird auf
  mehrere Personen je Konto umgestellt. Die Rechte-Prüfungen (`is_me`) gelten für alle
  Personen des Kontos. Es gibt keine neue Rolle und keine Sonderrechte.
- **Nicht enthalten:** Kind und Elternteil gleichzeitig auf einem Profil. Das kommt erst, wenn
  Vereine danach fragen.

## Stück 3: Videoanalyse (später, eigenes Projekt)

Andockpunkte, die jetzt schon feststehen:
- Funktions-Schlüssel `video`, Team-Funktion, Paket Leistung.
- Teilen mit dem Team oder einzelnen Spielern, Feedback an Zeitstellen, an einen Termin hängbar.
- Speicher: zuerst Links (YouTube, Vimeo, Hudl), Hochladen erst mit Supabase Pro.

## Stück 4: Playbook (später, eigenes Projekt)

Andockpunkte:
- Funktions-Schlüssel `playbook`, Team-Funktion, Paket Leistung.
- Spielzüge gehören dem Team, Spieler lesen, an einen Termin hängbar („heute üben wir das“).
- Umfang wie eine eigene App (Phasen, Animation, Aufnahme, PDF-Export, Dateiformat); Planung
  mit dem Reverse-Engineer-Skill.

## Stück Z: Bezahlung (nach dem Pilot)

- Erst wenn Pakete und Preise aus den Pilotgesprächen feststehen.
- Ein Bezahl-Webhook (Stripe) ruft `app.grant_feature` auf. Läuft die Zahlung aus, endet
  `valid_until`, und die Funktion geht aus; die Daten bleiben.

## Reihenfolge

1. **F Freischaltung** (erledigt, Run 86)
2. **1 Besprechung (erledigt, Run 88) / Turnier**
3. **2 Familienkonto**
4. Video und Playbook als eigene Projekte
5. **Z Bezahlung**
