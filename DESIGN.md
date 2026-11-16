# Club OS — Design

How Club OS looks, feels and behaves. Read this before any UI work; the code
that implements it lives in `src/app/globals.css` (tokens and the `os-*`
components) and in the feature folders.

## Feel

**Floodlight.** A game under the lights: a deep midnight page, surfaces that
are lit from above and rise in clear steps, bright type, and one electric
green for what you do next. A soft light in the colour of your role sits at
the top of every page. Colour beyond that appears only where something has a
status. The stadium energy peaks in one place, the player card.

Club OS should feel **calm, fast, operational and premium**: nothing flat or
grey, nothing decorated for its own sake. It should not feel playful, form-
heavy, or like a generic dashboard or a spreadsheet.

**Less is more.** Every screen answers one real question and shows the one
next step.

**A text stays** if it lets the reader decide something, explains a real
error, or makes a flow understandable that is not obvious (a chart whose bars
can be tapped, what "automatically in" means). **It goes** if the field name,
the picture, the status or the action already says it: under "E-mail" there
is no "Enter your e-mail address" (Ben, 2026-11: "das ist doch
selbsterklärend").

| Who | The question their screens answer |
|---|---|
| Coach | Who is coming today, who is late or missing and why, who needs load attention? |
| Player | What is next, what do I have to answer, how am I doing? |
| Club | Is everything set up, and are the right people in the right roles? |

## Foundations

The tokens live in `tailwind.config.ts` (the palette, type scale and radii
behind the Tailwind names) and at the top of `src/app/globals.css` (CSS
variables and the `os-*` classes). A screen uses these and never spells a raw
colour.

**Colour** (dark only, `color-scheme: dark`)

| Token | Value | In code | Use |
|---|---|---|---|
| `ground` | `#080b14` | `bg-ground`, `--ground` | the page |
| `surface-1` | `#111727`, lit from above | `os-panel`, `os-sheet` (`slate-950`) | the panel a section sits on; sheets |
| `surface-2` | one step lighter | `os-tile` | a row, tile or group inside a panel |
| `surface-3` | `#232c45` | `bg-white/[0.09]`, `--surface-3` | chips, pressed and active states |
| `line` | blue-white 9 % | `--line`, `border-slate-800` | dividers, the hairline of a panel |
| `line-strong` | blue-white 18 % | `--line-strong`, `border-slate-700` | the outline of fields and quiet buttons |
| `text` | `#f6f8ff` | `text-white`, `text-slate-50` | headlines, values, anything to act on |
| `text-2` | `#c0c9e2` | `text-slate-300` | body copy (about 10:1 on a panel) |
| `text-3` | `#a1acc9` | `text-slate-400` | meta text; the dimmest text allowed (about 7:1) |
| `go` | `#4eeda8` → `#1fd6b6` | `emerald-300`, `os-success`, `--go` | the main action (as a short gradient with its own glow), "in", "done", good load |
| `info` | `#93b4ff` | `sky-300`, `--info` | links, the focus ring, information, "too little" on the load scale |
| `warn` | `#fcd34d` | `amber-300`, `--warn` | attention (overdue, unanswered), and the gold of the player card |
| `stop` | `#ff7385` | `rose-400`, `--stop` (`red` is the same ramp) | absences, overload, destroying something |

- **Depth comes from light.** The page is the darkest thing. A panel is
  lighter, has a brighter top edge (as if lit from above) and a soft shadow
  below; a tile in it is lighter again. Nothing is grouped by an outline.
- **The role light.** The top of every page carries two soft glows
  (`.os-page`, `--aura-1/2`): green for the player, blue for the coach,
  violet for the club. It scrolls away with the page and never sits behind
  text you have to read.
- **Colour is status.** Green = good or go, amber = look at this, red =
  missing or dangerous, blue = information. Tiles, cards and meta text are
  neutral; the value, a chip, a dot or a bar carries the tone.
- **Selection is neutral.** The chosen tab, segment or day is a light fill
  with dark text (`bg-slate-100 text-slate-950`); in the navigation it is a
  lit surface with a green icon. Blue and green fills are not selection.
- `slate-500` and darker are not text colours (borders, disabled controls).
- Hall colours and session-type colours are data colours: an edge, a dot or
  a chart series, never a fill behind text.

**Type.** Inter, shipped with the app (`next/font`), with tabular digits
everywhere (counts and times do not jump when they change).

| Role | Size / line | Weight | In code | Use |
|---|---|---|---|---|
| `display` | 26 / 32 (desktop 34 / 40) | 760 | the shell's `h1`; `os-title` on entry pages | the page title, one per page |
| `title` | 19 / 26 | 650 | `text-lg font-semibold` | panel and sheet titles |
| `heading` | 17 / 24 | 650 | `text-base font-semibold` | a row's main line, card titles |
| `body` | 15 / 22 | 400–500 | `text-sm` | sentences, messages, explanations |
| `label` | 15 / 22 | 650 | `text-sm font-semibold` | buttons, field labels |
| `caption` | 13 / 18 | 500–650 | `text-xs`, `os-caption` | meta lines, time stamps, chips, section labels |
| `metric` | 26–32 | 760, tabular | `text-2xl font-bold` | the one number a tile is about |

- **Three weights** (Inter is a variable font; the Tailwind names are mapped
  in `tailwind.config.ts`): `font-bold` 760 for the page title and the big
  numbers, `font-semibold` 650 for titles, labels and names, `font-medium`
  500 at most for everything read as a sentence or a meta line.
- **13 px is the smallest text** (`text-xs`), 15 px the size of a sentence
  (`text-sm`). Exceptions, because the alternative is no label at all: the
  tab bar's labels and chart axes (11–12 px) and the seven-day grid on a
  phone, whose columns are 45 px wide (10 px).
- **Sentence case.** Section labels are small quiet captions, not spaced
  capitals. The only uppercase is the "CLUB OS" kicker and the weekday on a
  date chip.
- Headlines are balanced (`text-wrap: balance`): no single word alone on the
  last line. Text never truncates where it is the answer (names, times,
  places, status); only meta lines may end in "…".

**Space.** A 4 px base; only these steps: 4, 8, 12, 16, 24, 32, 48.

- Page gutter 16 (phone), 32 (desktop). Panel padding 16 (phone), 20–24
  (desktop). Between panels 20; between a panel title and its content 12;
  between tiles 8–12; inside a control 12 × 16.
- Reading width is at most 720 px for forms, feeds and single-column pages; a
  wide screen gets a second column, not wider lines.

**Shape.** Three sizes by the size of the thing: panels and sheets 22
(`rounded-3xl`), tiles and rows 16 (`rounded-2xl`), fields and buttons 13
(`rounded-xl`); chips, avatars and switches are round. Where the browser can
(`corner-shape: squircle`), corners curve continuously. No arbitrary radius.

**Depth.** Three levels: the page, a panel on it, tiles in the panel. Only
things that float cast a strong shadow: sheets, dialogs, the toast, the tab
bar. Panels do not blur what is behind them; the page head, the side bar and
the tab bar do.

**Layout.** Mobile first and checked at 375 px: nothing may scroll sideways
(the smoke test fails if it does). On the phone a floating tab bar; from `md`
a fixed side bar. Safe areas on iPhone are respected (page head, tab bar,
sheets, toasts). Touch targets: what looks small is still easy to hit, the
target reaches 8 px past the edge of every button on touch screens.

## Components (`src/app/globals.css`)

| Class | What it is |
|---|---|
| `os-page`, `os-container` | the page (`ground` with the role light) and its width |
| `os-panel` | the working surface: lit from above, 22 px corners, a hairline, a soft shadow |
| `os-tile`, `os-panel-soft`, `os-metric` | a tile inside a panel: one step lighter, no border |
| `os-rows` | children separated by a `line` (lists, the "what is new" panel) |
| `os-row` | a list row: 56 px min, the whole row is the target |
| `os-stack` | a panel that hides itself when it has no children |
| `os-sheet` | the frame of everything that opens over the page (see below) |
| `os-tabbar`, `os-tab` | the phone's floating tab bar and its entries |
| `os-nav-item` | an entry of the desktop side bar |
| `os-hero`, `os-kicker`, `os-title`, `os-copy` | the head of an entry page: a plain bar, not a box |
| `os-field`, `os-textarea`, `os-label` | inputs: set into the surface, a blue ring when focused |
| `os-success` | the one main action of a surface: the green gradient with its glow |
| `os-primary` | a filled light action, where green would mean "done" |
| `os-secondary` | everything else: a quiet outline |
| `os-danger` | destroying something: red text on a red tint, inside a confirm step or at the end of a page |
| `os-link` | a text action in `info` |
| `os-chip`, `os-chip-go`, `os-chip-warn`, `os-chip-stop` | a status: a word on a tint, never colour alone |
| `os-caption` | a section label inside a panel |
| `os-toast`, `os-toast-action` | one line at the foot of the screen, with at most one action ("Undo") |
| `os-skeleton` | a placeholder in the shape of what is coming |
| `os-kbd` | a key on the keyboard, as text |
| `os-enter`, `os-pop` | motion helpers (see Motion) |
| `os-empty` | an empty state |

Every button or link filled with the brand green (`bg-emerald-300`) gets the
gradient and glow of `os-success` automatically; do not rebuild it.

Shared pieces worth reusing before building new ones: `SmartSessionCalendar`
(one calendar engine for every role), `LoadDial` (the load as a half-circle
scale: the player's start page, the load page, the coach's player sheet),
`DateChip` (a day as a small calendar leaf), `PersonAvatar` / `PhotoPicker`,
`PlayerCard` / `CardReveal`, `SideSwitch` (segmented control),
`PositionPicker`, `AppConfirmDialog`, `TeamLogoBadge`, `ProfileMeter`,
`CommandMenu`, and the overlay pieces in `src/shared/overlay` (`useEscape`,
`showToast`).

Use the `os-*` classes; do not rebuild a panel, tile, button or field from
utility classes in a feature file.

**Buttons.** Height 44–48 (main), 36–40 (inside rows and toolbars). One
`os-success` per surface. A press sinks a little and comes back (every button
and link, at once); hover changes the fill. Destructive actions never sit as
a link next to everyday content: they live at the end of the page or behind
"…", and always confirm with `AppConfirmDialog`.

**Sheets (`os-sheet`).** Session details, rating, editing, player details,
the role switch, confirmations, the command menu: one frame over a `black/60`
scrim. Each is `role="dialog"`, labelled, and registers its "close" with
`useEscape`, which gives all of them the same behaviour:

- Escape closes the one on top (never two at once),
- the phone's "back" closes it where the browser offers that (`CloseWatcher`,
  Android; no history entries are added, so moving between pages is never
  disturbed),
- on a phone it shows a grab handle, follows the finger and closes when
  pulled down far or fast enough; a short pull springs back. Sliders, text
  fields, maps and scrolled content keep their own gesture.

Inside, the same rules as on a page: tiles without borders, one green action.

**The shell.** Phone: a sticky head (title, one meta line, the demo pill, the
avatar) and a floating tab bar; the active tab is a lit pill with a green
icon. Desktop: a fixed side bar with the brand mark; the active item has a
green edge. `⌘K` / `Ctrl K` opens the command menu (every page of the role,
type to narrow, Enter to go); `Alt 1 … 9` jump straight there.

**What is new.** Unread messages, the player-card nudge and a new playbook
are rows of one panel at the top of Today (`os-panel os-rows os-stack`), not
three cards in three styles. The whole row is the link.

**Dashboards.** The player's Today shows the load as one card (the dial, the
word that says how they stand, the room that is left) and the next session
with a date chip and the answer under it. The coach's Today shows each
session's attendance as one bar (coming, missing, open) above the three
counts, then only the exceptions.

**Page head.** Title (`display`) and at most one meta line that carries
information the page does not show elsewhere (the date, the team). No
subtitle that describes the page. The demo switch is a single small pill in
the head, not a full-width bar above the content.

**Lists.** One row height and one row anatomy per list. Meta is `text-3`,
never coloured, and shows only what differs between rows or what the reader
came for. Status sits right, as one chip. Lists longer than about eight rows
get a filter or a "Show all".

**Numbers and charts.** A tile is neutral; its value carries the tone and one
word says whether it is good. The load is always the same picture
(`LoadDial`). Charts are drawn at the width they really have, so labels keep
their size on a phone; at most five ticks per axis, a legend in words, the
selected value written out; never rely on colour alone.

## States

Every surface that shows data defines all five; a review checks each.

- **Loading:** a skeleton in the shape of the content (`ScreenSkeleton`,
  `LoadingPage`, `os-skeleton`), never a spinner or a "Loading …" sentence,
  never a layout jump when data arrives. A photo fades in over the initials.
- **Empty:** one calm line that says what will appear here and, if the reader
  can cause it, the one action that does. No illustration, no warning colour.
- **Error:** what happened, in the reader's words, and what to do now. The
  entered text is never lost. Errors appear next to what failed.
- **Saved:** a change shows at once where it was made; the server is told in
  the background and, if it refuses, the screen goes back to what the server
  holds and says so (`remoteStore`). No "Saved" banners. Something removed
  that can come back offers "Undo" in a toast (`showToast`).
- **Unsaved:** anything created by tapping (a draft session, a typed message)
  either saves itself or asks before it is thrown away. "Done" never discards.

## Patterns

1. **One dominant action per surface.** Filled green for the main action,
   outline for the rest, red only for destroying something.
2. **Context beats questions.** Where the team, department or hall is known, do
   not ask again. Forms ask only for what is missing.
3. **One question per screen** for anything new people fill in (the player card
   wizard, sign-in): a big question, the field, "Continue". Optional steps say
   "Skip for now" until something is entered. Progress is always visible.
4. **Lists over chip clouds.** Choices with more than a handful of options are a
   list or a dropdown (grouped where it helps, e.g. positions by line); chips
   only for two to four quick toggles.
5. **E-mail first.** Sign-in asks for the address alone; the server decides
   whether the next screen is "password" or "create account". New passwords are
   typed twice with live checks.
6. **Small print stays one tap away.** Legal links sit inside the sentence that
   needs them, or in one quiet grey line at the foot (the imprint must stay
   reachable from every page). Longer explanations go behind "What does this
   mean?".
7. **Warnings only for real problems.** No warning-shaped placeholders; if all
   is well, say nothing or "Ready".
8. **Same everywhere.** The demo club and real clubs use the same screens.
   Coach and player share one calendar engine that adapts to context.
9. **Never block a first look.** A new visitor sees the app before any dialog
   asks something of them.
10. **Teach while they use it.** A page's tips show when that page is first
    opened, not all at once on the start page. One small bubble at a time
    points at a real control (`TipLayer`, `data-tip`), the rest dimmed but
    usable. Where there is something to do, the tip is a step that waits for
    it: in the calendar "tap the pencil", "tap a free time", "drag it", "pull
    the bottom edge", "open it", each moving on when done. "Got it" or "Skip",
    "No more tips", and "Show the tips again" in the settings. One short
    sentence per tip, never a tour that plays by itself.
11. **The answer is on the card.** Anything asked of many people often
    (coming or not, a rating, a vote) is answered where it is shown, in one
    tap, without opening a sheet. A reason is asked only when declining, from
    a short list ("Ill", "School", "Family", "Other…").
12. **The next thing is easy to reach.** What has a time or a deadline (the
    next session with its answer, the open rating) is never more than one
    glance away, and at most one nudge card sits on a page at a time; the
    others wait. The player's Today keeps its order (Ben, 2026-11-13:
    messages, card and numbers stay above "Next up").
13. **One fact, one place.** A person, a count or a status appears once per
    screen. If two blocks would show the same player or number, merge them.
14. **A choice takes effect on what depends on it.** Declining a game frees
    the seat in the car; leaving a team ends its reminders. The app does the
    follow-up, not the person.

## Ben's rules (owner feedback, binding)

Collected from Ben's reviews of real screens (October–November 2026). They
apply to every new and changed screen; a review flags any break.

**Text and small print**

- No subtitle or helper sentence that repeats what the screen already says
  ("Choose a password", "Pick what fits you", "Everything starts with your
  e-mail"). The headline and the field are enough.
- No small print on the screen. Legal links go inside the sentence that needs
  them ("I accept the terms and the privacy policy"); longer explanations
  (health data, what happens without consent) sit behind "What does this mean?".
- The foot of entry pages carries one quiet grey line only: Imprint · Privacy ·
  Terms (required by law on every page). No extra demo links or repeated legal
  rows above it.
- No big header box where a small bar does: on sign-in only "Club OS" and the
  language, then straight to the question.
- Ask only what is needed now. Signing up asks e-mail, password twice and the
  terms; birth year and health data come when joining a team, where they
  matter.

**Choices and inputs**

- No chip clouds ("KI-Slop"). More than a few options become a dropdown or a
  list, grouped where it helps (positions by line, with short forms like
  "Point Guard (PG / 1)" in the list; cards and lists show the name only).
- Never show the same choice twice (a text field and chips for the same value).
- Numbers you slide, not type, where a range is natural: height, birth year
  (with − / + to fine-tune).
- Two or three exclusive options are one segmented switch, not separate pills.
- Things the app knows are not asked: the sport comes with the team's link; a
  shirt number is only asked in sports that have fixed numbers (football,
  basketball, handball, volleyball, hockey) and teams that use them.
- New passwords are typed twice, with live checks (length, match).

**Flow and progress**

- One question per screen for anything people fill in for the first time, with
  "Step x of y", a visible progress bar and the result growing live (the player
  card fills in and shows its percentage).
- Optional steps can be skipped ("Skip for now"); what is still missing is
  offered later, quietly (the card on Today, "x/5").
- Back (button and swipe) always goes one step back and never loses what was
  entered, also after a reload or leaving the page.
- Sign-in starts with the e-mail alone; the server decides "password" or
  "create account".
- Joining is professional, not playful (2026-11-12): the team comes first
  (its link, or the code typed in, shows logo, club, department and team with
  one "Join"), then sign-in or the account, and only then name, birth year
  and consent; the player card follows as optional steps. The demo is an
  option next to the real way in, never a loop back into it.
- The landing page lets the design speak: headline, "Get started" and "Try
  the demo", the real screens. No subline, no notes under the buttons, no role
  chips; "Sign in" sits in the top bar on every screen size.
- A first visit is never blocked by a dialog (no rating prompt popping up in
  the demo before anything was seen).

**Look**

- Make the moments that matter feel special: the player card is a real card
  (own photo, gold number, team logo, club and department, foil, glints) with an
  NBA 2K style reveal the first time it is complete (also when only the number
  was skipped).
- Compact rows over big boxes: attendance is a rate, three counts, one mark per
  session and only the exceptions, one line each.
- Never show the same thing twice on one screen (e.g. the player's name above
  and inside the card).
- Nothing may be cut off or push past the screen edge at 375 px.

## Motion

Short, purposeful, and off with `prefers-reduced-motion`.

- **Slow in, slow out.** One easing for what moves across the screen
  (`--ease`), and a spring for what lands (`--ease-spring`): a sheet rises
  with a slight overshoot, a toast and a changed answer (`os-pop`) land the
  same way.
- **Squash.** A press sinks every button, tab and link to 97 % and lets go
  again; it answers at once.
- **Interruptible.** State changes are transitions, not fixed animations: a
  pulled sheet follows the finger and can be let go at any point; hover and
  press reverse mid-way.
- **Arriving.** The content of a page fades in block after block (`os-enter`,
  45 ms apart); the head and the tab bar stay put. Opacity only, so sheets
  that open inside a block are never dragged along.
- Durations: 120–150 ms for a press or toggle, 200 ms for a chip or row
  changing, 300–400 ms for a sheet or a page arriving.
- Nothing loops on a working screen except a skeleton's sweep (loops belong
  to the landing page and the card reveal).
- Steps slide in (`wizard-step`), a growing card pops once (`wizard-pop`).
- The player card reveal (`CardReveal`, NBA 2K style) is the one big moment: the
  card arrives face down, charges and shakes, bursts with a flash, sparks and a
  shock wave, flips to its front; afterwards it tilts with the finger or the
  phone. A tap skips it. It plays once per device, then on demand.

## Writing

- English is the source language; every text is in all four catalogues
  (`src/shared/i18n/messages/{en,de,fr,es}.json`), informal (du / tu / tú).
- Short and concrete: "Wo spielst du?" rather than a sentence about positions.
  Buttons say what happens ("Join team", "Create account").
- Dates and numbers through `@/shared/format`. One date shape per kind of
  place: "Sa. 14. Nov. · 11:00" in rows and sheets, "Samstag, 14. November"
  as a page meta line, "heute" / "morgen" / "gestern" when it is that close.
  Decimals follow the language ("1,5 Std.").
- One word per thing, in every language. German:

  | Thing | Word | Not |
  |---|---|---|
  | coach, head coach | Trainer, Cheftrainer | Coach, Head Coach |
  | session | Einheit (Training, Spiel as its kind) | Termin, Teameinheit |
  | answer to a session | Zusagen / Absagen; "Dabei", "Später", "Abgesagt" | Verfügbarkeit, Abgemeldet |
  | load terms | Belastung, RPE, ACWR (explained on first use) | Beanspruchung without explanation |
  | player groups | the club's own names, shown as typed | — |

- A button names the result ("Absagen", "Einheit speichern"), never the
  mechanism ("Verfügbarkeit speichern"). The same action has the same label
  everywhere.
- No sentence under a headline that restates it, no hint under a button that
  the button already says (see Ben's rules); this includes sheets and dialogs.

## Accessibility

- Every control has a name (labels, `aria-label` where there is no visible
  text, no buttons inside labels), and every page has one `h1`.
- Focus is visible on every control: a 2 px `info` ring with 2 px offset
  (`:focus-visible`), set once in `globals.css`, never removed with
  `outline-none` without a replacement.
- Touch targets reach at least 44 px (small controls through their enlarged
  hit area). Text is at least 13 px and at least 7:1 against a panel for
  anything read (`text-3` is the floor).
- Colour is never the only signal: a status has a word or an icon.
- Everything that opens over the page is a dialog (see Sheets): labelled,
  closed by Escape, by "back" and by a pull down.
- The keyboard reaches everything: `⌘K` / `Ctrl K`, `Alt 1 … 9`.
- Zoom stays possible in the browser; text follows the system font size up to
  130 % without anything being cut off.

## Review checklist

A screen is ready when all of these are true at 375 px and 1280 px:

1. One `h1`, one filled main action, the next step visible without scrolling.
2. No outlined box inside a box; no text under 13 px (the named exceptions
   aside); no `slate-500` text; colour only where something has a status.
3. Nothing truncated that the reader needs; nothing scrolls sideways.
4. Nothing shown twice; every sentence passes the "a text stays if" test.
5. Loading, empty, error, saved and unsaved are defined.
6. Words match the glossary; dates match the one shape.
7. Keyboard: every control reachable, focus visible, Escape closes.
