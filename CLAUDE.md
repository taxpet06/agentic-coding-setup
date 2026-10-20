# agentic-coding-setup

Private repo holding this user's Claude Code + Codex setup. If the user says "set everything up" (or similar):

1. Read `README.md` and `mcp.md`.
2. Run `./bootstrap.sh`, read its output, and fix anything it flagged (missing node/pipx, etc.), then re-run until clean.
3. Walk the user through the manual logins it lists. Never ask them to paste tokens into files in this repo.
4. Verify: `claude plugin list`, `claude mcp list`, `ls ~/.claude/skills | head`, `ls ~/.codex`.

To save a new skill/plugin/setting from this machine: `./capture.sh`, review `git diff --stat`, commit, push.
Never commit credentials: `.credentials.json`, `.claude.json`, `auth.json`, `history.jsonl`, `projects/`, `sessions/`, `*.sqlite`.
