# Plan: Zusagen, Umfragen, Vereins-News (2026-10-01)

Wunsch (Ben): „noch nicht reagiert“ für Trainer, Spieler wählen selbst, ob sie automatisch zugesagt
sind; Umfragen; Vereins-News mit einer sinnvollen Regel, wer sie schreiben darf. Das Nachrichtensystem
dabei mitdenken. Drei Stücke, jedes ein eigener PR, in dieser Reihenfolge.

## Stück A — Zusagen: automatisch oder selbst (RSVP)

**Idee:** Jeder Spieler wählt in den Einstellungen, wie er antwortet:
- **„Automatisch dabei“** (Standard, wie bisher): ohne Antwort zählt er als dabei, er muss nur absagen.
- **„Ich sage selbst zu“**: ohne Antwort ist er **offen**. Er tippt „Dabei“ oder „Absagen“.

**Trainer:** Zu jeder Einheit drei Gruppen statt zwei: **dabei · abgesagt/verspätet · offen**.
„Offene erinnern“ schickt einmal einen Push an alle Offenen („Kommst du? …“). Die automatische
Erinnerung vor der Einheit („Are you in?“, gibt es schon) geht an Offene sicher; die Zusammenfassung
für den Trainer nennt die Zahl der Offenen.

**Spieler:** Auf „Heute“ und im Kalender steht bei offenen Einheiten statt „Du bist dabei“ ein
deutliches „Kommst du?“ mit zwei Knöpfen **Dabei / Absagen**; eine Antwort lässt sich jederzeit ändern.

**Daten:** `people.rsvp_mode` (`auto` | `manual`, Standard `auto`), nur von der Person selbst
änderbar, für Trainer lesbar (damit „offen“ stimmt). Eine ausdrückliche Zusage ist eine
`availability`-Zeile mit Status „dabei“ (falls es den Status noch nicht gibt, kommt er dazu). Alle
Stellen, die heute „keine Zeile = dabei“ annehmen (Trainer Heute, Team, Kader „Alle Verfügbaren“,
Anwesenheit, Verlauf, Push-Zusammenfassung), lernen „keine Zeile + manual = offen“. Offene zählen für
den Kader-Vorschlag nicht als verfügbar.

**Tests:** SQL-Test (nur man selbst ändert `rsvp_mode`; Erinnerung nur an Offene), Server-Store-Test,
Rundgang, Screenshots Spieler/Trainer.

## Stück B — Umfragen in Team-Nachrichten

**Trainer** (wer schon Nachrichten schreiben darf): im Nachrichtenfeld „Umfrage“ einschalten →
Frage = Nachrichtentext, 2–6 Antworten, optional **Mehrfachauswahl**. Danach wie jede Nachricht (an
Team oder Gruppen, wichtig/angepinnt möglich, Push).
**Spieler:** tippen eine Antwort (ändern bis zum Ende), sehen sofort das Ergebnis als Balken mit
Anzahl. **Trainer** sieht zusätzlich, wer was gewählt hat und wer noch nicht abgestimmt hat,
„Noch nicht abgestimmt erinnern“ (wie beim Lesen) und **„Umfrage beenden“**.
Damit lassen sich auch Trikots, Essen oder vorläufig Fahrgemeinschaften abstimmen.

**Daten:** an `team_messages`: `poll_options text[]` (2–6, je 1–80 Zeichen), `poll_multiple`,
`poll_closed_at`; neue Tabelle `message_votes (message_id, person_id, option)`; abstimmen darf nur,
wer die Nachricht bekommt, solange sie nicht beendet ist; sehen dürfen Empfänger und Trainer.

## Stück C — Vereins- und Abteilungs-News

**Wer darf schreiben (Vorschlag):**
- **An den ganzen Verein:** nur **Vereinsadmins**.
- **An eine Abteilung** (alle Teams darin): die **Abteilungsleitung** (und Admins). Die Leitung kann in
  den Abteilungseinstellungen einschalten: **„Head Coaches dürfen Abteilungs-News schreiben“**
  (Standard aus). Feiner (einzelne Personen) bewusst nicht: eine Regel pro Abteilung reicht und ist
  verständlich; Team-Nachrichten bleiben für jeden Trainer mit Team-Rechten wie bisher.

**Empfänger:** alle Spieler und Trainer der Teams im Bereich (Verein bzw. Abteilung).
**Schreiben:** im Vereinsbereich (Admin/Leitung) und — wenn erlaubt — für Head Coaches über eine
neue Seite **„News“** (Bereich wählen: Verein / Abteilung), mit wichtig/angepinnt wie bei
Team-Nachrichten, Push an alle Empfänger.
**Lesen:** Spieler sehen News in „Nachrichten“ zwischen den Team-Nachrichten (Kennzeichen „Verein“
bzw. Abteilungsname), die Karte auf „Heute“ zeigt auch News. Trainer bekommen eine Karte auf „Heute“
und die Seite **„News“** (über die Karte und das Profilmenü erreichbar). Gelesen = gesehen, wie bei
Team-Nachrichten; der Schreiber sieht „gelesen 34/58“.

**Daten:** `club_news (id, club_id, department_id null = ganzer Verein, author_id, body, important,
pinned_until, created_at)`, `club_news_reads`; `departments.news_by_head_coaches boolean`.
Zugriffsregeln: lesen nur Mitglieder im Bereich; schreiben wie oben; Push über die Outbox (Texte in
allen Sprachen, wie Team-Nachrichten).

## Nachrichtensystem allgemein (mitgedacht)

- Spieler: **ein** Posteingang („Nachrichten“) für Team-Nachrichten, Umfragen und News, neueste
  zuerst, Angepinntes oben, Filter-Chips „Alle · Team · Verein“ sobald es News gibt.
- Trainer: Team-Nachrichten weiter im Team (schreiben, Lesestatus), News auf eigener Seite.
- Später (nicht in diesen Stücken): Antworten/Kommentare, Fahrgemeinschaften als eigene Funktion,
  Umfragen auch in News.

## Ablauf

Je Stück: Migration (lokal testen: `supabase/pilot/tests/run-local.sh`, `npm run test:pilot`),
Datenschicht, Oberfläche, Texte in vier Sprachen (`check:i18n`), Screenshots Handy/Desktop,
`test:smoke`, PR, nach grüner CI mergen, Migration live einspielen (vor dem Merge, abwärtskompatibel).

## Nachrichten neu gedacht (2026-10-02, Stufe 1 für den Pilot)

Wunsch (Ben): an mehrere Teams, eine Abteilung oder den Verein schreiben, an alle oder nur an Trainer
oder Spieler, wie das „An:“ in Teams; für Text, Umfragen und später Aufgaben; nichts doppelt.
Schreibrechte pro Person statt pro Abteilung. Antworten erst später (Stufe 2: Rückfrage ans
Trainerteam, aus Kinderschutzgründen nie privat zwischen einem Trainer und einem Spieler; Stufe 3
vielleicht Team-Chat). Für den Pilot reicht Stufe 1: Ankündigungen ohne Antwort.

1. **Ein Modell, Rechte pro Person** (Migration 0036/0037): eine Tabelle `messages` mit
   `team_ids`, `group_ids`, `department_ids`, `whole_club` und `audience` (alle · Trainer · Spieler);
   Empfänger als Menge (jeder einmal: eine Nachricht, ein Push, eine Lesebestätigung, eine Stimme);
   `message_writers`: die Leitung schaltet pro Person frei, wer an ihre Abteilung schreibt, ein
   Admin, wer an den ganzen Verein. Ersetzt Team-Nachrichten, Vereins-News und den Abteilungsschalter.
2. **„An:“-Feld und Posteingang für Trainer**: Auswahl der Ziele (eigene Teams und Gruppen,
   Abteilungen, Verein) und „wer“; Trainer und Vereinsrollen lesen und schreiben über ein
   Nachrichten-Symbol oben (statt „News“).
3. **Spieler-Posteingang**: ein Feed, Chips je Quelle ohne „Alle“ (Antippen filtert, nochmal
   Antippen zeigt wieder alles), ungelesene Zahl je Chip, Beschriftung „U16 · U19“.

### Für das Gesten-Onboarding (später) festgehalten

- **Trainer:** „Wichtig“ heißt angepinnt — die Nachricht bleibt bei allen oben, bis zum gewählten Datum,
  auch wenn sie gelesen ist; die Benachrichtigung lässt sich nicht ausschalten.
- **Spieler:** Angepinntes steht oben unter „Angepinnt“ und bleibt dort, obwohl es schon gelesen ist —
  weil es wichtig ist; danach rutscht es normal in den Verlauf.
- **„An:“:** erst Team antippen = ganzes Team; darunter Gruppen antippen = nur diese Gruppen.
