# Plan: Onboarding über die Demo (2026-10-23)

Ben wollte zuerst „erst ausprobieren, dann registrieren“ mit einem eigenen Probe-Verein.
Entschieden (Ben, 2026-10-23): **kein eigener Probe-Verein**, stattdessen eine gute Demo mit
guten Daten und einer Einführung im Moment. Gründe: Ein leerer eigener Verein zeigt wenig,
die Übernahme nach dem Registrieren wäre teuer und fehleranfällig, und im Pilot kommen die
meisten über einen Team-Code oder eine Einladung.

## Stücke

1. **Demo (erledigt, Run 89):** Erster Bildschirm „Neu hier“ / „Anmelden“; „Neu hier“ fragt
   Verein · Trainer · Spieler und öffnet die passende Demo-Ansicht; „Ich habe einen Link oder
   Code“ führt zu den bisherigen Wegen. Der Demo-Verein deckt alle Funktionen ab und spricht
   die App-Sprache (`src/shared/data/demoTexts.ts`, neu angelegt bei Sprachwechsel).
2. **Einführung im Moment:** Willkommen-Blatt mit drei Zeilen je Rolle und kleine Tipps an den
   Knöpfen (Ideen in `docs/onboarding-concept.md`, ohne Abdunkeln). Am Ende der Demo immer der
   nächste Schritt: „Richte deinen Verein ein“ / „Tritt deinem Team bei“.
3. **Profil zuerst, klein:** Name und Profilbild direkt vor dem Konto (füllt nur das
   Registrieren vor). Wer gründet, bekommt **nach** dem Registrieren einen kurzen
   Einrichtungs-Assistenten (Abteilungen, Teams, Hallen), direkt auf dem Server.
4. **Profilbilder auf dem Server** (Speicher, Regeln wer welches Bild sieht); dann auch in
   den Kreisen bei „Abwesend und verspätet“.

## Was die Demo zeigt (Abdeckung)

| Funktion | Wo im Demo-Verein |
|---|---|
| Verein, zwei Abteilungen, geteilte Halle | Basketball und Volleyball teilen die Sporthalle Nord (Di U18, danach Damen 1) |
| Teams mit und ohne Belastung | U16 und Damen 1 mit, U18 ohne |
| Trainerrollen, offene Einladung | Head Coach, Co, Athletik, Teammanager (Einladung offen) |
| Abteilungsleitung, Vereinsadmin, Schreibrechte | Frank Meyer (Basketball), Claudia Brandt; Volleyball ohne Leitung |
| Funktionen vom Verein festgelegt | Fahrgemeinschaften „an für alle“ |
| Serien, Einheiten, Spiele heim/auswärts, Besprechung online | Wochenplan, Auswärtsspiel mit Adresse, Besprechung mit Video-Link |
| Zu-/Absagen, verspätet mit Grund, keine Antwort, selbst zusagen | zufällig verteilt, zwei Spieler sagen selbst zu |
| Abwesenheiten | Verletzung (U16), Urlaub (U18, nächste Woche) |
| Kader veröffentlicht | nächstes U16-Auswärtsspiel |
| Anwesenheit bestätigt | letztes U16-Training |
| Fahrgemeinschaft | Angebot mit Abfahrt, Treffpunkt-Pin, Mitfahrer, Platzanfrage |
| Belastung: Ampeln, ACWR, offene Bewertungen, Prüfbitte | gemischt grün/gelb/rot; Demo-Spieler im grünen Bereich; Trainer bittet um Prüfung |
| Eltern-Einwilligung | Paul (erteilt), Ben (offen) |
| Nachrichten, wichtig/angeheftet, Umfrage, Erinnerung, News | Team, Verein, beide Abteilungen |
| Eigene Pläne der Spieler | Kraft-Serie, Regeneration |

Nur im Server-Modus und deshalb nicht in der Demo: Apple-Kalender-Import, Push, echte
Einladungslinks und Beitritt per Code.
