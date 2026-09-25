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
- **Stand 2026-09-25 (Run 13):** Next.js auf 15.5.26 (Sicherheitslücken), Pull Request
  #14 nach `main` (freigegeben), Gründungs-Code für den eigenen Verein erzeugt (steht nur
  im Chat, nicht im Repo). Vereinsdaten entfallen: das macht das Onboarding (`/found`).
- **Bei dir im Supabase-Dashboard:** Auth → URL Configuration: Site URL
  `https://club-app-five-rho.vercel.app`, Redirect URLs
  `https://club-app-five-rho.vercel.app/**` (und für Vorschauen
  `https://*-iamunguardable10-7821s-projects.vercel.app/**`, falls gewünscht);
  Auth → Sign In / Providers → Email: „Confirm email“ aus, oder Auth → SMTP mit eigenem
  Mailkonto (der eingebaute Versand ist auf wenige Mails pro Stunde begrenzt).

### 6 Als App installierbar

- Manifest (Name, Farben, Startseite, Hochformat), Icons in allen Größen, Apple-Tags,
  ein kleiner Service Worker (keine Offline-Daten, nur was Installation und Push
  brauchen).
- Hinweis in der App, wie man sie zum Homebildschirm hinzufügt (iPhone: Teilen → „Zum
  Home-Bildschirm“; Android/Samsung: Menü → „App installieren“).
- **Erledigt (Run 14):** Name „Club OS“ (eine App für alle Vereine, der Verein kommt
  mit der Anmeldung), vorläufiges Icon (grünes Schild mit Haken, `public/icons/icon.svg`;
  ein eigenes Logo ersetzt die Dateien in `public/icons/`).

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
- **Entschieden (2026-09-25):** Anlässe wie vorgeschlagen (geändert/abgesagt an die
  betroffenen Spieler, „Are you in?“ ab 24 h vorher, Trainer-Übersicht 2 h vorher,
  „How hard was it?“ direkt nach dem Ende). Ruhezeit 22–7 Uhr, **„How hard was it?“ hat
  Vorrang und kommt auch in der Ruhezeit.** An/aus je Gerät (nicht je Art).
- **Erledigt (Run 15).**

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

**8b — Onboarding (erledigt, Run 12b; Plan 2026-09-24, auf Wunsch „für alle, mit Links, Codes und einer
Auswahl wer man ist“)**

Wer kommt wie rein — jede Person hat genau einen Weg, und ein Link führt immer direkt
dorthin (die Auswahl wird dann übersprungen):

| Wer | Bekommt von | Weg | Was vor dem Konto sichtbar ist |
|---|---|---|---|
| Spieler | Trainer | Team-Link `/join?code=…`, QR-Code in der Halle oder der Code zum Eintippen | Verein und Team |
| Trainer / Staff | Head Coach | persönlicher Einladungslink (einmalig, 30 Tage) | Name, Rolle, Team, Verein |
| Head Coach eines neuen Teams | Abteilungsleitung / Vereinsadmin | persönlicher Einladungslink (8c legt Team + Person an) | Name, Rolle, Team, Verein |
| Abteilungsleitung | Vereinsadmin | persönlicher Einladungslink | Name, Abteilung, Verein |
| Vereinsgründer | Plattformbetreiber (du) | Gründungs-Code, Seite `/found` | ob der Code gültig ist |

- **„Who are you?“** auf der Startseite für Neue (abgemeldet oder angemeldet ohne
  Verein): *Player* · *Coach or staff* · *Department lead* · *Starting a club*.
  - Player: Code eintippen (oder Link öffnen) → Team-Vorschau → Konto → Name → fertig.
  - Coach/Staff und Abteilungsleitung: bekommen immer einen persönlichen Link, weil der
    an Name und Rolle hängt (ein offener Code würde jedem Trainerrechte geben). Die
    Karte erklärt, von wem der Link kommt, und nimmt einen eingefügten Link an.
  - Verein gründen: Gründungs-Code → Prüfung → Konto → Verein, Ort, erste Abteilung,
    erstes Team, „Coach this team yourself?“ → fertig. Ohne Code: Hinweis, wo man einen
    bekommt.
  - „I already have an account → Sign in“ bleibt oben.
- **Teilen:** In *Staff & settings* bekommt der Team-Code einen Link zum Teilen
  (Teilen-Menü des Handys, sonst Kopieren) und einen QR-Code zum Zeigen in der Halle.
  Einladungslinks für Staff ebenso teilbar.
- **Server (Migration 0012):** `join_code_preview(code)` und
  `founding_code_usable(code)` ohne Anmeldung aufrufbar, geben nur Vereins-/Teamnamen
  bzw. gültig ja/nein zurück. `join_team` lehnt archivierte Teams ab und sagt klar,
  wenn das Konto schon zu einem anderen Verein gehört (bisher Datenbankfehler).
- **E-Mail-Bestätigung:** jeder Weg merkt sich sein Ziel (`returnTo`), der Link aus der
  Bestätigungsmail führt zurück in denselben Schritt.
- **Rolle „Club“ im Konto-Menü:** Vereinsadmin und Abteilungsleitung ohne Team gelten
  nicht mehr als „ohne Verein“. Startseite und Konto-Menü bieten „Continue as club
  admin / department lead“ an, Ziel `/club`. In 8b ist `/club` eine Übersicht
  (Abteilungen, Teams, Leitungen, offene Einladungen); Anlegen und Einladen folgt in 8c.
- **Demo:** dritter Einstieg „As club admin“ (Claudia Brandt im Demo-Verein).
- **Bewusst nicht jetzt:** Eltern-Zugänge, ein Konto in mehreren Vereinen, Anfragen
  „Ich möchte Trainer werden“ ohne Link, Login per Magic Link.

**8c — Vereinsbereich (erledigt, Run 12c)**
- Neue Rolle im Konto-Menü „Club admin“ bzw. „Department lead“, eigener Bereich
  `/club` im gemeinsamen Rahmen: Übersicht (Abteilungen, Teams, Personen, offene
  Einladungen), Abteilungen anlegen/umbenennen und Leitung einladen, Teams
  anlegen/umbenennen/archivieren und Head Coach einladen, Hallen vereinsweit (die
  bestehende Hallenverwaltung).
- Load je Team bleibt per Datenbank geschaltet (Abo), nicht im Vereinsbereich.

## Stücke 9–12 (geplant 2026-09-25, nach Prüfung der Mathematik und der Abläufe)

| # | Stück | Inhalt |
|---|---|---|
| 9 | Belastungs-Mathematik (erledigt, Run 16) | EWMA-Startwert, Prognose (Spiele, heute, Kalender vs. Rhythmus, unbewertete Einheiten), „Luft bis zur Grenze“ zentral, nächtliche Ampel auf dem Server |
| 10 | Einträge prüfen lassen (erledigt, Run 17) | Trainer mit Detailrecht markiert einen auffälligen Eintrag „bitte prüfen“, der Spieler bekommt Hinweis + Push und korrigiert selbst. **Keine Soll-Intensität je Einheit** (entschieden 2026-09-25: RPE ist bewusst individuell; der Trainer sieht je Einheit die Werte je Spieler und im Schnitt und beurteilt selbst) |
| 11 | Anwesenheit bestätigen (erledigt, Run 17) | Trainer hält fest, wer wirklich da war (bei allen Spielern mit App: Korrektur, wenn jemand „in“ sagte und nicht kam) |
| 12 | Einstellungen für alle (erledigt, Run 18; erweitert am 2026-09-25 von „Vereinseinstellungen“ auf alle Rollen) | Seite `/settings`: Konto (Name, E-Mail, Passwort, Abmelden auch überall), Benachrichtigungen (Arten einzeln aus, „How hard was it?“ immer an; Ruhezeit Von/Bis oder aus), dieses Gerät (Push, App installieren), Spieler: Team verlassen, Trainer: Weg zu den Teameinstellungen, Admin: Verein umbenennen; Abteilung ohne Teams löschen im Vereinsbereich; Admin übergeben = neuen Admin einladen, dann sich selbst entfernen (gab es schon) |

**Entschieden (2026-09-25):** Die Ampel rechnet mit dem **EWMA-Tageswert** (ein Wert für
Trainer und Spieler, Literatur-Standard). Später je Team wählbar, gekoppelt ans Abo: kein
Load / 7 Tage gegen die 4 Wochen davor (Amateure, ruhiger bei 2–3 Einheiten pro Woche) /
EWMA (Profis). Hintergrund und Zahlen in `docs/simplify-progress.md`, Run 16.

## Stücke 13–21 (geplant 2026-09-25, Entscheidungen siehe unten)

Wunsch: zuerst Betrieb (Offline, Fehler sehen), dann die vier Lücken, die heute noch
WhatsApp nötig machen (Infos zur Einheit, Spieltag mit Kader, Abwesenheit über Zeiträume,
Team-Nachrichten). Danach als eigener Block der Kalender in beide Richtungen, mit der
Auswahl, was der Trainer vom privaten Kalender sieht.

### Block A — Betrieb und Alltag

| # | Stück | Inhalt | Größe |
|---|---|---|---|
| 13 | Fehler sehen (erledigt, Run 19) | Eigene Lösung in Supabase, kein Drittanbieter: Fehler aus der App (Absturz, abgelehnte Speicherung, Push-Fehler) landen mit Seite, Rolle, Gerät und Version in einer Tabelle, ohne Gesundheitsdaten und ohne Inhalte; gleiche Fehler werden gezählt statt vervielfacht, Menge je Gerät begrenzt. Die Edge Functions melden ihre Fehler dort auch. Täglich eine Push-Zusammenfassung an die Betreiber-Konten (nur wenn etwas passiert ist). Dazu (Wunsch 2026-09-25) **„Report a problem“** im Menü: freier Text, Push sofort an die Betreiber | klein |
| 14 | Infos zur Einheit und Spieltag (erledigt, Run 20) | Einheit/Serie bekommt **Notiz** (z. B. „Hallenschuhe, Video um 17:30“) und **Treffpunkt/Treffzeit**. Spiele zusätzlich: **Gegner, Heim/Auswärts, Spielort-Adresse** (auswärts ist keine eigene Halle), **Abfahrt**. Spieler sehen es in Heute, Kalender und Detail; Änderung an Zeit, Treffpunkt oder Ort geht mit „Session changed“ raus | mittel |
| 15 | Kader für Spiele (erledigt, Run 22) | Trainer nominiert für ein Spiel: **im Kader / Ersatz / nicht dabei**, aus den Zusagen heraus (Absagen und Verletzte ausgegraut). „Kader veröffentlichen“ → Push an alle Betroffenen („Du bist im Kader“ / „Diesmal nicht dabei“). Nicht Nominierte werden nach dem Spiel nicht nach „How hard was it?“ gefragt. Anwesenheit am Spieltag startet mit dem Kader | mittel |
| 16 | Abwesenheit über Zeiträume (erledigt, Run 21) | Eintragen können **der Spieler und Trainer mit Anwesenheitsrecht für ihn** (ohne Freigabe; der Spieler sieht „eingetragen von …“ und kann kürzen). „Ich bin weg von … bis …“ mit Art **verletzt / krank / Urlaub / Schule-Arbeit / anderes** und optionaler Notiz. Alle Einheiten im Zeitraum zählen als abgesagt (keine „Are you in?“, kein „How hard was it?“), ohne dass der Spieler jede einzeln absagt. Trainer sieht „verletzt bis 12.10.“ in Kader, Heute und Anwesenheit; die Art ist Gesundheitsinfo → wie Absagegründe nur mit `viewAbsenceReasons`, sonst nur „abwesend bis …“. Vorzeitig zurück: Zeitraum kürzen. Einzelne Einheit trotzdem zusagen: geht und gewinnt | mittel |
| 17 | Team-Nachrichten (erledigt, Run 23; gelesen = gesehen, entschieden 2026-09-25) | Nur Ankündigungen, keine Antworten. Trainer (Rollen mit Anwesenheitsrecht oder Einheiten-Planung, also auch Team Manager) schreibt an Team oder Gruppen: Text, optional „wichtig“ (oben angeheftet). Push an alle Empfänger (abschaltbar, außer „wichtig“). **Gelesen, sobald der Spieler die Nachrichten-Seite geöffnet hat** (kein Knopf); Trainer sieht „gelesen 14/18“ und wer fehlt, kann einmal erinnern. Nachrichtenliste im Team; eine Karte auf „Heute“ für ungelesene | mittel |
| 18 | Offline (erledigt, Run 24) | Service Worker speichert App-Oberfläche und Seiten; die App merkt sich den letzten Datenstand auf dem Gerät (je Konto, beim Abmelden gelöscht) und zeigt ihn ohne Netz mit Hinweis „offline · Stand 14:32“. Änderungen ohne Netz (Bewertung, Zu-/Absage, Einträge) warten auf dem Gerät und gehen raus, sobald Netz da ist; was der Server dann ablehnt, meldet die App wie heute | groß |

Reihenfolge: 13 zuerst (hilft ab dem ersten Pilottag), dann 14 → 16 → 15 (braucht 14 und 16) →
17, zuletzt 18, damit Offline alles Neue gleich mit abdeckt. Je Stück: Migration, DB-Tests,
Datenschicht-Tests, Browser Handy/Desktop, Doku, Commit; PR nach jedem Stück oder je zwei.

### Block B — Kalender in beide Richtungen

Technische Grenze: Eine Web-App (auch installiert) darf den iPhone-Kalender nicht direkt
lesen oder schreiben. Entschieden: **jetzt über den Apple-Login (CalDAV)**, später als Ziel
eine **eigene iPhone-App**, die den Kalender direkt auf dem Gerät nutzt.

| # | Stück | Inhalt | Größe |
|---|---|---|---|
| 19 | Kalender-Abo-Link (erledigt, Run 25) | Persönlicher, geheimer ICS-Link (neu erzeugbar) für alle ohne Apple-Verbindung, z. B. Google/Android und Trainer: Teameinheiten mit Halle, Notiz, Treffpunkt, Gegner, Kader-Status; eigenes Training; bei Trainern alle Einheiten ihrer Teams. Abgesagte Einheiten verschwinden | klein |
| 20 | Apple-Kalender verbinden (CalDAV) | Spieler/Trainer verbinden iCloud mit Apple-ID und **app-spezifischem Passwort** (Anleitung in der App; das normale Passwort wird nie verlangt). Das Passwort liegt **verschlüsselt** (Supabase Vault) und ist nur für die Abgleich-Funktion lesbar; „Trennen“ löscht es sofort, bei Apple jederzeit widerrufbar. **App → Apple:** die App legt in iCloud einen Kalender „Club OS“ an und hält ihn aktuell (neu, geändert, abgesagt). **Apple → App:** nach dem Verbinden zeigt die App die Liste aller Apple-Kalender; **je Kalender**: **„Nicht importieren“** (Standard; die App liest ihn nicht) oder **„Importieren“** – importierte Termine sind private Termine, was der Trainer davon sieht, steht in 21b. Entschieden 2026-09-25: **keine Art „Training“ beim Import** – eigenes Training legt man in der App an (einzeln oder als Serie, Stück 22) und trägt dort die Belastung nach. Andere Kalender werden nur gelesen, nie verändert. Abgleich alle 15 Minuten (pg_cron → Edge Function) und beim Öffnen der App | groß |
| 21a | Trainer sieht eigenes Training (erledigt, Run 28) | Rollen mit `viewAthletePlans` sehen das geplante eigene Training der Spieler (entschieden 2026-09-25: **eigenes Training immer sichtbar**): im Spieler-Blatt „Own training“ der nächsten zwei Wochen; beim Planen einer Einheit der Hinweis „2 players have own training then: …“. Rollen ohne das Recht sehen weiterhin nichts davon | mittel |
| 21b | Was der Trainer von privaten Terminen sieht | **Je importiertem Kalender** wählbar: **gar nicht / nur „belegt“ / mit Titel** (Standard: nur „belegt“; entschieden 2026-09-25: wer möchte, dass der Trainer sieht, was man macht, wählt „mit Titel“). Nicht importierte Kalender sieht niemand. Der Hinweis beim Planen aus 21a zählt „belegt“ mit. Braucht 20 | klein |
| 22 | Eigenes Training als Serie (erledigt, Run 26) | Beim Anlegen von eigenem Training „Once“ oder „Weekly“: Wochentage wählen (z. B. Mo + Do) und „bis“ (Standard 8 Wochen, höchstens 26). Jeder Termin ist ein normaler eigener Termin (fragt danach „How hard was it?“, zählt in die Belastung). **Beim Planen kein RPE, nur die Dauer** (entschieden 2026-09-25); RPE und tatsächliche Dauer fragt „How hard was it?“ nach der Einheit (Run 27). Ändern und Löschen: „Only this one“ oder „This and following“ | mittel |

Reihenfolge (neu 2026-09-25): 19 → 22 → 21a (ohne dein Konto baubar) → 20 → 21b (brauchen dein Konto und ein app-spezifisches Passwort). Risiko bei 20: iCloud-CalDAV ist nicht offiziell dokumentiert
(funktioniert aber stabil, wird von vielen Kalender-Apps genutzt); Test mit deinem eigenen
Konto nötig.

## Entscheidungen (2026-09-25)

- F1 Fehler sehen: **eigene Lösung in Supabase**, tägliche Push-Zusammenfassung.
- F2 Offline: **anzeigen und Änderungen später senden**.
- F3 Team-Nachrichten: **Ankündigung**, kein Chat; **gelesen = gesehen** (beim Öffnen, kein Knopf).
- F4 Abwesenheit: **Spieler und Trainer tragen ein**, ohne Freigabe.
- K1 Apple → App: **Apple-Login (CalDAV)** jetzt; **eigene iPhone-App** als Ziel.
- K2 Eigenes Training: **immer für den Trainer sichtbar**; wählbar nur bei privaten
  Terminen.
- K3 App → Apple: **eigener iCloud-Kalender „Club OS“**, den die App aktuell hält.

## Nach dem Pilot (gemerkt 2026-09-25)

Für den Pilot mit nur dem eigenen Team bewusst zurückgestellt, vor einem Start mit
weiteren Teams oder Vereinen aber nötig:

- Datenschutzerklärung, Impressum, Einwilligung bei der Registrierung (Gesundheitsdaten:
  Belastung, RPE, Absagegründe).
- Minderjährige unter 16: Einwilligung der Eltern.
- Konto löschen und eigene Daten herunterladen (DSGVO). (Team selbst verlassen: vorgezogen, Stück 12.)
- Supabase-Tarif (Pausieren nach Inaktivität, Backups) prüfen.
- Ziel: eigene iPhone-App (App Store), u. a. für den Kalender direkt auf dem Gerät.

Annahme für den Pilot: alle Spieler haben die App (kein Eintragen durch den Trainer für
Spieler ohne Konto nötig).

## Was außerhalb des Codes offen ist

- Supabase: E-Mail-Bestätigung / SMTP, Site URL und Redirect-URLs.
- Vercel-Projekt und Adresse.
- Gründungs-Code für den eigenen Verein (kommt mit Stück 8).
