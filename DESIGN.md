# Club OS — Design

How Club OS looks, feels and behaves. Read this before any UI work; the code
that implements it lives in `src/app/globals.css` (tokens and the `os-*`
components) and in the feature folders.

## Feel

A calm, dark sports cockpit: precise like Linear, as clear as a good calendar,
with a little stadium energy where a moment deserves it (the player card).

Club OS should feel **calm, fast, operational and premium**. It should not
feel playful for its own sake, over-coloured, form-heavy, or like a generic
dashboard or a spreadsheet.

**Less is more.** Every screen answers one real question and shows the one
next step. If a sentence only explains what the screen already shows, it goes
(Ben, 2026-11: "das ist doch selbsterklärend").

| Who | The question their screens answer |
|---|---|
| Coach | Who is coming today, who is late or missing and why, who needs load attention? |
| Player | What is next, what do I have to answer, how am I doing? |
| Club | Is everything set up, and are the right people in the right roles? |

## Foundations

The values below are the system. Where today's code differs (see
`docs/audit/2026-11-fable.md`), the code moves to these values; new and changed
screens use nothing else. Each token gets one name in `globals.css` /
`tailwind.config.ts`, so a screen never spells a raw value.

**Colour** (dark only, `color-scheme: dark`)

| Token | Value | Use |
|---|---|---|
| `bg` | `#050712` | page background |
| `surface-1` | `slate-950/70` + `slate-800` border | the one panel a section sits on |
| `surface-2` | `white/[0.04]`, no border | a row or tile inside a panel |
| `line` | `slate-800` | dividers between rows |
| `text` | `slate-50` | headlines, values, anything to act on |
| `text-2` | `slate-300` | body copy |
| `text-3` | `slate-400` | secondary and meta text; the dimmest text allowed |
| `go` | `emerald-300` | the main action, "done", good load, progress |
| `info` | `sky-300` | links, focus rings, selection, information |
| `warn` | `amber-300` | attention (overdue, unanswered), and the gold of the player card |
| `stop` | `rose-400` | absences, overload, destructive actions only |

- Colour carries meaning, never decoration: green = good or go, amber = look at
  this, red = missing or dangerous, blue = information. A screen that is all
  well shows no amber and no red.
- `slate-500` and darker are not text colours: on `bg` they fall below 4.5:1.
  They are for borders, icons that repeat a label, and disabled controls.
- One accent per surface. A panel with a coloured border or tint (amber, rose,
  emerald) is a status, so at most one per screen is tinted.
- Hall colours and session-type colours are data colours; they appear only as
  a 3–4 px edge or a dot, never as a fill behind text.
- The page background is flat `bg` with one soft glow at the top. The grid
  pattern belongs to the landing page only.

**Type.** Inter, shipped with the app (`next/font`, self-hosted), so every
device shows the same letters; numbers `tabular-nums`.

| Role | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 30 / 36 (desktop 36 / 40) | 800 | the page title, one per page (`h1`) |
| `title` | 20 / 28 | 700 | panel and sheet titles |
| `heading` | 16 / 24 | 700 | a row's main line, card titles |
| `body` | 15 / 22 | 400 | sentences, messages, explanations |
| `label` | 13 / 18 | 600 | buttons, chips, field labels, meta lines |
| `caption` | 12 / 16 | 500 | time stamps, axis labels, kickers; the smallest size |
| `metric` | 28 / 32 | 800, tabular | the one number a tile is about |

- Nothing below 12 px, anywhere (charts and calendar blocks included). If it
  does not fit at 12 px, show less.
- Weight makes the hierarchy: 800 only for `display` and `metric`, 700 for
  titles, 400 for anything read as a sentence. A screen where everything is
  bold has no headline.
- Kickers (`os-kicker`: caption, uppercase, tracking `0.12em`) are rare: at
  most one per panel, never above every group. Sentence case everywhere else.
- Text never truncates where it is the answer (names, times, places, status).
  Titles wrap to two lines; only meta lines may end in "…".

**Space.** A 4 px base; only these steps: 4, 8, 12, 16, 24, 32, 48.

- Page gutter 16 (phone), 32 (desktop). Panel padding 16 (phone), 24 (desktop).
- Between panels 16; between a panel title and its content 12; between rows 8
  or a `line` divider with 12 above and below; inside a control 12 × 16.
- Reading width is at most 720 px for forms, feeds and single-column pages; a
  wide screen gets a second column, not wider lines.

**Shape.** Three radii, by size of the thing: panels and sheets 24
(`rounded-3xl`), rows, tiles, fields and buttons 14 (`rounded-2xl`), chips,
avatars and switches full. No other radius.

**Depth.** Two levels and no more: the page, and one panel on it. Inside a
panel, content is rows separated by a `line` or `surface-2` tiles without a
border. **Never a bordered box inside a bordered box** (the box-in-box-in-box
look is the main thing that makes a screen feel heavy). Shadows only on
things that float: sheets, dialogs, the tip bubble, the tab bar.

**Layout.** Mobile first and checked at 375 px: nothing may scroll sideways
(the smoke test fails if it does). On the phone a bottom tab bar; from `md` a
side layout with more columns. Safe areas on iPhone are respected. Touch
targets are 44 × 44 px, with 8 px between neighbours.

## Components (`src/app/globals.css`)

| Class | What it is |
|---|---|
| `os-page`, `os-container` | the page and its width |
| `os-panel`, `os-panel-soft` | the working surface (`surface-1`), and the tile inside it (`surface-2`) |
| `os-hero`, `os-kicker`, `os-title`, `os-copy` | page heads |
| `os-field`, `os-textarea`, `os-label` | inputs |
| `os-success` | the one main action of a surface (filled emerald) |
| `os-primary` | a filled blue action, where emerald would mean "done" |
| `os-secondary` | everything else (border only) |
| `os-metric` | a small number tile |

Shared pieces worth reusing before building new ones: `SmartSessionCalendar`
(one calendar engine for every role), `PersonAvatar` / `PhotoPicker`,
`PlayerCard` / `CardReveal`, `SideSwitch` (segmented control), `PositionPicker`,
`AppConfirmDialog`, `TeamLogoBadge`, `ProfileMeter`.

Use the `os-*` classes; do not rebuild a panel, button or field from utility
classes in a feature file. What is missing is added here first, then used:

| To add | What it is |
|---|---|
| `os-row` | the list row: 56 px min, avatar or icon · main line (`heading`) + one meta line (`caption`, `text-3`) · one trailing thing (status chip, value or chevron). The whole row is the tap target |
| `os-chip` | a status: `label` size, full radius, tinted background in `go` / `warn` / `stop` / neutral, always with a word or icon, never colour alone |
| `os-link` | a text action: `info`, `label` size, no underline, 44 px tall hit area |
| `os-danger` | the destructive button: `stop` border and text, only inside a confirm step or a "danger" group at the end of a page |
| `os-sheet` | everything that opens over a page (see below) |
| `os-empty` | an empty state |

**Buttons.** Height 48 (main), 40 (inside rows and toolbars). One `os-success`
per surface. Destructive actions never sit as a link next to everyday content
("Leave team", "Remove", "Delete"): they live at the end of the page or behind
"…", and always confirm with `AppConfirmDialog`.

**Sheets (`os-sheet`).** One implementation for session details, rating,
editing, player details: `role="dialog"`, `aria-modal`, focus moves in and
returns, Escape and a swipe down close it, the page behind does not scroll.
On the phone it rises from the bottom edge with a grab handle and 24 px top
corners; on desktop it is a 480 px side panel. The title and an "×" (44 px)
stay fixed at the top, the one main action stays fixed at the bottom, above
the safe area; content scrolls between them.

**Page head.** Title (`display`) and at most one meta line that carries
information the page does not show elsewhere (the date, the team). No
subtitle that describes the page. The demo switch is a single small pill in
the head ("Demo · Coach ▾"), not a full-width bar above the content.

**Lists.** One row height and one row anatomy per list. Meta shows only what
differs between rows or what the reader came for (a birth year on every
roster row is noise). Status sits right, as one `os-chip`. Lists longer than
about eight rows get a filter or a "Show all".

**Numbers and charts.** A tile shows one number, its unit, and one word that
says whether it is good. Technical terms keep their first-use explanation.
Charts: axis labels 12 px, at most five ticks per axis, a legend in words,
the selected value written out above the chart; never rely on colour alone.

## States

Every surface that shows data defines all five; a review checks each.

- **Loading:** a skeleton in the shape of the content (`Skeleton`), never a
  spinner on an empty page, never a layout jump when data arrives.
- **Empty:** one calm line that says what will appear here and, if the reader
  can cause it, the one action that does ("No sessions this week" · "Plan
  one"). No illustration, no warning colour.
- **Error:** what happened, in the reader's words, and what to do now ("Not
  saved. You are offline; we will try again."). The entered text is never
  lost. Errors appear next to what failed, not only as a toast.
- **Saved:** a change shows at once where it was made (the chip changes, the
  row moves). No "Saved" banners for things the screen already shows; a toast
  with "Undo" for anything removed.
- **Unsaved:** anything created by tapping (a draft session, a typed message)
  either saves itself or asks before it is thrown away. "Done" never discards.

## Patterns

1. **One dominant action per surface.** Filled for the main action, border for
   the rest, red only for destroying something.
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
12. **The next thing first.** A role's start page opens with the thing that
    has a time or a deadline (the next session with its answer, the open
    rating). News, profile nudges and numbers come below it. At most one
    nudge card on a page at a time; the others wait.
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

Short, purposeful, and always off with `prefers-reduced-motion`.

- Durations: 120 ms for a press or toggle, 200 ms for a chip or row changing,
  280 ms for a sheet or a step. One easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Only `transform` and `opacity` move. Nothing loops on a working screen
  (loops belong to the landing page and the card reveal).
- A press answers at once (the control dims or sinks 1 px); the result may
  follow.

- Steps slide in (`wizard-step`), a growing card pops once (`wizard-pop`).
- The player card reveal (`CardReveal`, NBA 2K style) is the one big moment: the
  card arrives face down, charges and shakes, bursts with a flash, sparks and a
  shock wave, flips to its front; afterwards it tilts with the finger or the
  phone. A tap skips it. It plays once per device, then on demand.
- Hover lifts only on things that can be clicked.

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
- Focus is visible on every control: a 2 px `sky-300` ring with 2 px offset
  (`:focus-visible`), set once in `globals.css`, never removed with
  `outline-none` without a replacement.
- Touch targets are 44 × 44 px. Text is at least 12 px and at least 4.5:1
  against its background (`text-3` is the floor).
- Colour is never the only signal: a status has a word or an icon.
- Everything that opens over the page is a dialog (see Sheets): labelled,
  focus-trapped, closed by Escape.
- Zoom stays possible in the browser; text follows the system font size up to
  130 % without anything being cut off.

## Review checklist

A screen is ready when all of these are true at 375 px and 1280 px:

1. One `h1`, one filled main action, the next step visible without scrolling.
2. No box inside a box; no text under 12 px; no `slate-500` text.
3. Nothing truncated that the reader needs; nothing scrolls sideways.
4. Nothing shown twice; no sentence that repeats the screen.
5. Loading, empty, error, saved and unsaved are defined.
6. Words match the glossary; dates match the one shape.
7. Keyboard: every control reachable, focus visible, Escape closes.
