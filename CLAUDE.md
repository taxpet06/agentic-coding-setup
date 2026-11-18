# agentic-coding-setup

Private repo holding this user's Claude Code + Codex setup. If the user says "set everything up" (or similar):

1. Read `README.md` and `mcp.md`.
2. Run `./bootstrap.sh`, read its output, and fix anything it flagged (missing node/pipx, etc.), then re-run until clean.
3. Walk the user through the manual logins it lists. Never ask them to paste tokens into files in this repo.
4. Verify: `claude plugin list`, `claude mcp list`, `ls ~/.claude/skills | head`, `ls ~/.codex`.

To save a new skill/plugin/setting from this machine: `./capture.sh`, review `git diff --stat`, commit, push.
Never commit credentials: `.credentials.json`, `.claude.json`, `auth.json`, `history.jsonl`, `projects/`, `sessions/`, `*.sqlite`.

## Hub mode (this repo is the phone entry point; see HUB.md)
When the user names a project ("do X for battlefield"):
1. `hub find battlefield` → name, path, graph. Several hits: pick the top-level repo unless the request names a sub-repo; ask only if truly ambiguous. No hit: `hub scan`, then retry.
2. Work in that path with absolute paths (`$HOME` is an additional directory here). Load that repo's own `CLAUDE.md` first.
3. Before grepping, ask its graph: `graphify query "<question>" --graph <graph>` (when graph is not `-`).
4. Don't git pull/commit/push by hand: hooks pull every repo at session start and commit+push touched repos (yours only) after every turn. Sync problems show up at session start; fix those first.
