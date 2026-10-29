# MCP connections

| Server | Scope | How |
|---|---|---|
| `dali-os` (https://os.dali.dartmouth.edu/mcp) | Claude user scope + Codex | `bootstrap.sh` adds it. First use: run `/mcp` in claude, pick dali-os, complete the browser OAuth. Codex: `codex mcp login dali-os`. |
| `airtable` (`npx -y airtable-mcp-server`) | Claude user scope | `bootstrap.sh` adds it. Reads `AIRTABLE_API_KEY` from the environment: create a personal access token at airtable.com/create/tokens and `export AIRTABLE_API_KEY=...` in `~/.bashrc` (never commit it). Token scopes decide read vs write; add `data.records:write` and `schema.bases:write` to edit. |
| `linkedin-profile-manager` | Codex only | Lives in the `Recruiting` repo: `git clone https://github.com/taxpet06/Recruiting ~/Recruiting`, then build `~/Recruiting/.tools/linkedin-profile-manager-mcp` (`npm i && npm run build`). Needs its own `linkedin-mcp.config.json` (secret, gitignored there). |
| `node_repl` (Codex) | Codex | Ships with the ChatGPT/Codex desktop app; only present where that app is installed. Skip on headless boxes. |
| claude.ai connectors (Gmail, Calendar, Drive, Notion, Higgsfield, Claude Docs) | claude.ai account | Nothing to install; enable at claude.ai/settings/connectors and they appear in every logged-in profile. |

`claude-personal` / `claude-school` copy the `mcpServers` key from `~/.claude.json` on every launch, so add user-scope servers once with `claude mcp add --scope user ...` under plain `claude`.
