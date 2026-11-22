---
name: Hub
description: The scoreboard for your agents. A night-game board that shows which account is live, how much is left, and what is running.
colors:
  field-night: "#070d0a"
  housing-green: "#0f2a1d"
  housing-green-raised: "#15382a"
  led-black: "#020503"
  panel: "#0e1712"
  panel-raised: "#16221b"
  code-field: "#08110c"
  user-bubble: "#17342a"
  seam: "rgba(205, 255, 222, 0.085)"
  seam-strong: "rgba(205, 255, 222, 0.17)"
  text: "#eef5f0"
  text-secondary: "#a8b9ae"
  text-tertiary: "#7f9187"
  chalk: "#eaf3ec"
  on-chalk: "#06130c"
  team-personal-amber: "#f5ac3c"
  team-school-violet: "#ae96ff"
  team-codex-teal: "#34d7b9"
  live-orange: "#ff6a33"
  ok-green: "#5fdc95"
  bad-red: "#ff5a6c"
  warn-yellow: "#ffd23f"
  link-blue: "#8ccaff"
typography:
  title:
    fontFamily: "Board, Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "46px"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "0em"
  section:
    fontFamily: "Board, Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  score:
    fontFamily: "Board, Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
    fontFeature: "tnum"
  clock:
    fontFamily: "Board, Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.04em"
    fontFeature: "tnum"
  lettering:
    fontFamily: "Board, Barlow Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
  reading:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  code:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  stamp: "4px"
  tag: "5px"
  cell: "8px"
  control: "9px"
  row: "12px"
  card: "14px"
  bubble: "18px"
  composer: "24px"
  round: "50%"
spacing:
  xs: "4px"
  board-gap: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "28px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.on-chalk}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.bad-red}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-stop:
    backgroundColor: "{colors.live-orange}"
    textColor: "{colors.on-chalk}"
    rounded: "{rounded.round}"
    size: "38px"
  scoreboard-cell:
    backgroundColor: "{colors.led-black}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.cell}"
    padding: "8px 10px"
  game-clock:
    backgroundColor: "{colors.led-black}"
    textColor: "{colors.live-orange}"
    typography: "{typography.clock}"
    rounded: "{rounded.stamp}"
    padding: "0 8px"
  on-deck-count:
    backgroundColor: "{colors.led-black}"
    textColor: "{colors.text}"
    rounded: "{rounded.tag}"
    padding: "0 7px"
  sub-stamp:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.on-chalk}"
    rounded: "{rounded.stamp}"
    padding: "0 6px"
  machine-group:
    backgroundColor: "{colors.housing-green}"
    rounded: "{rounded.row}"
  list-group:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.row}"
  field-input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "10px 12px"
  composer-box:
    backgroundColor: "{colors.field-night}"
    textColor: "{colors.text}"
    rounded: "{rounded.composer}"
    padding: "3px"
  user-message:
    backgroundColor: "{colors.user-bubble}"
    textColor: "{colors.text}"
    rounded: "{rounded.bubble}"
    padding: "10px 14px"
---

# Design System: Hub

## Overview

**Creative North Star: "The Night-Game Scoreboard"**

Hub is a remote control for coding agents, opened for under a minute from a phone, and the interface reads like the board above a stadium at night. Each machine is a board. Its three accounts are teams, drawn as black LED panels with big condensed numerals. One team has possession, and one colour (scoreboard orange) is reserved for whatever is running right now. In a thread, the band under the top bar is the game clock. Everything else is quiet, near-black field so the numbers can be read at a glance, outdoors or in bed.

The world has two registers and they do not mix. The *board* register is the housing, the LED panels, and the Board face (self-hosted Barlow Condensed): titles, numbers, the band, stamps, SUB and the queue label. The *reading* register is the system face on dark panels: messages, tool output, forms and every control label. Agent prose is held to a 68ch measure so a long answer reads like a column, not a console dump. Depth is tonal, not shadowed. Dark only.

It refuses the dark dev-console default: grey panels, one neon accent, a terminal as the metaphor.

**Key Characteristics:**
- Scoreboard-green housing (top bar, sidebar, composer, machine card) over a near-black field.
- Black LED panels, inset, for any number: usage score, game clock, on-deck count.
- Board face limited to titles, numbers, the band, stamps, SUB and the queue label; system face for reading and controls.
- Team colours are accounts; orange is only "live".
- Chalk (near-white) for primary actions, focus and selection.
- Stopped and failed turns are stamped, never just greyed.
- 44px touch targets; 68ch reading measure.

## Colors

A night field and a green housing, with three team colours and one reserved live colour as the only saturated hues. Status colours (ok, bad, warn) are functional and appear only as state.

### Primary
- **Chalk** (#eaf3ec): the one primary action colour. Filled buttons, the send button, focus rings, selected-option outlines, nav-button text, the SUB stamp. Chalk is never a team colour and never means live.

### Secondary (team colours: the accounts)
- **Personal Amber** (#f5ac3c): the personal Claude account. Its panel's top bar, its score numeral, its handoff dot.
- **School Violet** (#ae96ff): the school Claude account.
- **Codex Teal** (#34d7b9): the ChatGPT/Codex account.

### Tertiary
- **Live Orange** (#ff6a33): reserved for what is running now: possession arrow on the live account's panel, the game clock, the running-count numeral, the band word while working, running dots, the working cursor and spinner, the progress sweep on the band. The Stop button is also orange.

### Neutral
- **Field Night** (#070d0a): page background; settles from a slightly lighter green (#0c1812) at the top over 360px.
- **Housing Green** (#0f2a1d): top bar, desktop sidebar, composer strip, the machine card on the home screen. Raised state (#15382a): selected sidebar thread, selected segment, active device row.
- **LED Black** (#020503): the inset panels numbers sit in. The darkest value in the system.
- **Panel** (#0e1712) and **Panel Raised** (#16221b): grouped lists, cards, inputs; raised for tags, quiet buttons, option rows.
- **Code Field** (#08110c): code, terminal output, diffs. **User Bubble** (#17342a): the owner's own messages.
- **Text** (#eef5f0), **Text Secondary** (#a8b9ae), **Text Tertiary** (#7f9187): tertiary is the floor for any readable label.
- **Seam** (rgba(205,255,222,0.085)) and **Seam Strong** (0.17): the only divider colour; a pale green hairline.
- **Link Blue** (#8ccaff): links inside agent prose only.
- Status: **OK Green** (#5fdc95, pushed, added lines), **Bad Red** (#ff5a6c, failed, out of usage, removed lines), **Warn Yellow** (#ffd23f, waiting on you: the band reads "Needs you" or "Claude asks" and the approval card is outlined in it).

### Named Rules
**The Reserved Orange Rule.** Live Orange means running now and nothing else. It never decorates a heading, a link or a hover. If an agent is not running, orange is not on the screen. (The build also tints text selection orange; that is a drift from this rule, not a pattern to extend.)

**The Teams Are Accounts Rule.** Amber, violet and teal identify an account and nothing else. They never colour a status, a button or a section. A new account gets a new team colour, not a reused one.

**The Black Panel Rule.** A number sits in LED Black or on a housing, never loose on a grey card.

## Typography

**Board Font:** Board (self-hosted Barlow Condensed 600 and 700, woff2, `font-display: swap`), falling back to Arial Narrow / Roboto Condensed.
**Reading Font:** the system UI stack (SF Pro Text, Segoe UI, Roboto).
**Mono Font:** the system mono stack, for paths, commands, code and diffs.

**Character:** the Board face is condensed, athletic and loud; the system face is the calm reading voice. The tension between them is the point: lettering you scan, prose you read.

### Hierarchy
- **Title** (Board 700, 46px, 0.98): the screen name ("Hub", a machine, "Files"). File names drop to mono 24px/1.2.
- **Section** (Board 700, 21px, +0.01em): group headings such as "Notifications"; the sidebar brand is the same face at 27px.
- **Score** (Board 700, 36px, 1, tabular; 28px in the sidebar): the usage percentage in an account panel, its percent sign at 19px.
- **Clock** (Board 700, 22px, tabular, +0.04em): the elapsed time in the band; the running count on a machine row is the same weight at 22px.
- **Lettering** (Board 600, 13px, +0.08em, uppercase): panel names (PERSONAL), RUNNING, the queue label (ON DECK / THEN). Band word is Board 700 at 17px, +0.07em, uppercase (WORKING, DONE). Stamps are Board 700 at 15px, +0.1em, uppercase. SUB is Board 700 at 13px, +0.1em.
- **Body** (system 400, 17px, 1.4): controls, rows, forms. Row names are 600; row meta 14px in Text Secondary.
- **Reading** (system 400, 17px, 1.5): agent prose and tool output. Paragraphs, lists, blockquotes and headings in prose are capped at **68ch**; code blocks and tables are not capped and scroll sideways inside the message.
- **Caption** (system, 12 to 14px): metadata, who-lines, hints. Never below 12px.

### Named Rules
**The Two Registers Rule.** The Board face is for titles, numbers, the band, stamps, SUB and the queue label. Reading text, buttons, form labels, row names and nav labels stay in the system face. A new element does not get condensed capitals because it feels important.

**The Fixed Measure Rule.** Agent prose never stretches past 68ch on any screen. A wider screen gets more margin, not a longer line.

**The Tabular Numbers Rule.** Every counter, clock and percentage is tabular so it does not jitter as it ticks.

## Layout

A single reading column, 720px max on a phone-first shell (800px with 28px gutters when the desktop sidebar is present), 16px side gutters on a phone. On desktop (`body.wide`) a 316px housing-green sidebar lists machines, each machine's board, and its threads; the thread screen releases the column cap so the top bar and band span the pane, while the conversation holds a 760px column centred above a composer of the same width. Vertical rhythm is tight and list-driven: grouped lists with 12px radius and seam hairlines between rows (no row borders), 28px above section headings, rows at least 52px tall and every control at least 44px.

The account board is a 3-column grid with a 6px gap (4px in the sidebar) and never collapses to a single column; below 380px the lettering tightens its tracking. The composer is fixed to the bottom and the screen reserves its measured height, with the safe-area insets added on top and bottom.

### Named Rules
**The Three Across Rule.** Three accounts are always shown side by side as one row. Do not stack them or hide the one that is off; an off account is dimmed, not removed.

## Elevation & Depth

Tonal, not shadowed. Surfaces step from Field Night to Panel to Panel Raised, and the housing is a distinct green layer. Panels are inset (hairline inner ring in Seam) rather than lifted. Sticky shell elements (top bar, band, composer) are the same housing/field colour at 90 to 97 percent with a backdrop blur so content scrolls under them; a 1px black-at-45% line separates the housing from the field. The only drop shadow in the system is on the small "jump to newest" button.

### Shadow Vocabulary
- **Inset ring** (`box-shadow: inset 0 0 0 1px rgba(205,255,222,0.085)`): the standard panel and chip edge. Strong variant at 0.17 for inputs, option rows, file chips.
- **Team cap** (`inset 0 3px 0 <team colour>`): the 3px coloured top edge of an account panel.
- **Stamp ring** (`inset 0 0 0 1.5px currentColor`): outline for stamps and the stopped/failed band word.
- **Focus glow** (`0 0 0 3px chalk at 22%` on fields, 4px at 16% on the composer): focus only.
- **Jump lift** (`0 6px 18px rgba(0,0,0,0.14)` plus Seam Strong ring): the jump-to-newest button.

### Named Rules
**The Inset Not Lifted Rule.** Panels, cards and LED displays are inset or flat. A raised drop shadow on a card is out of this world.

**The Seam Not Border Rule.** Dividers are a 1px Seam inset line between siblings. Nothing gets a full coloured border except an approval or question that is waiting on the owner (1.5px inset ring in Warn Yellow or chalk at 55%).

## Shapes

Rounded rectangles of moderate radius with two exceptions. Lists, groups and cards use 12 to 14px; controls 9px; account panels 8px; stamps 4px and tags 5px, which makes lettering read as stamped metal rather than pills. Circles are reserved for round icon buttons (send, stop, attach), dots, and the composer's pill (24px). A user message is an 18px bubble with the tail corner pulled to 6px. The possession arrow is a small triangle (8 by 10px, clip-path) pointing right. No decorative clipping, no blobs.

## Components

### Buttons
- **Shape:** gently rounded rectangle (9px), 44px tall, 36px for small, horizontal padding 16px; weight 600, system face.
- **Primary:** Chalk fill with On-Chalk text. The only filled-bright element on a screen should be the one action that matters.
- **Quiet:** Panel Raised fill, Text, hairline inset ring. **Danger:** transparent with Bad Red text and a 1.5px red ring. Pressed (`aria-pressed`) quiet buttons tint with chalk at 16%.
- **Press / Focus:** `:active` scales to 0.97 over 120ms; focus-visible is a 2px chalk outline with a 2px offset. Disabled is 40% opacity.
- **Round actions:** 38px circles. Send is chalk with an up arrow; Stop is Live Orange with a filled square. Nav buttons are text-and-icon in chalk with 44px targets.

### Scoreboard Row (signature)
A machine's accounts as a row of three LED panels: LED Black fill, 8px radius, Seam inset ring, and a 3px team-colour cap along the top. Inside: the account name in Board lettering (13px, uppercase, Text Secondary), the usage numeral in the team colour (Board 700, 36px) with a smaller percent sign, and a 12px status line in Text Tertiary. States: **live** gets the orange possession arrow before the name, a half-strength orange ring and a full-brightness name; **out** shows OUT in Bad Red; **off** or logged out shows an em dash and dims name and numeral to Text Tertiary with a faded cap; **next** only brightens the status line ("used · next up"). On the home screen the board sits inside the Housing Green machine card, whose running count is a Board numeral (RUNNING in small caps), orange when above zero, tertiary at zero.

### Game Clock Band (signature)
A sticky band under the thread's top bar. While a turn runs it reads WORKING (orange, Board lettering), then the elapsed time as an orange LED numeral in an LED Black chip (`04:31`, `1:04:31` past an hour), then the account and "ON DECK" with a white LED count when messages are queued. A 2px orange pulse sweeps along the band's bottom hairline while running; it turns Warn Yellow and slower when waiting for the owner ("Needs you", "Claude asks"). When idle it reads DONE, plus the account and how long ago, in plain Text. Failed and stopped are stamped (see Stamps).

### Stamps
**Failed** and **Stopped** and **Interrupted** are drawn as a Board-lettered uppercase stamp with a 1.5px currentColor ring and 4px corners: red for failed, tertiary grey for stopped or interrupted. The band word takes the same ring when the last turn failed or stopped. Nothing disappears; a turn that did not finish leaves a mark.

### SUB (signature)
An account handoff is a hairline seam across the thread with the old team's dot, an arrow, the new team's dot, a chalk **SUB** pill in Board lettering, then "<account> in · <reason>". The two dots are the only team-coloured part.

### Inputs / Fields
- **Style:** Panel fill, 1px Seam Strong stroke, 9px radius, 44px minimum height, 10px by 12px padding; select has a chevron drawn in CSS.
- **Focus:** the stroke goes chalk and a 3px chalk glow at 22% appears. Placeholder is Text Tertiary.
- **Composer:** a Housing Green strip fixed to the bottom with a Field Night pill (24px) holding the textarea, an attach button and a round send/stop button. Queued messages sit above it as 40px rows with the ON DECK / THEN label in Board lettering.

### Navigation
A sticky three-column top bar (back, title, actions) in Housing Green at 94%. The title fades in as the page scrolls; thread bars show it always. On desktop the bar is transparent until content scrolls under it, then turns Housing Green across the full pane. The sidebar repeats each machine's board at 28px numerals and lists threads with a running dot; the selected thread is Housing Green Raised with an inset ring.

### Cards / Containers
Grouped lists in Panel with 12px radius and Seam hairlines between rows. Approval and question cards are 14px Panel cards with a waiting ring (Warn Yellow for approvals, chalk for questions) that drops once answered. The "what changed" disclosure and attached-file cards are Panel with an inset hairline. The machine card is the one container drawn in Housing Green, because the board lives in it.

### Message Tool Calls
Runs of steps collapse under a 36px summary row with a chevron; each step opens to a command, output or diff on Code Field. Diffs use OK Green and Bad Red at 12 to 13% tints behind the lines. A running step shows a small orange spinner.

## Do's and Don'ts

### Do:
- **Do** put every number in an LED Black panel or on the housing, in the Board face, tabular.
- **Do** use Live Orange only for what is running now: arrow, clock, running count, working word, running dot, cursor.
- **Do** colour accounts with their team colour (amber, violet, teal) and nothing else with those hues.
- **Do** use chalk (#eaf3ec) with On-Chalk text for the one primary action on a screen.
- **Do** stamp failed, stopped and interrupted outcomes in Board uppercase with a 1.5px ring.
- **Do** cap agent prose at 68ch and keep every touch target at 44px or larger.
- **Do** separate siblings with a 1px Seam hairline and use inset rings for panel edges.
- **Do** respect `prefers-reduced-motion`; the band sweep and breathing dots stop, and the information they carry stays in text.

### Don't:
- **Don't** set body copy, buttons, form labels or nav labels in the Board face, and don't add uppercase tracked lettering to elements outside the list in the Two Registers Rule.
- **Don't** use orange for emphasis, links, hover or decoration.
- **Don't** use a team colour as a status colour or give an account two colours.
- **Don't** add a light theme or a neon accent on grey panels; this world is dark only and refuses the dev-console default.
- **Don't** lift cards with drop shadows or add full coloured borders to ordinary containers.
- **Don't** hide an account that is logged out or rate-limited; dim it and say why.
- **Don't** let a failed or stopped turn disappear or read as grey text; it is stamped.
- **Don't** introduce icon glyph decoration; icons are the inline 1.75px-stroke line set already in `index.html`.
