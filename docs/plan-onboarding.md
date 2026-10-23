# Plan: Onboarding „erst ausprobieren, dann registrieren“ (2026-10-23)

Auftrag von Ben: Beim ersten Besuch soll jeder (Verein/Abteilung, Trainer, Spieler) die App
mit den **eigenen** Daten ausprobieren, sehen wie durchdacht sie ist, und sich **erst dann**
registrieren. Nach dem Registrieren ist alles noch da, nichts muss doppelt eingegeben werden.

Ersetzt den zurückgestellten Entwurf `docs/onboarding-concept.md` (Willkommen-Blatt, Tipps);
dessen Ideen für Tipps im Moment bleiben für später.

## Warum vorher

Wer schon Zeit und Persönliches hineingesteckt hat (Name, Foto, eigener Verein), bricht
seltener ab (Investitions- bzw. IKEA-Effekt, Konsistenz). Das Konto wird zum letzten Schritt
„Sichere, was du gebaut hast“ statt zur Hürde am Anfang.

## Ablauf

**0 Erster Bildschirm** (`/start`, nicht angemeldet): groß „Neu hier“ und „Anmelden“; klein
„Beispielverein ansehen“ (der bisherige Demo-Verein) und „Ich habe einen Link oder Code“
(das bisherige „Wer bist du?“).

**1 „Was möchtest du tun?“** (`/welcome`)
- Verein oder Abteilung einrichten
- Mein Team einrichten (Trainer)
- Als Spieler loslegen

**2 „Wie heißt du?“** Vorname, Nachname, Profilbild (freiwillig, wird im Browser auf
256 px verkleinert).

**3 je Rolle**
- *Verein/Abteilung:* Vereinsname und Ort → Abteilungen (Vorschläge zum Antippen) → Teams je
  Abteilung (Vorschläge U12…Herren/Damen) → Hallen mit Adresssuche.
- *Trainer:* Verein (Name, Ort), Sportart, Teamname, Altersgruppe, Halle (freiwillig);
  „Mit Beispielspielern ausprobieren“ (an), damit Zu-/Absagen gleich lebendig aussehen.
- *Spieler:* „Hast du einen Team-Code?“ (Code oder Link) oder „Erst mal umschauen“: dann
  der Beispielverein, in dem **du** ein Spieler der U16 bist (dein Name, dein Bild).

**4 Ausprobieren** im lokalen Modus mit den eigenen Daten (Vereinsseite, Trainer „Heute“,
Spieler „Heute“). Oben ein schmaler Streifen: „Probemodus · nur auf diesem Gerät ·
**Sichern**“.

**5 Sichern** (`/welcome/save`): Konto (E-Mail + Passwort, Einwilligungen wie heute) →
- Verein/Trainer: Verein auf dem Server gründen, dann Abteilungen, Teams, Hallen,
  Hallenzuordnungen und Standardhallen übernehmen; Beispielspieler nicht.
- Spieler mit Code: Team beitreten, Name übernehmen.
- Danach: „Noch 2 Fragen“ (Geburtsjahr für die Einwilligung, später Größe/Position);
  Körperdaten und Geburtsjahr erst **nach** dem Konto, weil sie Einwilligungen brauchen.

## Technik

- **Entwurf** (`OnboardingDraft`) in `repository.ts` unter `club-app.onboarding`: Rolle,
  Name, Bild, Verein, Abteilungen, Teams, Hallen, Team-Code. Jeder Schritt speichert sofort;
  wer abbricht, macht beim nächsten Öffnen weiter.
- **Probe-Datenbank:** `startTrial(draft)` baut aus dem Entwurf eine frische lokale
  Datenbank (dieselben Funktionen wie die Vereinsseite: `createDepartment`, `createTeam`,
  `createFacility`), merkt `trial` am Dokument und setzt die Identität. Der Beispielverein
  bleibt über „Beispielverein ansehen“ erreichbar (ersetzt dann die Probe nach Rückfrage).
- **Übernahme** nach dem Konto: `found_club` (erste Abteilung und erstes Team), danach die
  übrigen Strukturen über die normalen Repository-Funktionen im Server-Modus.
- Profilbild: zuerst nur lokal (Entwurf); Server-Speicher (Storage-Bucket, Regeln, wer
  welches Bild sieht) ist ein eigenes Stück. Dann kommt es auch in die Kreise bei
  „Abwesend und verspätet“.

## Offene Entscheidung (Ben)

**Gründungscode:** Heute braucht das Gründen eines Vereins einen Einmal-Code von uns.
Vorschlag: Ausprobieren ist offen für alle; beim **Sichern** fragt die App während des
Pilots nach dem Code (mit „Code anfragen“ per E-Mail). Nach dem Pilot fällt der Code weg,
dafür Bot-Schutz und Ratenbegrenzung (siehe `docs/plan-next-runs.md`).

## Reihenfolge

- **A** Startbildschirm, Schritte 1–3, Entwurf, Probe-Datenbank, Probestreifen.
- **B** Sichern: Konto, Übernahme, Spieler mit Code, „Noch 2 Fragen“.
- **C** Profilbilder auf dem Server.
- **D** Feinschliff: Tipps im Moment (aus `onboarding-concept.md`), leere Zustände.
