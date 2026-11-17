# Onboarding v2: kleine Schritte, App zuerst (2026-11-17)

Löst den ausgesetzten Onboarding-Punkt in `CLAUDE.md` ab. `docs/plan-onboarding.md` bleibt als Verlauf.

## Grundsätze

- **Ein Schritt pro Bildschirm.** Jeder Schritt hat eine Frage oder Aktion und einen Fortschrittsbalken. Keine Formularwände.
- **Früher Erfolg.** Spieler sind nach Code → Konto → Name/Jahrgang im Team und sehen ihre nächste Einheit. Trainer sehen nach der Einladung ihr Team und den ersten offenen Schritt.
- **Lernen durch Tun.** Erklärt wird da, wo man es braucht: die Standardhalle beim Festlegen, Gruppen und Playbook als optionale erste Schritte, die Belastung in `LoadIntro`. Erklärseiten vorab gibt es nicht.
- **Ruhiger Ton.** Kurz, „du“, keine Ausrufezeichen. Alles Optionale lässt sich überspringen oder später nachholen.
- **Eine Oberfläche.** Demo und echter Verein nutzen dieselben Schritte (`RoleShell`, `AfterJoin`, Team-Startseite).

## App zuerst (Beta-Einstieg)

Am Handy oder Tablet im Browser bieten Team-Link (`/join?code=`), Einladung (`/join?invite=`) und Startseite zuerst die App auf dem Home-Bildschirm an (`InstallFirst`).

| Lage | Was passiert |
|---|---|
| Android mit Installieren-Dialog | Ein Knopf „Installieren“, danach „Öffne Club OS auf deinem Startbildschirm“ |
| iPhone/iPad | Die Safari-Schritte (Teilen → Zum Home-Bildschirm) |
| Browser in einer anderen App (Instagram, Facebook …) | Installieren geht nicht: „Im Browser öffnen“ oder Link kopieren |
| App schon installiert | „Hast du die App schon?“: Code zum Eintippen bzw. Link zum Einfügen unter „Neu hier“ |
| Desktop, oder schon in der App | Kein Schritt, es geht direkt weiter |
| „Im Browser weitermachen“ | Wird eine Woche auf dem Gerät gemerkt |

**Übergabe in die App** (`installHandoff.ts`): Browser und installierte App teilen keinen Speicher. Deshalb steht alles Nötige in der Startadresse, und zwar in der Seitenadresse und im Manifest (`/install.webmanifest?next=…&lang=…&handoff=…`), je nachdem, welche das Handy nimmt:

- `next`: der Weg hinein (nur `/join` und `/found`). Die App startet genau dort.
- `lang`: die gewählte Sprache.
- `handoff`: nur wenn man im Browser schon angemeldet war. Ein Einmalcode (10 Minuten, einmal gültig), den die App gegen eine eigene Anmeldung tauscht. Ist er abgelaufen, meldet man sich im Schritt „Konto“ des Wegs einmal an.
- `src=app`: Der Start kommt vom Home-Bildschirm. Ist der Weg auf diesem Gerät schon erledigt (`hasJoinedOnThisDevice`), geht ein späterer Start auf `/start` statt wieder zu „Beitreten“.

Abgebrochen mitten im Weg: Der nächste Start vom Home-Bildschirm führt wieder in denselben Weg. Entwürfe (Name, Einwilligung) liegen im Speicher der App.

**Store später:** `STORE_LINKS` in `installPrompt.ts`. Ist dort ein Link gesetzt, zeigt der Schritt „App holen“ statt der Home-Bildschirm-Schritte. Eine native App gibt es nicht.

## Wege nach Rolle

**Spieler:** Team-Link → (App) → Team-Karte → Beitreten → Konto → Name, Jahrgang, Einwilligung → Heute. Direkt danach, je ein Bildschirm (`AfterJoin`):

1. **Wie sagst du zu?** Nur im ersten Team. Zur Wahl stehen „Automatisch dabei“ (du giltst als dabei und sagst nur ab, wenn du nicht kannst) und „Selbst zusagen“ (bis du antwortest, sieht dich der Trainer als offen). Es ist dieselbe Einstellung wie unter Einstellungen und gilt für alle Teams. Bei jedem weiteren Team gilt die bisherige Wahl weiter (`alignOwnRsvpModes`: „Selbst zusagen“ setzt sich durch, „Automatisch“ ist nur der Standard).
2. Home-Bildschirm, falls nicht schon dort.
3. Benachrichtigungen, falls noch nicht an. Auf dem iPhone geht das nur in der App.

Die **Spielerkarte** bleibt freiwillig: Der Hinweis „Mach deine Spielerkarte fertig“ auf Heute lässt sich wegklicken.

**Trainer und Staff:** persönliche Einladung → (App) → Einwilligung → Konto → Team. Auf der Team-Startseite stehen die **Ersten Schritte**, immer nur der nächste offene, mit Fortschritt:

1. Standardhalle: „Neue Einheiten landen automatisch dort“
2. Spieler: „treten mit Code oder Link bei“
3. Gruppen (optional): Einheiten nur für einen Teil des Teams
4. Playbook (optional, wenn das Team es nutzt): Entwürfe sieht nur der Staff, freigegebene das Team

Gruppen und Playbook sieht nur, wer das Team einrichten darf.

**Abteilungsleitung:** persönliche Einladung vom Verein → Verein mit eingeklappten Abteilungen → Head Coaches einladen.

**Vereinsgründung:** Gründungscode → du → Konto → erste Abteilung und erstes Team (Vorschläge zum Antippen) → weitere Teams und Hallen → Links zum Teilen (`ClubSetup`). Das passiert meist am Rechner. Am Handy gibt es auf der Startseite den Hinweis „Am besten als App aufs Handy“.

## Offen

- **Auf echten Geräten prüfen:** ob iOS und Android die Startadresse aus dem Manifest übernehmen. Android liest das Manifest beim Laden und schaut nicht immer neu nach. Klappt das nicht, startet die App auf `/start`, und der Code steht unter „Hast du die App schon?“.
- Ob die App schon installiert ist, lässt sich im Browser nicht verlässlich erkennen (iOS gar nicht). Deshalb gibt es den Weg „Hast du die App schon?“.
