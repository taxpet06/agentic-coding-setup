---
name: stack-router
description: "Auto-routing protocol: on ANY coding, UI, debugging, testing, architecture, React/Next.js, React Native/Expo, browser-testing, or prose task, load this first, then invoke the matching skills via the Skill tool yourself, without being asked. Routes to impeccable, frontend-design, emil-design-eng, vercel-react-best-practices, expo-*, eas-*, react-native-best-practices, agent-browser, tdd, diagnosing-bugs, improve-codebase-architecture, handoff, graphify, gsd-*, dataviz, humanizer, and ponytail."
---

# Stack router

## Protocol (do this without being asked)

1. Before the first edit or substantive answer, classify the task against the tables below.
2. **Invoke every matching skill with the Skill tool right then.** Never ask "want me to use X?" and never merely mention a skill. If it matches, load it.
3. Order: `ponytail:ponytail` → `graphify` (if `graphify-out/` exists) → design/stack skills → build → verify (`agent-browser`, `tdd`).
4. Re-route when the task shifts mid-session (e.g. feature work turns into a bug: load `diagnosing-bugs`).
5. Skip routing only for pure conversation or a one-line trivial edit (then just `ponytail`).

Decide once, at the top of a task. Match the most specific row; a task can match several.

| The task is… | Use |
|---|---|
| Anything that writes code | `ponytail:ponytail` — **always**, non-negotiable, runs alongside everything below |
| New component, page, layout, or restyle | `impeccable` first (design system + audit), then build |
| Existing UI "feels off", generic, AI-slop, inconsistent | `impeccable` — it owns homogeneity and slop removal |
| Micro-interaction, hover/press feel, transitions, polish judgement | `emil-design-eng` |
| SVG path/morph/vector motion specifically | `svg-animations` |
| "What's this effect called?" | `animation-vocabulary` |
| UI is **web** (React/Next.js component, page, layout) | `vercel-react-best-practices` alongside `impeccable` — perf rules while writing, not after |
| Need a distinctive visual direction, bland/templated look | `frontend-design` (aesthetic direction); `impeccable` still owns the audit |
| Verify UI in a real browser, click through flows, screenshot, QA a web app | `agent-browser` (prefer over built-in web tools) |
| New feature or logic with testable behavior; "add tests" | `tdd` — red/green before implementing |
| Something is broken, flaky, regressed, "why does this fail" | `diagnosing-bugs` (then `gsd-debug` if the project uses `.planning/`) |
| Structure feels tangled, refactor, "is this the right design" | `improve-codebase-architecture` (decisions: `fsd-lead`) |
| Pausing, context getting long, ending a session | `handoff` |
| Chart, graph, dashboard, stat tile | `dataviz` |
| Animated reel / short-form video (mp4, 9:16): growth stat, route, exploded view, explainer | `graph`, `map-route`, `breakdown`, `minimalistic-graphics`, `dan-koe`, `kurzgesagt`, `low-poly`, `minecraft` (quick, JSON spec); `stick-figure`, `zach-d-films` (full voiceover reels) |
| **React Native / Expo — anything at all** | See [React Native / Expo](#react-native--expo) below |
| "How does X work here?", "where does Y live?", architecture question | `graphify` (query the existing graph before grepping) |
| Small fix, doc tweak, one-file change | `gsd-quick` |
| Bug investigation | `gsd-debug` |
| Planned phase work (project has `.planning/`) | `gsd-execute-phase` (plan first with `gsd-plan-phase`) |
| Trivial mechanical edit | `gsd-fast` |
| Prose sounds AI-written: clean up style, match the user's voice | `humanizer` (pattern catalog, no detector layer) |
| Prose must also score as human on AI detectors (GPTZero, Turnitin, …) | `ai-humanizer` (detector-aware rewrite + `scripts/score.py` before/after) |

## UI rules

UI work is a **chain**, not a choice: `impeccable` (+ `frontend-design` for direction, `vercel-react-best-practices` on web React) sets the system and kills slop → build → `emil-design-eng` for the feel → `agent-browser` to see it render (web) → `svg-animations` only if the motion is vector-path-based. Skipping `impeccable` on new surfaces is how the app drifts.

Homogeneity check before shipping any new surface: does it reuse existing tokens, spacing scale, and component patterns from this repo? If it introduces a new one, that's a decision to state out loud, not a default.

Mobile-first unless the project says otherwise — phone-first, not merely responsive.

## React Native / Expo

Triggered by: `.tsx` under an Expo app, `app.json`/`eas.json`, `expo-*` imports, or any mention of React Native, Expo, iOS, Android, simulator, TestFlight, or a native build.

| The task is… | Use |
|---|---|
| Scaffolding a new app, or "where does this file go?" | `expo-project-structure` |
| Navigation — routes, tabs, stacks, modals, headers, links | `expo-router` |
| Building a screen that should feel native | `expo-native-ui` (HIG styling, semantic colors, SF Symbols) |
| Settings forms, pickers, sliders, bottom sheets, menus | `expo-ui` (real SwiftUI / Jetpack Compose from React) |
| Any network call, API client, React Query, caching, offline | `expo-data-fetching` |
| Tailwind / NativeWind setup | `expo-tailwind-setup` — **but see the version trap below** |
| Jank, dropped frames, slow TTI, memory leaks, re-renders, long lists | `react-native-best-practices` (FlashList, Hermes, bridge) |
| Integrating a third-party lib (Stripe, Supabase, Clerk, Skia, maps…) | `expo-examples` — canonical version-matched patterns |
| Native module, or a config plugin | `expo-module` |
| Running on a real device, custom native code, BLE, anything not in Expo Go | `expo-dev-client` |
| Upgrading the SDK, or dependency conflicts | `expo-upgrade` |
| Builds, TestFlight, store submission | `eas-app-stores` |
| CI/CD, `.eas/workflows/` | `eas-workflows` |
| No local simulator (Linux, CI, headless) | `eas-simulator` |
| Deploying Expo web or API routes | `eas-hosting` |
| A genuinely web-locked component (WebGL, rich text, a web-only chart lib) | `expo-dom` — escape hatch, **one leaf**, not an architecture |

### Two traps

**`expo-web-to-native` argues for putting the whole web app in a webview.** That is a migration bridge, and Expo's own docs say so. If the project has already decided on a native rewrite, use this skill *only* for its web→native idiom mapping (DOM, CSS, `localStorage`, `window`) — never for its strategy. Check the project's handoff/decision record before letting it steer.

**`expo-tailwind-setup` teaches NativeWind v5, which is preview-only.** `dist-tags.latest` is still 4.x. Pin deliberately; don't inherit a preview release silently from a skill.

### What does NOT apply on native

`svg-animations` and `dataviz` assume the DOM/SVG. On React Native, reach for `react-native-svg`, `victory-native`, or Reanimated instead. `impeccable` still applies — design systems, hierarchy, and slop removal are platform-agnostic — but read its web-specific advice (CSS, hover, breakpoints) as analogy, not instruction. There is no hover on a phone.

## Graphify refresh

After finishing something big (a phase, a milestone, a feature spanning several files), **ask** before refreshing:

> "Done with X. Update the graphify graph? (y/n)"

Never refresh unprompted — it's slow and the user may be mid-thought. Never skip asking either; a stale graph makes every later `graphify` answer wrong.

"Big" = a completed GSD phase/plan, or a change touching 5+ files. A one-file fix doesn't warrant asking.

## Anti-rules

- Don't load a skill to justify work you already decided to do. Route first, then work.
- Don't chain all three UI skills on a one-line CSS change. `ponytail` outranks the chain.
- Don't run a GSD command for something `gsd-fast` covers.
