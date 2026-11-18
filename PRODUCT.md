# Product

<!-- impeccable:product-schema 1 -->

> Inferred from the owner's brief (they asked for no questions). Lines marked *(inferred)* are assumptions to confirm.

## Platform

web (an installable PWA used almost only from an iPhone home screen)

## Stack

delegated: plain static HTML/CSS/JS served by the hub agent (Node stdlib `http`, plus `web-push`). No build step, because every device on the tailnet serves its own copy straight from this repo after `git pull`.

## Users

One person, the repo owner: a student developer with a personal Claude account, a school Claude account and a ChatGPT/Codex login, plus several Linux machines (laptop, WSL, desktop) on one Tailscale tailnet. They use it away from the keyboard (walking, in class, on the couch) to start, steer and check on coding agents working in their repos.

## Product Purpose

Hub is a remote control for coding agents across all the owner's machines. It lists every device on the tailnet running the hub agent, each device's git projects, and lets the owner start or continue a conversation ("do this for battlefield") that runs on that machine. It picks the agent account automatically (Claude personal, then Claude school, then Codex) and switches mid-conversation when one runs out. When a turn finishes it pushes the repo and sends a notification. Success: the owner never thinks about which machine, which folder, which account, or git.

## Positioning

It's not one vendor's remote. Hub spans machines and three agent accounts, keeps a conversation going across account switches (it carries the Claude session file between profiles, or hands Codex a transcript), and treats "is my repo pushed" as done by default.

## Operating Context

- Opened from the iPhone home screen, often for under a minute: glance at what's running, read a result, send a follow-up.
- Thumb-driven, one-handed, sometimes outdoors in daylight, sometimes at night in bed *(inferred)*.
- Agents run for minutes. The owner leaves and comes back on a push notification.
- Reached over Tailscale only. Each device serves the app at `https://<host>.<tailnet>.ts.net`.

## Capabilities and Constraints

- Devices: discovered from `tailscale status`, probed on the hub port. Offline devices are listed but greyed.
- Projects: from `~/.claude/hub/projects.tsv` per device (`hub scan`). Names are paths relative to home.
- Threads: a conversation pinned to one device and one project (or "auto": the hub picks the project from the first message).
- Providers: `claude-personal`, `claude-school` (Claude Code `-p` with stream-json) and `codex` (`codex exec --json`). Usage per Claude account comes from `rate_limit_event` (5-hour window utilization and reset time).
- Agents run unattended. Each thread picks a permission mode (auto, accept edits, plan only, bypass), which maps to a Codex sandbox (plan → read-only, bypass → full access, otherwise workspace-write). Approval prompts are not relayed in v1 *(open decision)*.
- Notifications: Web Push, which iOS only allows for a PWA added to the Home Screen over HTTPS.

## Evidence on Hand

Real devices (dell-linux, hp-linux, dell-wsl, TaxBook), real repos in `~/.claude/hub/projects.tsv`. No brand assets exist.

## Product Principles

1. State at a glance: what's running, where, on which account, and whether it's pushed.
2. Zero routing work: the owner names a project in words, and paths never need typing.
3. Never lose a conversation: account switches and device hops keep context.
4. Quiet until it matters: notify on finished, failed, or switched, nothing else.

## Accessibility & Inclusion

Dynamic Type-friendly sizes, 44pt touch targets, works in light and dark *(inferred)*.
