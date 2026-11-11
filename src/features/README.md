# Features

One folder per product area. A feature reads and writes only through
`@/shared/data` and shows text only through `t()`; shared building blocks live
in `@/shared/components`.

| Folder | What it holds |
|---|---|
| `absences` | Away for a while (injured, sick, holiday), for players and coaches |
| `access` | Signing in (e-mail first), the access gate, signing out |
| `calendar` | The shared calendar engine (`SmartSessionCalendar`), hall calendars, calendar link, Apple Calendar |
| `club` | Club overview, departments, halls for the club admin |
| `errors` | Error reporting and the problem report button, `/reports` for operators |
| `facilities` | Halls and their addresses |
| `identity` | Switching between one's roles (coach, player, club) |
| `install` | Installing the app, staying signed in on the home screen, service worker |
| `landing` | The public landing page and imprint |
| `legal` | Consent (terms, health data, parents), legal pages, team health settings |
| `load` | Training load: rating sessions, the player's load workspace, charts, own training |
| `messages` | Messages, polls and news for staff and players |
| `notifications` | Push notifications |
| `onboarding` | New here, the demo bar, joining, founding a club, the player card wizard |
| `people` | Photos, the player card and its reveal |
| `playbook` | Playbooks and tactics |
| `players` | A player's load detail for coaches |
| `privacy` | The privacy policy |
| `role-workspaces` | The coach and player shells, Today for coaches, session sheets |
| `sessions` | Session details, availability, carpools, meeting points, series |
| `settings` | Settings for everyone |
| `sports` | What the app knows about each sport (positions, numbers, game length) |
| `teams` | The team workspace, staff and roles, features, logos |
