---
name: Hub
description: A quiet graphite tool for running coding agents from a phone. Neutral dark, the system face, colour only where it means something.
colors:
  bg: "#0b0b0c"
  chrome: "#111113"
  chrome-raised: "#1c1c1f"
  panel: "#161618"
  panel-raised: "#222225"
  segment-selected: "#3a3a3f"
  user-bubble: "#232326"
  code-field: "#111113"
  seam: "rgba(255, 255, 255, 0.07)"
  seam-strong: "rgba(255, 255, 255, 0.13)"
  text: "#f2f2f3"
  text-secondary: "#a3a3a9"
  text-tertiary: "#7d7d84"
  accent: "#f2f2f3"
  on-accent: "#0b0b0c"
  account-personal: "#eda64a"
  account-school: "#a995ff"
  account-codex: "#43cdb6"
  live-blue: "#4c9dff"
  ok-green: "#3fcf7f"
  bad-red: "#ff5d5d"
  warn-yellow: "#ffcc3d"
  link-blue: "#79b5ff"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.022em"
  section:
    fontFamily: "system (as title)"
    fontSize: "15px"
    fontWeight: 600
    color: "{colors.text-secondary}"
  body:
    fontFamily: "system (as title)"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "system (as title)"
    fontSize: "13px"
    fontWeight: 400
  code:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    lineHeight: 1.55
rounded:
  tag: "6px"
  control: "9px"
  row: "12px"
  bubble: "18px"
  composer: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "28px"
  touch: "44px"
---

# Hub design

**Mode:** Operate. Dark only (the owner's call). Phone first; desktop adds a sidebar at 1000px.

**Thesis:** Hub should read like a first-party tool, not a themed demo. One neutral graphite surface, the platform's own type, iOS-style grouped lists, and colour used only when it carries information.

## Rules

- **Type:** the system face everywhere (SF on Apple devices). No display or condensed web fonts. Hierarchy comes from size and weight: large title 34/700, row titles 17/600, meta 13–14 in secondary grey. Numbers use `tabular-nums`. Sentence case everywhere, with no all-caps labels or letter-spaced stamps.
- **Surfaces:** `bg` for the page, `panel` for grouped lists and cards, and `chrome` for the desktop sidebar and bar. Separate elements with hairline `seam`s or with spacing, never with a border plus a shadow on the same element. Nothing is tinted green, purple or blue.
- **Colour has jobs:**
  - Primary action: near-white button with dark text.
  - Accounts: the three account colours appear only as small dots and thin usage bars.
  - Running now: `live-blue`, and nothing else uses it.
  - Status colours: needs-you is yellow, failed is red, and ok is green.
- **Accounts:** three quiet meters per machine. Each shows a dot and name, the value (`14%`, `Ready`, `Out`, `Off`), a 3px usage bar, and a small state line. A static blue dot after the name marks the live account.
- **Thread band:** plain text with the state word in its state colour, elapsed time (`04:31`), who, when, and `N queued`. A thin moving hairline shows a turn is running. No LED panels, clocks in boxes or stamps.
- **Handoffs:** a centred hairline seam reading "● → ● Claude school took over · reason".
- **Motion:** state changes ease out (`cubic-bezier(0.22, 1, 0.36, 1)`). Running dots in lists breathe. Everything respects `prefers-reduced-motion`.
- **Touch:** 44px targets, and the composer stays pinned above the safe area.

## Retired

The night-game scoreboard world was removed on 2026-11-27 because the owner found it gimmicky and "vibe coded". It had a green housing, Barlow Condensed numerals, LED cells, an orange possession arrow, ON DECK and SUB stamps. Don't bring any of it back.
