# agentic-coding-setup

One repo for Claude Code (`~/.claude`, `claude-personal`, `claude-school`) and Codex (`~/.codex`).

| Path | Goes to | Notes |
|---|---|---|
| `claude/CLAUDE.md`, `settings.json` | `~/.claude/` | hooks, plugins, marketplaces, model |
| `claude/skills/` | `~/.claude/skills/` | non-GSD skills; some are symlinks into `~/.agents/skills` |
| `agents-skills/` | `~/.agents/skills/` | expo/eas/emil/etc. |
| `claude/bin/claude-profile` | `~/.local/bin/` | `claude-personal` / `claude-school` symlinks share skills, plugins, agents, settings, MCP from `~/.claude`; only login/history differ |
| `codex/` | `~/.codex/` | `config.toml` is the desktop-app config for reference; `config.portable.toml` is appended on other machines |
| `mcp.md` | n/a | MCP connection instructions |

Not stored (reinstalled by `bootstrap.sh`): GSD (`npx get-shit-done-cc`), the ponytail plugin, codex plugins cache, CLIs (codex, graphify, defuddle, vercel).

## Workflow
- New machine: clone, run `claude` in the clone, say "Set everything up for me" (or just `./bootstrap.sh`), then do the manual logins.
- After adding something cool: `./capture.sh && git add -A && git commit -m "..." && git push`.
- Other machine: `git pull && ./bootstrap.sh`.
