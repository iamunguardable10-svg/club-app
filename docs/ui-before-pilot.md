# UI vor dem Pilot

Ben, 2026-11-14. Der Pilot startet erst in einigen Wochen. Gewünscht ist eine
Überarbeitung mit Claude Fable 5.2, keine neue Produktarchitektur.

## Maßstab

Die Vereinslogik ist gut durchdacht. Die Oberfläche soll ruhiger, übersichtlicher
und intuitiver werden. Ein Text bleibt, wenn er eine Entscheidung ermöglicht,
einen echten Fehler erklärt oder einen nicht offensichtlichen Ablauf verständlich
macht. Er entfällt, wenn Feldname, Grafik, Status oder Handlung bereits dasselbe sagen.
Beispiel: Unter „E-Mail“ braucht es kein „Gib deine E-Mail-Adresse ein“.

Weniger Zwischenüberschriften, Karten in Karten, gleich wichtige Akzente und dauerhafte
Erklärungen. Eine klare Hauptaktion pro Ansicht. Details erst dort zeigen, wo man sie
braucht. Aussagekräftige Labels und barrierefreie Feldnamen bleiben; erforderliche
Einwilligungen, Rechtehinweise und sicherheitsrelevante Konsequenzen nicht verstecken.
Die jüngeren Nutzer bedienen sich intuitiv, die App muss trotzdem auch für neue
Trainer und Vereinsverantwortliche verständlich bleiben.

## Vorgehen für Fable 5.2

1. `AGENTS.md`, `DESIGN.md`, `docs/core-flows.md`, Entscheidungen und Run-Log lesen.
   Das Audit `docs/audit/2026-11-fable.md` ist bereits vorhanden. Zuerst feststellen,
   welche Befunde durch Runs 112–125 erledigt sind. Nicht erneut umsetzen und keine
   damals abgelehnten Produktentscheidungen stillschweigend zurückholen.
2. Den aktuellen Stand auf Handy und Desktop durchgehen: Einstieg, Registrierung,
   Beitritt, Spieler-Heute, Kalender, Zu-/Absagen, Fahrten, Belastung, Trainer-Heute,
   Einheit/Anwesenheit, Team, Nachrichten, Verein und Einstellungen. Je Rolle konkrete
   verbliebene Doppelungen, unklare Hauptaktionen und unnötige Schritte festhalten.
3. Änderungen nach zusammenhängenden Abläufen priorisieren. Je Stück ein kleiner PR
   mit vorher/nachher und vollständigen Prüfungen. Erst Sprache/Hierarchie/gemeinsame
   Komponenten, dann verbleibende Ablaufprobleme. Neue Funktionen und Rollenrechte
   sind eigene Entscheidungen, keine vermeintliche Designbereinigung.
4. Zum Schluss alle Kernabläufe als Spieler, Trainer und Verein auf 390 px und Desktop
   prüfen, anschließend Anmeldung und Mails auf der echten Domain. Keine Tests gegen
   produktive Vereinsdaten. Pilotfreigabe nach dieser Gesamtabnahme.

## Abnahme

- Auf jedem Bildschirm ist erkennbar, was wichtig ist und was als Nächstes zu tun ist.
- Kein Erklärungstext wiederholt nur eine sichtbare Beschriftung oder Grafik.
- Keine Funktion oder notwendige Information geht verloren; Details bleiben auffindbar.
- Lesbare Texte, 44-px-Tippziele, sichtbarer Fokus und zugängliche Dialoge.
- Keine abgeschnittenen Eingaben, seitliches Scrollen oder verdeckte Hauptaktionen.
- Deutsch, Englisch, Französisch und Spanisch; Demo und Club-Server teilen die UI.
- Typecheck, i18n, Build und Browser-Smoke grün; betroffene Kernabläufe wirklich bedient.

Die Modellwahl ist im ausführenden Claude-Werkzeug zu treffen. Dieser Auftrag wurde
hier vorbereitet; damit ist keine Ausführung durch Fable 5.2 behauptet.
