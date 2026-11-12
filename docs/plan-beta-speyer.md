# Plan: startklar für den Beta-Betrieb (Jugend Speyer)

Stand 2026-11-12. Anlass: Der Jugendleiter des Vereins, in dem Ben in der Pro B spielt,
will die App mit den Jugendteams ausprobieren; außerdem schaut sich ein externer
Interessent (Chef von Bens Mutter) das Projekt an.

Grundlage: Fehlerberichte der App (`app.error_reports`, 30 Tage), Vercel-Laufzeitfehler
(7 Tage), Supabase-Sicherheitsprüfung, ein Durchgang durch die App als Trainer und Spieler
auf dem Handy, die offenen Punkte in `plan-next-runs.md`.

**Was schon trägt:** Keine Serverfehler bei Vercel in den letzten 7 Tagen; der volle
Browser-Test (344 Seitenaufrufe, 4 Sprachen, Handy und Desktop) ist grün; alle Rechte
liegen in der Datenbank und sind getestet; Beitritt, Anmeldung, Karte, Tipps und
Kalender-Führung sind frisch überarbeitet.

## A. Muss vor dem ersten Jugendspieler erledigt sein

| # | Was | Warum | Wer |
|---|---|---|---|
| A1 | **Eigener Mailversand (Resend über SMTP)** — gemerkt, kommt bald | Der eingebaute Versand von Supabase schafft nur wenige Mails pro Stunde und landet bei GMX und Co. oft im Spam (so geschehen am 2026-11-11). Meldet sich ein Team mit 15 Spielern an, bleiben die meisten ohne Bestätigungsmail hängen. Resend braucht eine **eigene Domain** (z. B. `clubos.app`, ca. 10–15 € im Jahr), die bei Resend bestätigt wird; dann in Supabase Auth → SMTP eintragen und die Auth-Rate-Limits für Mails anheben. Absender z. B. `Club OS <noreply@…>`, die vier Mailvorlagen (`docs/mail-templates/`) gibt es schon | Ben (Domain, Resend-Konto, Schlüssel in Supabase eintragen; nie in den Chat), Claude führt Schritt für Schritt |
| A2 | **Supabase Pro** (ca. 25 $/Monat) | Im kostenlosen Plan wird ein Projekt nach einer Woche ohne Nutzung pausiert (das alte Projekt ist so stehen geblieben), es gibt keine täglichen Sicherungen, und der Schutz vor geleakten Passwörtern (Sicherheitsprüfung: „Leaked Password Protection Disabled“) lässt sich erst damit einschalten. Für Gesundheitsdaten Minderjähriger ist eine Sicherung Pflicht | Ben (Entscheidung, Zahlung) |
| A3 | **Datenschutz mit dem Verein klären** | Der Verein ist Verantwortlicher, Club OS verarbeitet im Auftrag: es braucht einen **Auftragsverarbeitungsvertrag** (AVV) zwischen Verein und Ben, und die Datenschutzerklärung muss das so sagen. Für unter 16-Jährige laufen Gesundheitsdaten nur mit Zustimmung der Eltern (Link aus der App, gibt es schon). Dazu ein kurzer **Elternbrief**: was die App ist, welche Daten, wozu, wie man widerspricht | Claude entwirft AVV-Vorlage und Elternbrief, Ben und der Verein prüfen (kein Ersatz für Rechtsberatung) |
| A4 | **Verein aufsetzen** | Gründungscode erzeugen (per SQL, nur im Chat); der Jugendleiter gründet den Verein (oder Ben gründet und lädt ihn als Abteilungsleitung ein); Abteilung, Teams (U10 … U18), Hallen; je Team die Trainer-Einladung; Funktionen je Team festlegen (siehe B2) | Ben mit dem Jugendleiter, Claude bereitet Code und Ablauf vor |
| A5 | **Belastung (Load) für Jugendteams standardmäßig aus** | Neue Teams starten heute mit Belastung an (`teams.features` = `load`). Für U10–U14 ist RPE, ACWR und „AU“ zu viel; einschalten nur, wo ein Trainer es will | Claude (Voreinstellung für Jugendteams), Entscheidung Ben |

## B. Sollte in den ersten zwei Wochen besser werden

**Eltern und jüngere Kinder**

- B1 **Eltern-Zugang.** Viele U10–U14-Kinder haben kein eigenes Handy; die Eltern sagen zu
  und ab. Heute gibt es nur das eigene Konto des Spielers. Übergangslösung für den Start:
  Ein Elternteil legt das Konto **im Namen des Kindes** an (eigene E-Mail, Name und
  Geburtsjahr des Kindes); die Eltern-Zustimmung läuft wie gehabt. Richtig gelöst: ein
  Elternteil verbindet sich mit einem oder mehreren Kindern und antwortet für sie —
  braucht ein Konzept und Rechte in der Datenbank. **Entscheidung von Ben nötig**, ob das
  vor oder nach dem Start kommt.

**Spieler (Heute und Belastung)**

- B2 **„Heute“ beginnt mit dem Wichtigsten.** Ganz oben „Als Nächstes“ mit Zu-/Absage;
  Nachrichten, Karte, Playbook und Kennzahlen danach. Heute steht „Als Nächstes“ unter
  fünf anderen Karten.
- B3 **Belastung verständlich.** „Spielraum bis hoch 351 AU“, „ACWR 1,14“, „Monotonie“,
  „Beanspruchung“ und die Pfeile „→ ~1,20“ an jeder Einheit versteht ein Jugendspieler
  nicht. Einfache Ansicht als Standard (Ampel und ein Satz: „Du kannst normal trainieren“),
  Zahlen für Fortgeschrittene einklappbar. Das ist das offene Zielstück 1.

**Trainer**

- B4 **Team-Seite: die fünf Unterreiter sind nur Symbole** (Überblick, Spieler, Gruppen,
  Anwesenheit, Einstellungen). Mit Wort darunter oder als Text-Reiter.
- B5 **Verlauf auf dem Handy:** die Kacheln je Einheit sind abgeschnitten („Anwes… 10/12
  2 abwes…“), die Diagrammbeschriftung ist zu klein zum Lesen.
- B6 **Fehler aus dem Pilot:** Am 2026-10-23 wurde auf einem iPhone eine
  Fahrgemeinschafts-Aktion eines Spielers vom Server abgelehnt („Not saved (Rides)“).
  Mit einem Testkonto nachstellen, Ursache in den Datenbankregeln finden, Test dazu.

**Technik**

- B7 **Anmelde-Grenze großzügiger.** Die Prüfung „gibt es diese E-Mail schon“ erlaubt 20
  Abfragen in 10 Minuten je IP-Adresse. Ein Hallen-WLAN gibt es nicht, aber Mobilfunker
  teilen eine öffentliche IP oft auf viele Kunden auf; auf 60 anheben, Test anpassen.
- B8 **App auf den Home-Bildschirm.** Push auf dem iPhone geht nur aus der installierten App.
  Nach dem Beitritt einmal deutlich zeigen, wie das geht (es gibt die Anleitung, sie
  steht aber in den Einstellungen und im Benachrichtigungs-Hinweis).
- B9 **Rückmeldungen im Beta-Betrieb:** Problem-Knopf und `/reports` gibt es; einmal pro
  Woche durchsehen, offene Fehler sofort, Wünsche sammeln.

## C. Erklärvideo und Material

- C1 **Erklärvideo, 60–90 Sekunden** aus echten Bildschirmen der Demo (automatisch
  aufgenommen), mit deutschen Untertiteln, ohne Sprecher: (1) Trainer plant im Kalender,
  sieht wer kommt, schreibt dem Team; (2) Spieler sagt mit einem Tipp zu, sieht den
  nächsten Termin, bewertet das Training; (3) Verein/Jugendleitung sieht alle Teams und
  Hallen. Kürzere Schnitte je Rolle für WhatsApp.
- C2 **Eine Seite für Trainer** (so lädst du dein Team ein, so planst du) und der
  **Elternbrief** (A3) als PDF.
- C3 Für den externen Blick: README und DESIGN.md sind aufgeräumt (Run 105); Demo ohne
  Konto auf myclubos.vercel.app.

## D. Bewusst nicht vor dem Start

Trainerkarte (Konzept steht), Spielstatistik, Video, Abos und Bezahlung, Verbands-
Spielpläne. Erst wenn die Jugend in Speyer zwei, drei Wochen damit arbeitet.

## Reihenfolge

1. A1 Mailversand (sobald Ben Domain und Resend-Konto hat) und A2 Pro-Plan.
2. A5, B2, B3, B4, B5, B7 in einem Durchgang (Code, Claude).
3. B6 nachstellen und beheben.
4. C1 Erklärvideo, C2 Material.
5. A3 und A4 mit dem Jugendleiter; B1 je nach Entscheidung.
