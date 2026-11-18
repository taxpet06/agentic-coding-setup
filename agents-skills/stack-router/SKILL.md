---
name: stack-router
description: Routing table deciding which skill to use for a coding task — UI/design/animation work (impeccable, emil-design-eng, svg-animations), React Native / Expo work (expo-router, expo-native-ui, expo-ui, expo-data-fetching, eas-*, react-native-best-practices), codebase questions (graphify), planned work (gsd suite), and the always-on laziness constraint (ponytail). Load when starting any non-trivial task, when unsure which skill applies, when working on a React Native, Expo, iOS, or Android app, or when the user says "route", "which skill", or "stack router".
---

# Stack router

Decide once, at the top of a task. Match the most specific row; a task can match several.

| The task is… | Use |
|---|---|
| Anything that writes code | `ponytail:ponytail` — **always**, non-negotiable, runs alongside everything below |
| New component, page, layout, or restyle | `impeccable` first (design system + audit), then build |
| Existing UI "feels off", generic, AI-slop, inconsistent | `impeccable` — it owns homogeneity and slop removal |
| Micro-interaction, hover/press feel, transitions, polish judgement | `emil-design-eng` |
| SVG path/morph/vector motion specifically | `svg-animations` |
| "What's this effect called?" | `animation-vocabulary` |
| Chart, graph, dashboard, stat tile | `dataviz` |
| Animated reel / short-form video (mp4, 9:16): growth stat, route, exploded view, explainer | `graph`, `map-route`, `breakdown`, `minimalistic-graphics`, `dan-koe`, `kurzgesagt`, `low-poly`, `minecraft` (quick, JSON spec); `stick-figure`, `zach-d-films` (full voiceover reels) |
| **React Native / Expo — anything at all** | See [React Native / Expo](#react-native--expo) below |
| "How does X work here?", "where does Y live?", architecture question | `graphify` (query the existing graph before grepping) |
| Small fix, doc tweak, one-file change | `gsd-quick` |
| Bug investigation | `gsd-debug` |
| Planned phase work (project has `.planning/`) | `gsd-execute-phase` (plan first with `gsd-plan-phase`) |
| Trivial mechanical edit | `gsd-fast` |

## UI rules

UI work is a **chain**, not a choice: `impeccable` sets the system and kills slop → build → `emil-design-eng` for the feel → `svg-animations` only if the motion is vector-path-based. Skipping `impeccable` on new surfaces is how the app drifts.

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
