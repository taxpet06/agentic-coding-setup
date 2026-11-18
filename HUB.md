# Project hub: phone → any machine → any project

Two ways in from your iPhone, both built on the same index, graphs and git sync:

- **Hub app** (`hub/`): one Home Screen app that lists every machine on your tailnet running the hub. Each machine shows its projects, its conversations, and how much of each agent account is left. You say "fix the camera jitter in battlefield", and the machine finds the repo, runs the agent, commits and pushes, and notifies you. When Claude personal runs out it switches to Claude school, then to Codex, and the conversation carries across.
- **Remote Control** (`hub serve`): Claude Code's own remote, in the Claude iOS app. Use it when you want to approve tool calls one by one.

## Use it

| When | Do |
|---|---|
| Once per tailnet | Tailscale admin → [DNS](https://login.tailscale.com/admin/dns) → **HTTPS Certificates → Enable**. iOS only installs web apps and delivers their notifications over HTTPS |
| Once per machine | `./bootstrap.sh` (installs `hub` and its hooks, the `$HOME` permission, the first index, and the app's deps). `sudo apt install jq tmux` if it says so. Log in once each: `claude-personal`, `claude-school`, `codex login` |
| Each time | `tailscale_up` → `hub app` (systemd service `hub-agent` + `tailscale serve`), `hub serve` (Remote Control), background graph refresh |
| Once per phone | Open the `https://<machine>.<tailnet>.ts.net/` link `hub app` prints, in Safari → Share → **Add to Home Screen**. Open Hub from the Home Screen → **Notifications → Turn on** |
| On the phone | Hub → a machine → **+** → "do X for battlefield" (project and account default to Auto). Follow-ups go in the same thread |
| Sync problems on your phone too (optional) | ntfy iOS app, subscribe to a long random topic, `export HUB_NTFY_TOPIC=<topic>` in `~/.bashrc` |

Commands: `hub app [stop|logs]`, `hub scan [--graph]`, `hub find <word>`, `hub pull`, `hub push <repo>...`, `hub serve`, `hub selftest`. State lives in `~/.claude/hub/`: `projects.tsv` (index), `threads/`, `accounts.json` (limits and usage), `push.json` (VAPID keys and phone subscriptions, mode 600), `failed` (sync problems shown to the next session).

## How the Hub app works

```
iPhone (Home Screen PWA, https://dell-linux.<tailnet>.ts.net)
  │  tailscale serve (HTTPS, stamps your tailnet login)
dell-linux: hub-agent (hub/server.mjs, :7787, loopback + tailnet IP only)
  ├─ /api/d/dell-linux/...  → runs here
  └─ /api/d/hp-linux/...    → proxied over the tailnet to hp-linux:7787 (peer checks `tailscale whois` = same owner)
```

- **Devices**: `tailscale status` lists peers; any peer answering `:7787/api/info` is a hub. Offline hubs stay listed with their last state.
- **Routing**: a thread pinned to a project runs there. An Auto thread matches the first message against the project index (`hub/lib.mjs` `matchProject`: "battlefield" → `Github/dali/3dbattlefield`, "battlefield to vercel" → the `-vercel` sub-repo). With no match it runs in this repo, where CLAUDE.md's hub mode takes over.
- **Accounts**: personal → school → Codex (`pickProvider`). Claude's stream reports each account's 5-hour usage (`rate_limit_event`). An account at 90% hands over early, and a rejected one is skipped until its reset time. Codex is used only when both Claude accounts are out, and the thread goes back to Claude as soon as one has room.
- **Continuity**: switching between the Claude accounts copies the session transcript (`<config>/projects/<slug>/<id>.jsonl`) to the other profile and resumes the same session id. Switching to or from Codex hands over a transcript of the turns the new agent missed, plus any partial work. Each switch shows in the thread as a handoff line saying who took over and why.
- **After every turn**: `hub push <repo>` (same owner allowlist and secret guard as the hooks), then a push notification to every phone subscribed on any hub ("battlefield · done", first line of the answer).
- **Model and effort**: chosen per thread in the composer and kept until you change them. The model applies to Claude turns (`--model`). Codex keeps its `config.toml` model. Effort applies to both (`--effort` / `model_reasoning_effort`). Default means the account's own settings, or `HUB_CLAUDE_MODEL` if the unit sets it.
- **Skill routing**: a global `UserPromptSubmit` hook tells every Claude session (terminal, both accounts, the app) to load `stack-router` first. Codex turns get the same instruction prepended. The skills each turn loaded show as labels under the agent's name.
- **Unattended**: turns run with `--permission-mode auto` (Claude) and `workspace-write` (Codex). Set `HUB_PERMISSION_MODE` in the unit to change it. Approvals aren't relayed to the app; use Remote Control for that.

Verified on dell-linux (2026-11-17), all with real CLIs except where noted:
- One thread ran personal → school → Codex → personal and kept its memory at every step.
- Stand-in `claude-personal`/`claude-school` scripts sent real-format limit events. The account fallback and the handoff lines worked, and Codex finished the turn.
- In the UI: the device list, accounts, a new thread, streaming output, the stop button state, and "Try again" on a limited account.
- `hub selftest` covers git sync and `hub/test.mjs`.

Not verified yet: proxying to a second hub (no other machine was online), and push notifications on a real iPhone (that needs the HTTPS step above).

## Open-source alternatives (not installed)

- **[Happy](https://github.com/slopus/happy)** (MIT): iOS/Android/web client for Claude Code and Codex, end-to-end encrypted, with push notifications ([App Store](https://apps.apple.com/us/app/6748571505)). `npm i -g happy-coder`, then run `happy` in this repo instead of `hub serve`. Pick it if you want Codex on the phone too, or don't want to depend on claude.ai Remote Control. Everything else here (index, graphs, sync hooks, CLAUDE.md routing) works unchanged, because it lives in Claude Code hooks rather than in the client.
- **ntfy** (Apache-2.0): plain push notifications from shell scripts. Already wired in as `HUB_NTFY_TOPIC`.

## Safety rails (deliberate)

- Auto-commit/push applies **only to repos whose origin matches `HUB_PUSH_ONLY`** (default `github.com/taxpet06/`). Lab/org/third-party clones are pull-only.
- A repo is skipped and reported, never committed, if staging would include `.env*`, keys, `*.pem`, `credentials.json`, `auth.json`, `*.sqlite`.
- Pull at session start is `--ff-only`. Push does `pull --rebase --autostash`. On conflict it aborts the rebase and reports. It never force-pushes.
- One global `flock`, so two sessions finishing at once just queue.
- Graphs for repos that don't already have `graphify-out/` go in `~/.claude/hub/graphs/` so they never appear in a repo's diff.

---

## The multi-phase build prompt

This is what was built. Hand it to an agent on a fresh setup, or to extend this one. Each phase lists its acceptance check. Status: **all phases done** (2026-11-17).

> **Goal.** Make `agentic-coding-setup` the single entry point for all coding on a machine. One Claude Code session opened from an iPhone in this repo must be able to work on any local project by name, understand it through its graphify graph, and leave every touched GitHub repo pulled, committed and pushed, with notifications, without the user ever naming a path or running git. Prefer native Claude Code features and existing CLIs over new services. Keep it to shell plus hooks, no daemon or database, and make it idempotent through `bootstrap.sh`.
>
> **Phase 1: Discovery (index).** Write `bin/hub scan`. Find every git repo under `$HOME` (prune dot-dirs, `node_modules`, `snap`; depth 6; nested repos and worktrees count). Write `~/.claude/hub/projects.tsv` as `name<TAB>path<TAB>origin<TAB>graph`, with name = path relative to `$HOME` so `grep` finds a project by any path fragment. `hub find <word>` greps it.
> *Accept:* scan finishes in under a second, `hub find battlefield` returns `Github/dali/3dbattlefield`, paths with spaces survive.
>
> **Phase 2: Understanding (graphs).** `hub scan --graph`. For repos with `graphify-out/graph.json`, run `graphify update <repo>` (AST, no LLM). Otherwise run `graphify extract <repo> --code-only --out ~/.claude/hub/graphs/<slug>` so nothing is added to the repo. The graph column points at whichever exists. Run it in the background from `tailscale_up`.
> *Accept:* every code repo gets a graph path. No new untracked files appear in any repo.
>
> **Phase 3: Routing (the abstraction).** In this repo's `CLAUDE.md`, add "Hub mode": project name → `hub find` → work there with absolute paths, load that repo's `CLAUDE.md`, query its graph before grepping, never run git by hand. `bootstrap.sh` writes a gitignored `.claude/settings.local.json` with `additionalDirectories: [$HOME]` so a session in this repo can edit any project.
> *Accept:* a session here, told "what does the scoring code in zigma do", answers from `zigma-points`'s graph without asking for a path.
>
> **Phase 4: Sync (always up to date).** Global hooks in `claude/settings.json`, so every session on the machine syncs, not just hub ones:
> - `SessionStart` → `hub hook-start`: print and clear queued sync failures (lands in context), then detached `hub pull` (`--ff-only`, every repo with an upstream).
> - `PostToolUse Edit|Write|MultiEdit|NotebookEdit` → `hub hook-touch`: record the edited file's repo per session.
> - `Stop` (every turn, so long-lived phone sessions still push) → `hub hook-stop`: detached `hub push` of the touched repos plus the cwd repo.
>
> `push` = owner allowlist → secret guard → `commit -m "auto-sync from <host>"` → `pull --rebase --autostash` (abort and report on conflict) → `push`. Failures go to `~/.claude/hub/failed` and to ntfy if `HUB_NTFY_TOPIC` is set. `hub selftest` must prove a change gets pushed and a `.env` never does.
> *Accept:* `hub selftest` passes. Editing a file in an owned repo from a session puts an `auto-sync` commit on GitHub within seconds of the turn ending.
>
> **Phase 5: Phone (iOS + notifications).** Use Claude Code's native `claude remote-control`, which drives local sessions from the Claude iOS app with push notifications. `hub serve` starts `claude-personal remote-control --name hub --permission-mode auto` in tmux session `hub`, in this repo, and is idempotent. `tailscale_up` calls it. Document Happy as the open-source client alternative and ntfy as the open-source notifier.
> *Accept:* after `tailscale_up`, the Claude iOS app lists session "hub" under Code. A finished task sends a push notification.
>
> **Phase 6: Portability.** `bootstrap.sh` installs `hub`, warns about missing `jq` and `tmux`, writes the local permission file, runs the first `hub scan`. README gets a row. Hook paths use `/home/petros/`, which bootstrap already rewrites to `$HOME`.
> *Accept:* on a second machine, `git pull && ./bootstrap.sh && tailscale_up` gives the same phone experience with that machine's repos.
>
> **Later, only if needed:** a cross-repo graph (`graphify merge-graphs`) once projects start depending on each other; per-repo locks if the global lock ever queues noticeably; a Happy-based `hub serve --happy` if you start using Codex from the phone.
