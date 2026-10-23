# /goal: Club OS pilotreif machen (Erklärung, Playbook, Onboarding, Vertrieb)

Stand 2026-10-23, Auftraggeber Ben. Diesen Text als `/goal`-Auftrag verwenden. Er ist für viele
Runs gedacht: Stück für Stück abarbeiten, nach jedem Stück PR, grüne CI, mergen, weiter.

## Ziel

Club OS ist bereit für die ersten Pilotvereine. Wer die App zum ersten Mal öffnet, versteht
in Sekunden, was sie kann, findet sich ohne Hilfe zurecht und vertraut ihr, auch der
Belastungssteuerung, weil sie erklärt und wissenschaftlich begründet ist. Trainer können
Playbooks hochladen und gezielt freigeben. Für Marketing und Vertrieb des Pilots liegen ein
Plan und fertige Unterlagen bereit.

## Feste Regeln (gelten für jedes Stück)

- Erst lesen: `CLAUDE.md`, `AGENTS.md`, `docs/simplify-decisions.md`, `docs/plan-onboarding.md`,
  `docs/plan-next-runs.md`, `docs/agent-workflow.md`, `docs/i18n.md`.
- **Ablauf je Stück:** bauen → `npm run typecheck`, `npm run build`, `npm run check:i18n`, die
  passenden `test:*`, Postgres-Tests (`supabase/pilot/tests/run-local.sh`), `SMOKE_FULL=1 npm run
  test:smoke` → Screenshots vorher/nachher (Handy 390 px und Desktop, Deutsch) und dabei
  sichtbare UI-Mängel gleich mitbeheben → PR auf `claude/club-app-simplify-restructure-bg9rvu` →
  CI grün → Squash-Merge mit voller SHA → Branch auf `origin/main` zurücksetzen → kurzer Bericht
  auf Deutsch mit Bildern → `docs/simplify-progress.md` (neuer Run) und den Plan nachziehen.
- **Texte:** Quelltext Englisch, alle Texte in die vier Kataloge (en/de/fr/es, du/tu/tú).
  Demo-Texte in `src/shared/data/demoTexts.ts`.
- **Datenbank:** Migrationen unter `supabase/pilot/migrations/`, mit SQL-Test unter
  `supabase/pilot/tests/`, live über das Supabase-MCP (Projekt `tszxeainmwowmixqmphn`).
  Löschende Statements nie am Bestätigungs-Gate vorbei: SQL dokumentieren, Ben führt aus.
- **Nie:** Geheimnisse ins Repo oder in die Ausgabe, TLS-Prüfung abschalten, Modellnamen in
  Commits/PRs, `localStorage` außerhalb von `src/shared/data/repository.ts`, Rechte aus
  URL-Parametern, Tests überspringen oder abschalten, Funktionen bei UI-Arbeit entfernen.
- **Stil:** ruhig, dunkel, wie die letzten Runs (Karten `rounded-xl border-slate-800
  bg-slate-900/45`, Zeilen mit Zeichen links, eine Primärfarbe). Keine Abdunkel-Touren, kein
  Rundgang mit Schrittzähler (entfernt in Run 73).
- **Rückfragen** nur bei echten Produktentscheidungen; sonst sinnvolle Annahme treffen, im
  Bericht nennen und weiterbauen. Entscheidungen in `docs/plan-*.md` festhalten.

## Stück 1: Erklärung der Belastungssteuerung (mit Evidenz)

Heute gibt es nur ein kurzes Blatt (`load.explainer.*`, `src/features/load/LoadHints.tsx`).

- **Eigene Seite „So funktioniert die Belastung“**, erreichbar aus dem Belastungs-Tab
  (Spieler), der Spieler-Belastungsansicht (Trainer) und den Einstellungen. Abschnitte:
  1. Was gemessen wird: Session-RPE (Anstrengung 0–10 × Minuten = Belastung in AU), warum ein
     Gefühlswert reicht.
  2. Akut und chronisch: letzte 7 Tage im Verhältnis zu den letzten 28 (EWMA, wie in
     `loadCalculations.ts`), was die Zonen bedeuten, warum es eine Eingewöhnung von etwa
     4 Wochen braucht.
  3. Monotonie und Strain (Foster), kurz.
  4. **Was die Forschung sagt, ehrlich:** Session-RPE ist gut belegt (u. a. Foster et al. 2001;
     Haddad et al. 2017). Das ACWR wurde mit Verletzungsrisiko in Verbindung gebracht (Gabbett
     2016; Hulin et al.), die EWMA-Variante gilt als genauer (Williams et al. 2017). Es gibt
     berechtigte Kritik am ACWR als Vorhersagewert (Impellizzeri et al. 2020, 2021). Daraus folgt
     die Haltung der App: **Orientierung und Gesprächsanlass, keine Diagnose, keine
     Verletzungsvorhersage.**
  5. Was Trainer daraus machen (Gespräch, Trainingsplanung) und was nicht (keine Kaderentscheidung
     allein aus der Ampel).
  6. Datenschutz: wer welche Belastungsdaten sieht (Einwilligung, Trainerrollen).
- **Quellen prüfen:** jede Quelle per Websuche nachprüfen (Autor, Jahr, Zeitschrift, DOI); nichts
  zitieren, was nicht gefunden wurde. Quellenliste am Ende der Seite, mit Links.
- **Im Moment erklären:** kleine „?“-Infos an ACWR, Zonen, Monotonie, „Eingewöhnung läuft“; die
  bestehenden Texte durchsehen und an die Seite anbinden.
- Fertig, wenn: Seite in vier Sprachen, aus allen drei Stellen erreichbar, Quellen geprüft,
  Screenshots, Smoke-Test grün.

## Stück 2: Erklärung der App allgemein (Hilfe)

Ben hat entschieden: **kein eigenes Erklär- oder Tour-Programm** (zu aufwendig, sprengt bei
mehreren Sportarten den Rahmen). Also nichts, was jede Sportart eigens abbilden muss, und keine
selbst gebaute Tour-Maschine. Stattdessen:

- **Hilfe-Seite pro Rolle** (Spieler, Trainer, Verein/Abteilung): kurze Antworten auf die
  20 wichtigsten Fragen („Wie sage ich ab?“, „Wie plane ich eine Serie?“, „Wer sieht meine
  Gründe?“, „Wie lade ich Spieler ein?“ …), durchsuchbar, mit kleinen Screenshots aus der Demo.
  Aufrufbar aus dem Konto-Menü und aus jeder leeren Ansicht.
- **Willkommen-Blatt** einmal nach dem ersten Öffnen je Rolle (drei Zeilen, ein Knopf), Ideen in
  `docs/onboarding-concept.md` Abschnitt A; gemerkt pro Gerät bzw. Konto.
- **Leere Zustände**: jede leere Liste sagt, was hinkommt, und hat genau einen Knopf dafür.
- Wenn für Tipps an Knöpfen eine Bibliothek sinnvoll ist, eine kleine, gepflegte (MIT) nehmen
  statt selbst bauen, und nur für wenige, allgemeine Stellen.
- Fertig, wenn: Hilfe in vier Sprachen, Willkommen-Blatt je Rolle, alle leeren Listen geprüft.

## Stück 3: Erstnutzer-Onboarding, viel professioneller und flüssiger

Baut auf Run 89 auf (Startbildschirm „Neu hier / Anmelden“, Demo je Rolle).

- **Erster Eindruck:** Startbildschirm mit klarer Botschaft und 2–3 echten App-Bildern
  (Demo-Screenshots, wie auf der Landingpage), Übergänge ohne Ruckeln, schnelle erste Anzeige.
- **In der Demo:** schmaler Hinweis „Beispielverein · Rolle wechseln · Eigenen Verein starten /
  Team beitreten“; Rollenwechsel ohne Umweg über die Startseite.
- **Vom Ausprobieren zum Konto:** „Gefällt dir?“ an sinnvollen Stellen (nach dem ersten Absagen,
  nach dem ersten geplanten Training), führt zu Gründen bzw. Beitreten.
- **Registrieren und Beitreten** (`/join`, `/found`, `/login`) durchgehen: weniger Felder pro
  Bildschirm, klare Fehlermeldungen, Fortschritt sichtbar, Passwort vergessen, Rückkehr nach
  E-Mail-Bestätigung, alles auf dem Handy mit einer Hand bedienbar.
- **Profil zuerst, klein** (Plan Stück 3): Name und Bild direkt vor dem Konto, füllt nur das
  Registrieren vor.
- **Gründen-Assistent nach dem Konto:** Abteilungen, Teams, Hallen mit Vorschlägen zum Antippen
  (Sportart, U-Klassen), direkt auf dem Server; am Ende Einladungslinks für Trainer und der
  Team-Code für Spieler zum Teilen.
- **Profilbilder** (Plan Stück 4): Speicher (Supabase Storage, Bucket mit Regeln: nur eigener
  Verein sieht Bilder, nur man selbst lädt das eigene hoch), Verkleinern im Browser, dann in den
  Kreisen bei „Abwesend und verspätet“ und in Personenlisten (Zeichen wird kleines Abzeichen).
- Fertig, wenn: kompletter Weg für Spieler, Trainer und Gründer einmal auf dem echten Server
  (myclubos.vercel.app, Wegwerf-Konten) durchgespielt, mit Bildern jedes Schritts; Wegwerf-Daten
  danach per dokumentiertem SQL für Ben.

## Stück 4: Playbook-Reiter

Trainer laden Playbooks (Spielzüge, Taktik, Abläufe) als Datei hoch und geben sie gezielt für
Spieler frei, je nach Stand des Teams.

- **Wo:** neuer Reiter „Playbook“ im Team (Trainer) und beim Spieler (unter Team oder eigener
  Eintrag, nach Platz in der Navigation entscheiden und begründen).
- **Inhalt:** PDF (zuerst), optional Bilder (PNG/JPG); Titel, kurze Beschreibung, Kategorie
  (z. B. Angriff, Verteidigung, Standards), Reihenfolge.
- **Freigabe „je nach Stand des Teams“:** pro Playbook entweder Entwurf (nur Trainer), für das
  ganze Team, oder für Gruppen (bestehende Spielergruppen, z. B. „Starting Five“); optional „ab
  Datum“. Spieler sehen nur Freigegebenes; neue Freigabe erzeugt eine Push-Nachricht.
- **Server:** Tabelle `playbooks` (+ Freigaben), Supabase Storage-Bucket privat, Zugriff nur über
  signierte URLs, Regeln analog Nachrichten (Trainerrecht `editSessions` bzw. neues Recht
  `managePlaybook` in den Trainerrollen). Größenlimit (z. B. 20 MB), nur PDF/Bilder.
- **Freischaltung:** als Team-Funktion `playbook` in die Freischaltungs-Schicht (0046) einhängen;
  Entscheidung bezahlt/Basis im Bericht vorschlagen (Vorschlag: bezahlt, im Pilot frei).
- **Lokaler Modus/Demo:** zwei Beispiel-Playbooks (eines freigegeben, eines Entwurf), ohne
  echten Upload (kleine eingebaute Beispiel-PDF bzw. Platzhalter).
- **Ansehen:** PDF im Browser öffnen (eigene Ansicht mit Blättern auf dem Handy oder
  Systemansicht), „zuletzt angesehen“ für den Trainer optional.
- Fertig, wenn: Migration live mit SQL-Tests (Spieler sieht keinen Entwurf, fremder Verein sieht
  nichts, Gruppenfreigabe greift), Upload und Ansehen auf dem echten Server geprüft, Demo zeigt
  den Reiter.

## Stück 5: Marketing und Vertrieb für den Pilot

Ergebnis sind Dokumente unter `docs/marketing/` (Deutsch) und, wo sinnvoll, Änderungen an der
Landingpage. Nichts wird an Externe verschickt oder veröffentlicht; Entwürfe für Ben.

- **Zielgruppe und Angebot:** wer zuerst (Jugendabteilungen, einzelne Teams, Mehrspartenvereine
  in NRW/Bayern?), Probleme, die wir lösen, Abgrenzung zu Spond, SportMember, heja, TeamSnap,
  Excel/WhatsApp (Funktionsvergleich mit Quellen prüfen), unser Kern: Belastungssteuerung +
  Hallen + ruhige App.
- **Pilotangebot:** Dauer (bis 2027-06-30 wie die Pilot-Freischaltung), was der Verein bekommt,
  was wir erwarten (Feedback-Termine, Ansprechpartner), Erfolgskriterien, danach Preise.
- **Preis-Hypothesen:** Basis kostenlos oder günstig je Team, Leistung (Belastung, Playbook)
  bezahlt; Rechnung pro Team/Monat und pro Verein; Vergleich mit Marktpreisen (prüfen).
- **Vertrieb:** Liste der Kanäle (eigener Verein, Landesverbände, Trainerlehrgänge, Instagram,
  Elternabende), Ansprache-Texte (E-Mail, WhatsApp, Kurzpitch 30 s, Elternbrief), einseitiges
  Infoblatt (als PDF erzeugbar), Demo-Ablauf für ein 15-Minuten-Gespräch, Einwandbehandlung
  (Datenschutz, „wir haben schon WhatsApp“, Aufwand für Trainer).
- **Landingpage:** Botschaft schärfen, Pilot-Anmeldung, Screenshots der neuen Demo, FAQ zu
  Datenschutz und Belastung (mit Link auf Stück 1).
- **Voraussetzungen vor echten Kunden** aus `docs/plan-next-runs.md` als Checkliste mit Stand:
  AVV/DPA mit Supabase und Vercel, SMTP, Supabase Pro, Bot-Schutz, Passwortregeln,
  Rechtsprüfung, Impressum/Datenschutz mit eigener Domain. **Eigene Domain und E-Mail macht
  Ben** (nur vorbereiten: was wo umzustellen ist, nichts selbst ändern).
- Fertig, wenn: `docs/marketing/` mit Zielgruppe, Wettbewerb, Pilotangebot, Preisen, Kanälen,
  Texten, Infoblatt, Demo-Skript, Checkliste; Landingpage-Änderungen mit Vorher/Nachher.

## Reihenfolge

1 Belastung erklären → 4 Playbook → 3 Onboarding → 2 Hilfe → 5 Marketing (5 kann zwischendurch
laufen, wenn auf CI gewartet wird). Nach jedem Stück: Bericht an Ben, dann direkt weiter.

## Ende

Fertig, wenn alle fünf Stücke ihre „Fertig, wenn“ erfüllen, main grün ist und ein
Abschlussbericht (`docs/simplify-progress.md`) sagt, was gebaut wurde, was offen ist und welche
Entscheidungen Ben noch treffen muss.
