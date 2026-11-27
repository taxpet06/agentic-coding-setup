# Project hub: phone → any machine → any project

Two ways in from your iPhone, both built on the same index, graphs and git sync:

- **Hub app** (`hub/`): one Home Screen app that lists every machine on your tailnet running the hub. Each machine shows its projects, its conversations, and how much of each agent account is left. You say "fix the camera jitter in battlefield", and the machine finds the repo, runs the agent, commits and pushes, and notifies you. When Claude personal runs out it switches to Claude school, then to Codex, and the conversation carries across.
- **Remote Control** (`hub serve`): Claude Code's own remote, in the Claude iOS app. Use it when you want to approve tool calls one by one.

## Use it

| When | Do |
|---|---|
| Once per tailnet | Tailscale admin → [DNS](https://login.tailscale.com/admin/dns) → **HTTPS Certificates → Enable**. iOS only installs web apps and delivers their notifications over HTTPS |
| Once per machine | `./bootstrap.sh` (installs `hub` and its hooks, the `$HOME` permission, the first index, and the app's deps). On Windows run it in Git Bash (Claude Code needs Git for Windows anyway); it installs Node, Claude Code, uv and Tailscale with winget/PowerShell and writes `.cmd` launchers too. `tmux` is optional on Linux. Log in once each: `claude-personal`, `claude-school`, `codex login` |
| Each time | Linux: `tailscale_up` → `hub app` (systemd user service `hub-agent` + `tailscale serve`), `hub serve` (Remote Control), background graph refresh. Windows: sign in to Tailscale from the tray, then `hub app` (logon task `HubAgent`, hidden) and `hub serve` |
| Once per phone | Open the `https://<machine>.<tailnet>.ts.net/` link `hub app` prints, in Safari → Share → **Add to Home Screen**. Open Hub from the Home Screen → **Notifications → Turn on** |
| On the phone | Hub → **Threads** tab → **+** → "do X for battlefield" (project and account default to Auto). Follow-ups go in the same thread |
| Sync problems on your phone too (optional) | ntfy iOS app, subscribe to a long random topic, `export HUB_NTFY_TOPIC=<topic>` in `~/.bashrc` |

Commands (Linux, macOS and Windows; `hub` is `hub/cli.mjs`): `hub app [stop|logs]`, `hub scan [--graph]`, `hub find <word>`, `hub pull`, `hub push <repo>...`, `hub serve`, `hub selftest`. State lives in `~/.claude/hub/`: `projects.tsv` (index), `threads/`, `accounts.json` (limits and usage), `push.json` (VAPID keys and phone subscriptions, mode 600), `failed` (sync problems shown to the next session).

## Use it from a computer

- **On the machine running the hub**: `hub app`, then open http://localhost:7787 in any browser. A browser on the machine itself gets in without Tailscale (`HUB_LOCAL=0` in the service turns that off on a shared computer).
- **From any other computer**: sign it in to your tailnet (install Tailscale), then open `https://<machine>.<tailnet>.ts.net` (here: https://dell-linux.tailb356b0.ts.net). Every hub on the tailnet shows up in the sidebar, whichever one you open.
- **Not on the public internet, on purpose**: the hub runs agents that can edit and push your code, so it only answers your Tailscale identity or the local machine. Tailscale Funnel traffic is refused.
- **Navigation**: a tab bar on every screen of the phone (Machines, Threads, Projects, Accounts, Files) reaches every section from anywhere, including from inside a thread. It points at the open machine, or else the last one you opened. It steps aside while the keyboard is up. On desktop the same sections sit under the open machine in the sidebar.
- **Desktop layout** (1000px and wider): machines, account meters and threads in a sidebar, the open screen beside it. Enter sends, Shift+Enter is a new line. Chrome, Edge and Firefox can install it as an app (address bar → Install) and show its notifications.

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
- **Queue and stop**: every message joins the thread's queue. It runs at once if the thread is idle, otherwise after the current turn ends, whether it finished, failed or you stopped it. Queued messages can be edited (pulled back into the input) or removed. While a turn runs and the input is empty, the send button is Stop. With more queued, only failures send a notification.
- **Permissions**: per thread, like model and effort: Auto mode, Ask me, Accept edits, Plan only, Bypass permissions (`--permission-mode`; Ask me is `manual`). For Codex, plan runs `read-only`, bypass runs `danger-full-access`, the rest `workspace-write`.
- **Approvals**: whenever Claude would ask permission (always in Ask me, for commands in Accept edits), `hub/mcp.mjs` (its `--permission-prompt-tool`, the hub's stdio MCP server) posts the request to the hub with a per-start token. The thread shows an Allow/Deny card, the phone gets a "needs you" notification, and the agent waits up to an hour. Stopping the turn or no answer counts as a deny. Codex has no prompts to relay.
- **Tool calls**: each step opens to its command and output, an edit's diff, or the error. The agent's latest to-do list shows as a plan card at the top of the turn.
- **Questions**: Claude's AskUserQuestion goes through the same relay and becomes a question card: tap an option (several where it says Pick any) or write your own, then Send answer, or Skip to let it decide. The answers go back as `updatedInput.answers`, the format Claude Code expects. The phone gets a "Claude asks" notification.
- **New projects**: Projects tab → Start a project from a folder (or "New project from a folder…" in the new-thread project picker). Browse the machine's whole disk (every drive on Windows; hidden folders on request), use a folder as it is or make a new one, then Start project here. That runs `hub project <folder>`: `git init` (secret-looking files go into `.gitignore` before the first commit), a private GitHub repo via `gh` (untick it to stay local), the index (folders outside `~` are remembered in `~/.claude/hub/roots.txt`) and a graphify graph in the background. You land on a new thread in it. `hub project` and `hub graph <folder>` work from a terminal too.
- **Files from the agent**: every turn gets the hub's `attach_file` tool (`hub/mcp.mjs`; Claude through `--mcp-config` plus a line in its system prompt saying the user can't see this disk, Codex through `mcp_servers.hub` with the tool pre-approved). The agent attaches reports, charts, CSVs, logs and changed files; they show as cards in the chat (images with a preview) that open in the file viewer or download. A copy is kept with the thread, so it still opens after the original moves. Folders, secret-looking files and anything over 50 MB are refused with a reason the agent sees. Files you upload open the same way.
- **Files (read-only)**: the **Files** tab (Files under the machine in the desktop sidebar) browses its whole disk, files included, with a filter and hidden files on request. Tapping a file opens a viewer: code and text with line numbers and a wrap toggle (first 1 MB), Markdown rendered or as source, CSV as a table, images (tap for actual size), PDFs, and Download for anything else. Secret-looking files (`.env*`, keys, `.ssh/`, credentials) need a Reveal tap. Files from disk never run in the app: raw bytes go out with a no-scripts sandbox and `nosniff`, and anything that isn't an image or PDF downloads. Each file has Download, Share (iPhone share sheet), Copy path, and Ask the agent (a new thread in the file's project with its path typed). Editing will add a Save to the same viewer.
- **Attachments**: images and any other file (PDF, CSV, code, zip; up to ten, 20 MB each), from the picker, by pasting, or by dropping onto the composer. Files keep their names under `~/.claude/hub/uploads/<thread>/`; the agent is told the paths. Tapping a file in the thread downloads it (always as a download, never opened in the app).
- **Images**: attach up to six from the composer or the new-thread form. The phone downscales them to JPEG; they're stored in `~/.claude/hub/uploads/<thread>/`. Claude is told the paths and opens them with Read; Codex gets them as `--image`.
- **Edit and Retry**: Edit on a sent message, or Retry on the last reply, drops that message and everything after it (kept in `threads/archive/<id>.rewound.jsonl`) and sends it again in a fresh session that gets a recap of the earlier turns. Files the agent already changed stay changed.
- **Change summary**: each turn ends with the files it changed in its repo (`git diff --numstat` against HEAD at turn start, plus new files), and whether `hub push` got them to the remote: Pushed `<sha>`, Not pushed, or Local only (no upstream).
- **Skill routing**: a global `UserPromptSubmit` hook tells every Claude session (terminal, both accounts, the app) to load `stack-router` first. Codex turns get the same instruction prepended. The skills each turn loaded show as labels under the agent's name.
- **Updates**: the hub restarts itself when its own code changes on disk (an edit, or the hooks' `git pull`), once no turn or push is running, so a hub never keeps starting turns against files that moved. `hub/approve.mjs` stays as a stub of `mcp.mjs` for hubs still on older code.
- **Unattended by default**: new threads use `--permission-mode auto` (Claude) and `workspace-write` (Codex). Set `HUB_PERMISSION_MODE` in the unit to change the default.

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
