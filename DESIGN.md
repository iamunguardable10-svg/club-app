# Club OS — Design

How Club OS looks, feels and behaves. Read this before any UI work; the code
that implements it lives in `src/app/globals.css` (tokens and the `os-*`
components) and in the feature folders.

## Feel

**Graphite.** A quiet, near-neutral dark surface, white type in a few clear
weights, and one green. Colour appears only where something has a status.
Think of a well-kept scoreboard at night: almost everything is calm, so the
one thing that matters is seen at once. The stadium energy is saved for the
one moment that deserves it (the player card).

Club OS should feel **calm, fast, operational and premium**. It should not
feel playful for its own sake, over-coloured, form-heavy, or like a generic
dashboard or a spreadsheet.

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

The tokens live in `tailwind.config.ts` (the palette and radii behind the
Tailwind names) and at the top of `src/app/globals.css` (CSS variables and
the `os-*` classes). A screen uses these and never spells a raw colour.

**Colour** (dark only, `color-scheme: dark`)

| Token | Value | In code | Use |
|---|---|---|---|
| `ground` | `#0e0f11` | `bg-ground`, `--ground` | the page |
| `surface-1` | `#17191c` | `os-panel`, `os-sheet`, `--surface-1` (`slate-950`) | the one panel a section sits on; sheets; the side bar |
| `surface-2` | one step lighter | `bg-white/[0.04]`, `os-panel-soft`, `--surface-2` | a row, tile or group inside a panel |
| `surface-3` | `#282b31` | `bg-white/[0.08]`, `--surface-3` | chips, the active nav item, pressed states |
| `line` | white 7 % | `--line`, `border-white/[0.06]`, `border-slate-800` | dividers between rows, the hairline of a panel |
| `line-strong` | white 13 % | `--line-strong`, `border-slate-700` | the outline of fields and quiet buttons |
| `text` | `#f7f8fa` | `text-white`, `text-slate-50` | headlines, values, anything to act on |
| `text-2` | `#c2c6cd` | `text-slate-300` | body copy |
| `text-3` | `#a0a5ae` | `text-slate-400` | secondary and meta text; the dimmest text allowed |
| `go` | `#5fe3a6` | `emerald-300`, `--go` | the main action, "in", "done", good load |
| `info` | `#92b8f5` | `sky-300`, `--info` | links, the focus ring, information |
| `warn` | `#fcd34d` | `amber-300`, `--warn` | attention (overdue, unanswered), and the gold of the player card |
| `stop` | `#f27886` | `rose-400`, `--stop` (`red` is the same ramp) | absences, overload, destroying something |

- **Surfaces rise by getting lighter, not by getting an outline.** The page is
  the darkest thing; a panel is lighter; a tile in it lighter again. The
  `slate` ramp is a graphite ramp (hue kept near neutral), so nothing reads
  navy.
- **Colour is status.** Green = good or go, amber = look at this, red =
  missing or dangerous, blue = information. A screen where all is well is
  white on graphite with one green button. Tiles, cards and meta text are
  neutral; only the value, a chip or a dot carries the tone.
- **Selection is neutral.** The chosen tab, segment or day is a light fill
  with dark text (`bg-slate-100 text-slate-950`) or a `surface-3` fill; the
  icon of the active tab is green. Blue and green fills are not selection.
- `slate-500` and darker are not text colours. They are for borders, icons
  that repeat a label, and disabled controls.
- At most one tinted panel per screen, and only for a real status (an error,
  an overload). Reminders and requests are neutral panels with a chip.
- Hall colours and session-type colours are data colours; they appear as a
  3–4 px edge, a dot or a chart series, never as a fill behind text.
- The page is flat `ground`: no grid, no glow. Those belong to the landing
  page.

**Type.** Inter, shipped with the app (`next/font`), numbers `tabular-nums`.

| Role | Size / line | Weight | In code | Use |
|---|---|---|---|---|
| `display` | 22 / 28 (desktop 28 / 36) | 700 | the shell's `h1`; `os-title` on entry pages | the page title, one per page |
| `title` | 18–20 / 28 | 600 | `text-lg font-semibold` | panel and sheet titles |
| `heading` | 16 / 24 | 600 | `text-base font-semibold` | a row's main line, card titles |
| `body` | 14–15 / 22 | 400–500 | `text-sm` | sentences, messages, explanations |
| `label` | 13–14 / 18 | 600 | `text-sm font-semibold` | buttons, chips, field labels |
| `caption` | 12 / 16 | 500 | `text-xs font-medium`, `os-caption` | meta lines, time stamps, section labels |
| `metric` | 24–28 / 32 | 600, tabular | `text-2xl font-semibold tabular-nums` | the one number a tile is about |

- **Three weights:** 700 for the page title, 600 (`font-semibold`) for titles,
  labels and numbers, 400–500 (`font-medium` at most) for everything read as
  a sentence or a meta line. `font-black` and `font-bold` on body text are
  gone and do not come back.
- **12 px is the floor.** Two exceptions, because the alternative is no label
  at all: chart axis labels (11 px) and the seven-day grid on a phone, whose
  columns are 45 px wide (10 px). Everything else that does not fit at 12 px
  shows less.
- **Sentence case.** Section labels inside a panel are small quiet captions
  ("Fahrgemeinschaften"), not spaced capitals. The only uppercase is the
  "CLUB OS" kicker on entry pages (`os-kicker`).
- Text never truncates where it is the answer (names, times, places, status).
  Titles wrap to two lines; only meta lines may end in "…".

**Space.** A 4 px base; only these steps: 4, 8, 12, 16, 24, 32, 48.

- Page gutter 16 (phone), 32 (desktop). Panel padding 16 (phone), 20–24
  (desktop). Between panels 20; between a panel title and its content 12;
  between tiles 8–12; inside a control 12 × 16.
- Reading width is at most 720 px for forms, feeds and single-column pages; a
  wide screen gets a second column, not wider lines.

**Shape.** Quieter corners than before, three sizes by the size of the thing:
panels and sheets 18 (`rounded-3xl`), tiles, rows, fields and buttons 10–12
(`rounded-xl`, `rounded-2xl`), chips, avatars and switches full. The Tailwind
radius names are remapped in `tailwind.config.ts`; no arbitrary radius.

**Depth.** Two levels and no more: the page, and one panel on it. Inside a
panel, content is `surface-2` tiles without a border, or rows separated by a
`line`. **Never a bordered box inside a bordered box.** Outlines are for
things you type into or press (fields, quiet buttons), not for grouping.
Only things that float have a shadow: sheets, dialogs, the tip bubble. Panels
do not blur what is behind them; the sticky page head and the tab bar do.

**Layout.** Mobile first and checked at 375 px: nothing may scroll sideways
(the smoke test fails if it does). On the phone a bottom tab bar; from `md` a
fixed side bar. Safe areas on iPhone are respected. Touch targets are
44 × 44 px, with 8 px between neighbours.

## Components (`src/app/globals.css`)

| Class | What it is |
|---|---|
| `os-page`, `os-container` | the page (flat `ground`) and its width |
| `os-panel` | the working surface: `surface-1`, 18 px corners, a hairline, no shadow |
| `os-panel-soft`, `os-metric` | a tile inside a panel: `surface-2`, no border |
| `os-rows` | children separated by a `line` (lists, the "what is new" panel) |
| `os-row` | a list row: 56 px min, the whole row is the target |
| `os-stack` | a panel that hides itself when it has no children |
| `os-sheet` | the frame of everything that opens over the page (see below) |
| `os-hero`, `os-kicker`, `os-title`, `os-copy` | the head of an entry page: a plain bar, not a box |
| `os-field`, `os-textarea`, `os-label` | inputs: `surface-2`, a `line-strong` outline, blue when focused |
| `os-success` | the one main action of a surface (filled green) |
| `os-primary` | a filled light action, where green would mean "done" |
| `os-secondary` | everything else: outline only |
| `os-danger` | destroying something: red text on a red tint, inside a confirm step or at the end of a page |
| `os-link` | a text action in `info` |
| `os-chip`, `os-chip-go`, `os-chip-warn`, `os-chip-stop` | a status: a word on a tint, never colour alone |
| `os-caption` | a section label inside a panel |
| `os-empty` | an empty state |

Shared pieces worth reusing before building new ones: `SmartSessionCalendar`
(one calendar engine for every role), `PersonAvatar` / `PhotoPicker`,
`PlayerCard` / `CardReveal`, `SideSwitch` (segmented control), `PositionPicker`,
`AppConfirmDialog`, `TeamLogoBadge`, `ProfileMeter`.

Use the `os-*` classes; do not rebuild a panel, tile, button or field from
utility classes in a feature file. Older screens still spell some of them out
(`rounded-2xl bg-white/[0.04]` is a tile, `rounded-xl border border-slate-700`
a quiet button); they render the same and move to the classes when touched.

**Buttons.** Height 44–48 (main), 36–40 (inside rows and toolbars). One
`os-success` per surface. A press changes the fill; nothing lifts or floats on
hover. Destructive actions never sit as a link next to everyday content
("Leave team", "Remove", "Delete"): they live at the end of the page or behind
"…", and always confirm with `AppConfirmDialog`.

**Sheets (`os-sheet`).** Session details, rating, editing, player details,
the role switch, confirmations: one frame (`surface-1`, 18 px corners, a
`line-strong` hairline, one deep shadow, a 280 ms rise) over a `black/60`
scrim without blur. Each is `role="dialog"`, labelled, closed by Escape.
Inside, the same rules as on a page: tiles without borders, one green action.
Sheets anchored to the bottom edge have square bottom corners
(`rounded-b-none sm:rounded-b-3xl`).

**The shell.** Phone: a sticky head (title, one meta line, the demo pill, the
avatar) and a bottom tab bar; the active tab is white with a green icon, the
others `text-3`. Desktop: a fixed side bar on `surface-1`; the active item is
a `surface-3` pill with a green icon. No full-green navigation.

**What is new.** Unread messages, the player-card nudge and a new playbook
are rows of one panel at the top of Today (`os-panel os-rows os-stack`), not
three cards in three styles. The whole row is the link; there is no "Open"
text next to a chevron.

**Page head.** Title (`display`) and at most one meta line that carries
information the page does not show elsewhere (the date, the team). No
subtitle that describes the page. The demo switch is a single small pill in
the head ("Demo · Coach ▾"), not a full-width bar above the content.

**Lists.** One row height and one row anatomy per list. Meta is `text-3`,
never coloured, and shows only what differs between rows or what the reader
came for. Status sits right, as one chip. Lists longer than about eight rows
get a filter or a "Show all".

**Numbers and charts.** A tile is neutral; its value carries the tone (green,
red, blue) and one word says whether it is good. Technical terms keep their
first-use explanation. Charts: axis labels 11–12 px in `text-3`, at most five
ticks per axis, a legend in words, the selected value written out above the
chart; never rely on colour alone.

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

Short, purposeful, and always off with `prefers-reduced-motion`.

- Durations: 120 ms for a press or toggle, 200 ms for a chip or row changing,
  280 ms for a sheet or a step. One easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`
  (`--ease`).
- Only `transform` and `opacity` move. Nothing loops on a working screen
  (loops belong to the landing page and the card reveal).
- A press answers at once (the control dims or sinks 1 px); the result may
  follow.

- Steps slide in (`wizard-step`), a growing card pops once (`wizard-pop`).
- The player card reveal (`CardReveal`, NBA 2K style) is the one big moment: the
  card arrives face down, charges and shakes, bursts with a flash, sparks and a
  shock wave, flips to its front; afterwards it tilts with the finger or the
  phone. A tap skips it. It plays once per device, then on demand.
- Hover changes a fill, only on things that can be clicked; nothing lifts.

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
2. No outlined box inside a box; no text under 12 px (chart axes and the
   phone's seven-day grid excepted); no `slate-500` text; colour only where
   something has a status.
3. Nothing truncated that the reader needs; nothing scrolls sideways.
4. Nothing shown twice; every sentence passes the "a text stays if" test.
5. Loading, empty, error, saved and unsaved are defined.
6. Words match the glossary; dates match the one shape.
7. Keyboard: every control reachable, focus visible, Escape closes.
