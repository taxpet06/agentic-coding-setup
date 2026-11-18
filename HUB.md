# Project hub: phone → this repo → any project

From your iPhone you open one Claude Code session (this repo) and say "fix the camera jitter in battlefield". Claude finds the repo, reads its graph, does the work, and the repo ends up committed and pushed. No `cd`, no searching, no `git` by hand.

## Use it

| When | Do |
|---|---|
| Once per machine | `./bootstrap.sh` (installs `hub`, the hooks, the `$HOME` permission, first index). `sudo apt install jq tmux` if it says so |
| Once per phone | Install the **Claude** app (iOS), log in with the same account as `claude-personal` |
| Each time | `tailscale_up` → starts `hub serve` (tmux `hub`) and a background graph refresh |
| On the phone | Claude app → **Code** → session **hub** → "do X for battlefield". Push notifications when Claude finishes or needs approval come from the app (`agentPushNotifEnabled: true`) |
| Sync problems on your phone too (optional) | Install the **ntfy** iOS app, subscribe to a long random topic, `export HUB_NTFY_TOPIC=<topic>` in `~/.bashrc` |

Commands: `hub scan [--graph]`, `hub find <word>`, `hub pull`, `hub push <repo>...`, `hub serve`, `hub selftest`. Index: `~/.claude/hub/projects.tsv` (name, path, origin, graph). Failures: `~/.claude/hub/failed` (shown to the next session), background log `~/.claude/hub/bg.log`.

Remote Control goes through Anthropic's relay, so the phone doesn't need Tailscale for it. Tailscale is the fallback: `ssh` from Termius/Blink, then `tmux attach -t hub`.

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
