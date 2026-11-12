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

**Colour** (dark only, `color-scheme: dark`)

| Token | Use |
|---|---|
| `#050712` / `slate-950` | page background |
| `slate-950/70` + `slate-800` border | panels and cards |
| `emerald-300` | the main action, "done", good load, progress |
| `sky-300` | links, focus rings, kicker labels, information |
| `amber-300` | attention (overdue, unanswered), and the gold of the player card |
| `rose-400` | absences, overload, destructive actions only |
| `slate-400/500` | secondary text; never for something the user must read to act |

Colour carries meaning, never decoration: green = good or go, amber = look at
this, red = missing or dangerous, blue = information.

**Type.** Inter (system fallback). Headlines `font-black` and tight; body
`text-sm`; numbers `tabular-nums`. Kickers are small caps with wide tracking
(`os-kicker`).

**Shape.** Rounded: panels `rounded-3xl`, controls `rounded-2xl`, chips and
pills `rounded-full`. Panels are translucent with a thin border and a soft
shadow; no heavy gradients except where something is celebrated.

**Layout.** Mobile first and checked at 375 px: nothing may scroll sideways
(the smoke test fails if it does). On the phone a bottom tab bar; from `md` a
side layout with more columns. Safe areas on iPhone are respected.

## Components (`src/app/globals.css`)

| Class | What it is |
|---|---|
| `os-page`, `os-container` | the page and its width |
| `os-panel`, `os-panel-soft` | the working surface, and a quieter one |
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
10. **Teach while they use it.** On a page's first visits, one small bubble at
    a time points at a real control (`TipLayer`, `data-tip`), the rest dimmed
    but still usable: tapping the control works and counts as seen. "Got it",
    "No more tips", and "Show the tips again" in the settings. One short
    sentence per tip, never a tour that plays by itself.

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
- Dates and numbers through `@/shared/format`.

## Accessibility

Every control has a name (labels, `aria-label` where there is no visible text,
no buttons inside labels), focus is visible (`sky-300` ring), touch targets are
at least about 40 px, colour is never the only signal, and every page has one
`h1`.
