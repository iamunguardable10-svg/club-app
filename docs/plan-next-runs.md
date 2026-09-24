# Plan: die nächsten Stücke bis zum Pilotbetrieb

Stand 2026-09-24, nach Run 11f (Stück 4, RPE-Abfrage). Auf Wunsch des
Auftraggebers geht es Stück für Stück: Jedes Stück wird einzeln gebaut, geprüft,
committet und kurz berichtet, bevor das nächste beginnt. Entscheidungen, die ein Stück
braucht, stehen jeweils dabei und werden vorher geklärt.

## Bestandsaufnahme: was fehlt gegenüber dem Stand vor dem Löschen

Verglichen mit `543775f` (vor Run 5):

| Bereich | Stand |
|---|---|
| Trainer: Heute, Kalender, Teams, Hallen, Verlauf, Serien, Gruppen, Anwesenheit, Belastung | vollständig da, dazu neu: Rollen mit Rechten, Hallenverwaltung |
| Spieler: Heute, Kalender, Belastung, Verfügbarkeit, eigene Pläne, Teilen-Link | vollständig da |
| Anmeldung, Registrierung, Einladung, Beitrittscode | neu gebaut (Run 10), dazu Passwort vergessen (11a) |
| Vereins- und Abteilungsverwaltung (`/admin`, `/department`) | bewusst weggelassen, Teamebene zuerst. **Fehlt für den echten Betrieb** → Stück 8 |
| Vereinsgründung (`/onboarding`) | ersetzt durch `app.setup_club` per SQL → Stück 8 |
| Hallenanträge Abteilung → Admin | weggelassen, hängt an Stück 8 |

Auch der alte Stand konnte keine Spieler entfernen und hatte keine automatische
RPE-Abfrage, keine Benachrichtigungen und keine Installation als App.

## Reihenfolge

| # | Stück | Warum an dieser Stelle | Größe |
|---|---|---|---|
| 1 | Startseite neu (erledigt, Run 11b) | erster Eindruck für echte Nutzer | klein |
| 2 | UI-Fehler und Layout (erledigt, Run 11c) | echte Fehler und Handy-Probleme aus der Durchsicht | mittel |
| 3 | Spieler aus dem Team entfernen (erledigt, Run 11d) | Sicherheitslücke im Ablauf (falscher Beitritt) | klein |
| 3.5 | Belastung (Load) je Team an/aus, vorbereitet für Abos (erledigt, Run 11e) | nicht jedes Team braucht Load; Stück 4 muss es schon beachten | mittel |
| 4 | Automatische RPE-Abfrage (erledigt, Run 11f) | Kernfunktion für die Belastungssteuerung | mittel |
| 5 | Veröffentlichen (Vercel) (Grundlagen erledigt 2026-09-24, Livegang nach 8) | Voraussetzung für Handy-Tests, App-Installation und Push | klein, braucht dich |
| 8 | Vereinsverwaltung und Onboarding (vorgezogen; 8a erledigt, Run 12a) | ohne Onboarding kann kein echter Verein starten | groß, in Teilen |
| 6 | Als App installierbar (PWA) | Voraussetzung für Push auf dem iPhone | klein |
| 7 | Benachrichtigungen (Push) | braucht 5 und 6 | groß |

Stück 8 wurde am 2026-09-24 vor 6 und 7 gezogen: Verein, Abteilungen und Teams sollen
in der App entstehen, nicht per SQL.

## Die Stücke im Einzelnen

### 1 Startseite neu

- Für echte Nutzer: Willkommen, „Sign in“ als Hauptweg, „Create account“ für Neue
  (führt zum Beitreten), darunter klein und klar getrennt „Try the demo club“.
- Angemeldet: Vereinsname, „Continue as …“, eigene Rollen, Abmelden.
- Fertig, wenn: Screenshots Handy und Desktop in beiden Zuständen passen, keine
  Laufzeitfehler, lokaler Modus unverändert erreichbar.

### 2 UI-Fehler und Layout

Aus der Durchsicht vom 2026-09-24:

- **Fehler:** Spielerliste zeigt die Gruppen-ID (`group-u16-rehab`) statt des Namens.
- Teamansicht: Plaketten „12“ und „OK“ ohne Bedeutung, „SECONDARY“ als Überschrift,
  „Back to Today“ ersetzen durch klare Beschriftung.
- Doppelte Überschriften (z. B. „COACH OS Today“ über „TODAY Sessions and availability“).
- Handy-Kalender: Tagesansicht voreinstellen statt 7 gequetschter Spalten.
- Spieler-Start: abgeschnittene Kennzahlen („1231…“, „about 2.4 s…“).
- Grammatik: „1 attendance flags“ usw.
- Fertig, wenn: Screenshot-Vergleich vorher/nachher je Seite, alle Routen ohne Fehler.

### 3 Spieler aus dem Team entfernen

- Recht: wer das Trainerteam verwalten darf (entschieden).
- Datenbank: Löschregel für Spieler-Mitgliedschaften mit `manageStaff`; beim Verlassen
  auch aus den Gruppen des Teams. Person, Meldungen und Belastung bleiben erhalten.
- Oberfläche: im Spielerdetail „Remove from team“ mit Rückfrage.
- Fertig, wenn: Zugriffsprüfungen (Team Manager darf nicht, Head Coach darf),
  Ende-zu-Ende-Test, Browser-Check.

### 3.5 Belastung je Team an/aus (vorbereitet für Abos)

Wunsch vom 2026-09-24: Nicht alle Teams haben oder brauchen Load, je nach künftigem Abo.

- **Entschieden (2026-09-24):** Schalten nur per Datenbank, neue Teams mit Load,
  bestehende behalten Load.
- **Modell:** Funktionen je Team als Schalter (`teams.features`, zuerst nur `load`), nicht
  als Abo-Namen. Ein späteres Abo (Stück 8 oder später) setzt nur diese Schalter; welche
  Abos es gibt, muss dafür jetzt noch nicht feststehen.
- **Team ohne Load, Trainerseite:** keine Ampel, kein ACWR, keine RPE-/Load-Spalten in
  History und Einheitsdetails, Spielerdetail nur Anwesenheit; die Load-Rechte
  (`viewLoadSummary`, `viewLoadDetails`) erscheinen in den Rollen ausgegraut mit Hinweis.
- **Team ohne Load, Spielerseite:** kein Load-Tab, keine Kennzahlen, keine RPE-Eingabe
  für Einheiten dieses Teams; Today zeigt nächste Einheit und An-/Abmeldung.
- **Spieler in zwei Teams:** Load gibt es, wenn mindestens eines seiner Teams Load hat;
  RPE wird nur für Einheiten von Teams mit Load gefragt (gilt dann auch für Stück 4).
- **Server (echte Sperre, nicht nur ausgeblendet):** `app.team_permissions` gibt ohne
  Load keine Load-Rechte mehr zurück; Belastungseinträge nur für Personen, die in einem
  Team mit Load spielen.
- **Daten beim Abschalten:** bleiben erhalten, nur unsichtbar; beim Einschalten ist alles
  wieder da.
- Fertig, wenn: Zugriffsprüfungen (Team ohne Load: Trainer sieht keine Belastung,
  Spieler kann keine eintragen), Ende-zu-Ende-Test, Browser-Check beider Rollen.

### 4 Automatische RPE-Abfrage

- Öffnet ein Spieler die App und gibt es eine Team-Einheit, die vorbei ist, für die er
  nicht abgesagt hat, keinen Eintrag hat und die er nicht weggeklickt hat, öffnet sich
  sofort die Abfrage „How hard was it?“ (RPE und Dauer, vorbelegt aus der Einheit).
- Auswahl: eintragen / „I didn't take part“ / „Later“. Mehrere offene Einheiten
  nacheinander, älteste zuerst.
- **Entschieden (2026-09-24):** Gefragt wird ohne Zeitgrenze nach jeder vergangenen,
  angesetzten Team-Einheit ohne Eintrag (ab dem Beitritt ins Team). „I didn't take
  part“ erscheint beim Trainer als „nicht teilgenommen“ (eigener Status, nicht als
  vorherige Absage).

### 5 Veröffentlichen

- Vercel-Projekt mit `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Supabase: Site URL und Redirect-URLs auf die Vercel-Adresse; E-Mail-Bestätigung aus
  oder eigenes SMTP (sonst hängen Registrierungen).
- Verein einrichten mit `app.setup_club` und deinen Angaben.
- **Stand 2026-09-24:** Das Vercel-Projekt `club-app` ist mit dem Repo verbunden; jeder
  Push auf den Arbeitszweig baut eine Vorschau (hinter Vercel-Login), `main` baut die
  öffentliche Adresse `club-app-five-rho.vercel.app`. Die Variablen
  `NEXT_PUBLIC_SUPABASE_URL` (auf `tszxeainmwowmixqmphn`) und
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sind gesetzt (vorher hieß der Schlüssel
  `…_ANON_KEY`, den die App nicht liest, deshalb lief bisher nur die Demo).
- Offen für den Livegang: Arbeitszweig nach `main` übernehmen (Pull Request, du gibst
  frei); Supabase Site URL und Redirect-URLs auf die öffentliche Adresse; E-Mail-
  Bestätigung aus oder eigenes SMTP. Vereinsdaten entfallen: das macht das Onboarding.

### 6 Als App installierbar

- Manifest (Name, Farben, Startseite, Hochformat), Icons in allen Größen, Apple-Tags,
  ein kleiner Service Worker (keine Offline-Daten, nur was Installation und Push
  brauchen).
- Hinweis in der App, wie man sie zum Homebildschirm hinzufügt (iPhone: Teilen → „Zum
  Home-Bildschirm“; Android/Samsung: Menü → „App installieren“).
- **Entscheidung nötig:** App-Name auf dem Homebildschirm (Vorschlag: „Club OS“ oder
  Vereinsname) und ob du ein Logo hast.

### 7 Benachrichtigungen

- Technik: Web Push mit VAPID-Schlüsseln. Geht auf Android/Samsung im Browser und
  installiert; auf dem iPhone nur, wenn die App auf dem Homebildschirm liegt (ab iOS
  16.4) und nach ausdrücklicher Erlaubnis durch Tippen.
- Datenbank: Tabelle für Push-Abos je Gerät, nur eigene lesbar.
- Absender: Supabase Edge Function mit dem geheimen VAPID-Schlüssel (liegt nur bei
  Supabase, nie in der App); ausgelöst durch Datenbankänderungen und einen
  Zeitplan (für die RPE-Erinnerung).
- Vorschlag für Anlässe:
  - Spieler: neue, verschobene oder abgesagte Einheit (nächste 7 Tage); Erinnerung an
    die RPE-Abfrage 30 Minuten nach Ende einer Einheit.
  - Trainer: Absage oder Verspätung für eine kommende Einheit (Grund nur mit Recht).
- In „Your account“: Benachrichtigungen an/aus je Art.
- **Entscheidung nötig:** Welche Anlässe genau, Ruhezeiten (Vorschlag: 21–7 Uhr keine
  Pushs), Erinnerungszeitpunkt.

### 8 Vereinsverwaltung und Onboarding

**Entschieden (2026-09-24):**
- **Verein anlegen nur mit Gründungs-Code:** Der Plattformbetreiber (du) erzeugt einen
  einmaligen Code; wer ihn hat, legt nach der Registrierung den Verein an und wird
  Vereinsadmin. Später lässt sich der Code an ein Abo koppeln.
- **Vereinsadmin + Abteilungsleitung:** Der Vereinsadmin legt Abteilungen an und lädt je
  Abteilung eine Leitung ein; die Abteilungsleitung legt ihre Teams an und lädt die
  Head Coaches ein (der Vereinsadmin darf das auch).
- **Doppelrollen erlaubt:** Vereinsadmin und Abteilungsleitung können zugleich Trainer
  oder Spieler sein; gewechselt wird wie heute über das Konto-Menü.

In drei Teilen, jeder einzeln gebaut, geprüft, committet:

**8a — Datenbank und Datenschicht**
- Neue Tabelle `club_roles` (Person, Verein, Rolle `admin` oder `department_lead`, bei
  Abteilungsleitung die Abteilung). Eine Person kann zusätzlich Trainer oder Spieler
  sein.
- Gründungs-Codes (`founding_codes`, einmalig): erzeugt nur der Betreiber per SQL
  (`app.create_founding_code()`); die App löst sie über `found_club(...)` ein. Das legt
  Verein, erste Abteilung, erstes Team (mit den vier Rollenvorlagen) und den Gründer als
  Vereinsadmin an, auf Wunsch zugleich als Head Coach des ersten Teams.
- Rechte: Vereinsadmin verwaltet Abteilungen, Teams, Hallen und alle Einladungen im
  Verein; Abteilungsleitung Teams und Einladungen ihrer Abteilung. Für ihre Teams
  bekommen sie die **Verwaltungsrechte** (Trainerteam, Hallen, Einheiten, Serien,
  Gruppen), aber **keine Spielerdaten** (Kader, Anwesenheit, Gründe, Belastung, Pläne),
  außer sie haben im Team selbst eine Trainerrolle. (Vorschlag, siehe Frage unten.)
- Einladungen für Abteilungsleitungen (wie die für Staff: per Link, einmalig).
- Teams archivieren statt löschen (Daten bleiben, Team verschwindet aus den Listen).
- Tests: Zugriffsprüfungen (wer darf was, Codes nur einmal, fremder Verein tabu),
  Ende-zu-Ende über die Datenschicht.

**8b — Onboarding**
- Startseite, angemeldet ohne Verein: „Join with a code“ (Spieler) und „Found a club“
  (Gründungs-Code). Gründen: Code → Vereinsname und Ort → erste Abteilung → erstes Team
  → „Coach this team yourself?“ → fertig im Vereinsbereich.
- Demo-Modus: ein Vereinsadmin und eine Abteilungsleitung im Demo-Verein, dritter
  Einstieg „As club admin“.

**8c — Vereinsbereich**
- Neue Rolle im Konto-Menü „Club admin“ bzw. „Department lead“, eigener Bereich
  `/club` im gemeinsamen Rahmen: Übersicht (Abteilungen, Teams, Personen, offene
  Einladungen), Abteilungen anlegen/umbenennen und Leitung einladen, Teams
  anlegen/umbenennen/archivieren und Head Coach einladen, Hallen vereinsweit (die
  bestehende Hallenverwaltung).
- Load je Team bleibt per Datenbank geschaltet (Abo), nicht im Vereinsbereich.

## Was außerhalb des Codes offen ist

- Supabase: E-Mail-Bestätigung / SMTP, Site URL und Redirect-URLs.
- Vercel-Projekt und Adresse.
- Gründungs-Code für den eigenen Verein (kommt mit Stück 8).
