# Konzept: Trainerkarte (noch nicht gebaut)

Stand 2026-10-25. Ben: „halte die Trainerkarte erstmal als Konzept fest, wir bauen sie noch nicht.“

## Idee

Wie die Spielerkarte (Run 95–100), aber für Trainer und Betreuer: eine eigene Karte mit Enthüllung, wenn das Profil nach der Einladung fertig ist. Sie macht den Einstieg für Trainer genauso besonders und gibt ihnen einen Grund, dass auch ihre Spieler ihre Karten fertig machen.

## Inhalt der Karte

- Foto, Name, Rolle im Team (z. B. „Head Coach“, „Co-Trainer“, „Athletiktrainer“), Team mit Logo, Verein · Abteilung.
- Optional: Trainerlizenz (z. B. C-, B-, A-Lizenz, frei eingebbar), „Trainer seit“ (Jahr), Schwerpunkt (z. B. Athletik, Torwart).
- Keine Körperdaten (Größe, starke Seite gehören zur Spielerkarte).

## Aussehen

- Eigene Farbe, damit man Trainer auf einen Blick erkennt: Silber/Blau statt Gold/Grün; Rückseite mit Teamlogo.
- Gleiche Enthüllung (Pack, Aufladen, Blitz, Umdrehen), gleiche Bausteine (`CardReveal`), nur andere Farben und Felder.

## Ablauf

- Einladung annehmen → kurzer Assistent wie bei Spielern (Name ist schon bekannt): Foto · Lizenz und „seit“ (überspringbar) · Zustimmung → Enthüllung → Konto bzw. Annehmen.
- In den Einstellungen „Meine Karte ansehen“ wie bei Spielern.

## Dazu passend (später)

- **Kartengalerie fürs Team:** der Trainer sieht seine Spieler als Karten (Foto, Nummer, Position), unvollständige halb ausgegraut mit „Profil 60 %“; ein Knopf erinnert die Spieler ans Fertigmachen.
- Teilen der eigenen Karte als Bild (z. B. für Instagram-Story).

## Was es bräuchte

- Migration: `staff_details` (person_id, license text ≤ 30, coaching_since smallint, focus text ≤ 30), lesen wie die Spielerdaten, schreiben nur man selbst; Test wie `32_player_profile_test.sql`.
- `CardReveal` mit einer Variante `staff` (Farben, Felder), Assistent-Schritte für Trainer, i18n in vier Sprachen.
