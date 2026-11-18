# agentic-coding-setup

One repo for Claude Code (`~/.claude`, `claude-personal`, `claude-school`) and Codex (`~/.codex`).

| Path | Goes to | Notes |
|---|---|---|
| `claude/CLAUDE.md`, `settings.json` | `~/.claude/` | hooks, plugins, marketplaces, model |
| `claude/skills/` | `~/.claude/skills/` | non-GSD skills; some are symlinks into `~/.agents/skills` |
| `agents-skills/` | `~/.agents/skills/` | expo/eas/emil/etc. |
| `claude/bin/claude-profile` | `~/.local/bin/` | `claude-personal` / `claude-school` symlinks share skills, plugins, agents, settings, MCP from `~/.claude`; only login/history differ |
| `bin/tailscale_up`, `bin/tailscale_install` | `~/.local/bin/` | `tailscale_up` installs/updates tailscale if missing (via `tailscale_install`), starts tailscaled, runs `tailscale up --ssh`, prints the `ssh` command. `bootstrap.sh` also runs `tailscale_install` when it can sudo |
| (cloned, not stored) | `~/.agents/claude-animation-skills` | [animation skills](https://github.com/artemnovitckii/claude-animation-skills) (`/graph`, `/map-route`, `/stick-figure`, ...). `bootstrap.sh` clones/pulls it, links each skill into `~/.agents/skills` (Codex) and `~/.claude/skills` (Claude, shared by both profiles), runs `kit/setup.sh --voice` |
| (cloned, not stored) | `~/.agents/fullstack-dev-skills` | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills): 67 language/framework experts (`python-pro`, `react-expert`, `the-fool`, ...), linked the same way. Its `commands/` workflows are not linked |
| `hub/` | runs in place | the Hub phone app: `server.mjs` (per-machine agent, systemd `hub-agent`), `lib.mjs` (account choice, project matching, CLI event parsing), `public/` (PWA), `test.mjs`. Started by `hub app` / `tailscale_up` |
| `bin/hub` | `~/.local/bin/` | project hub: indexes every repo under `$HOME` (`hub find battlefield`), graphify graphs, auto pull/commit/push hooks, and `hub serve` = Remote Control for the Claude iOS app. `tailscale_up` starts it. Details: `HUB.md` |
| `codex/` | `~/.codex/` | `config.toml` is the desktop-app config for reference; `config.portable.toml` is appended on other machines |
| `mcp.md` | n/a | MCP connection instructions |

Not stored (reinstalled by `bootstrap.sh`): GSD (`npx get-shit-done-cc`), the ponytail plugin, codex plugins cache, CLIs (codex, graphify, defuddle, vercel).

## Workflow
- New machine: clone, run `claude` in the clone, say "Set everything up for me" (or just `./bootstrap.sh`), then do the manual logins.
- After adding something cool: `./capture.sh && git add -A && git commit -m "..." && git push`.
- Other machine: `git pull && ./bootstrap.sh`.
