#!/usr/bin/env bash
# Idempotent: install this repo's Claude/Codex setup into $HOME and update everything.
# Safe to re-run after every `git pull`.
set -uo pipefail
R="$(cd "$(dirname "$0")" && pwd)"
step() { printf '\n==> %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
export PATH="$HOME/.local/bin:$HOME/.n/bin:$HOME/.local/node/bin:$PATH"

step "prerequisites"
if ! have node; then   # user-space install, no sudo needed
  v=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o 'node-v[0-9.]*-linux-x64.tar.xz' | head -1)
  mkdir -p ~/.local/node && curl -fsSL "https://nodejs.org/dist/latest-v22.x/$v" | tar -xJ -C ~/.local/node --strip-components=1
  for b in node npm npx; do ln -sfn ~/.local/node/bin/$b ~/.local/bin/$b; done
fi
have git  || echo "MISSING git"
have claude || { curl -fsSL https://claude.ai/install.sh | bash; }
have uv || curl -LsSf https://astral.sh/uv/install.sh | sh
have npm && { have codex || npm i -g @openai/codex; npm i -g defuddle vercel; }
have uv && uv tool install graphifyy >/dev/null 2>&1 || true

step "claude shared config -> ~/.claude (existing files backed up once)"
mkdir -p ~/.claude/skills ~/.local/bin ~/.agents/skills
for f in CLAUDE.md settings.json; do
  [ -f ~/.claude/$f ] && ! cmp -s "$R/claude/$f" ~/.claude/$f && cp -n ~/.claude/$f ~/.claude/$f.pre-setup
  cp "$R/claude/$f" ~/.claude/$f
done
# hooks hardcode the source machine's node path and home; point them at this machine's
sed -i "s#\"/usr/bin/node\"#\"$(command -v node)\"#g; s#/home/petros#$HOME#g" ~/.claude/settings.json
mkdir -p ~/.claude/hooks
cp -a "$R/claude/skills/." ~/.claude/skills/
cp -a "$R/agents-skills/." ~/.agents/skills/
install -m755 "$R/claude/bin/claude-profile" ~/.local/bin/claude-profile
for p in personal school; do ln -sfn claude-profile ~/.local/bin/claude-$p; done

step "plugins + marketplaces"
claude plugin marketplace add DietrichGebert/ponytail 2>&1 | tail -1
claude plugin marketplace update 2>&1 | tail -1
claude plugin install ponytail@ponytail 2>&1 | tail -1
claude plugin update ponytail@ponytail 2>&1 | tail -1

step "GSD (skills, agents, hooks for Claude + Codex)"
have npx && npx -y get-shit-done-cc@latest --claude --codex --global

step "MCP servers (user scope; claude-personal/school copy these on launch)"
claude mcp get dali-os >/dev/null 2>&1 || claude mcp add --scope user --transport http dali-os https://os.dali.dartmouth.edu/mcp
echo "see mcp.md for the OAuth logins and the linkedin MCP"

step "codex"
mkdir -p ~/.codex/rules ~/.codex/skills
cp -a "$R/codex/AGENTS.md" "$R/codex/hooks.json" ~/.codex/
cp -a "$R/codex/rules/." ~/.codex/rules/; cp -a "$R/codex/skills/." ~/.codex/skills/
[ -f ~/.codex/config.toml ] || cp "$R/codex/config.toml" ~/.codex/config.toml   # machine-specific paths: never overwritten
echo "codex/config.toml is only copied on first run; diff it by hand after that"

step "manual logins still needed (tokens are never in this repo)"
for c in "gh auth status" "claude auth status" "codex login status"; do $c >/dev/null 2>&1 || echo "  run: ${c%% status}"; done
echo "  claude-personal / claude-school: log in once each (/login)"
echo "  claude.ai connectors (Gmail, Drive, Notion, Higgsfield...) follow your claude.ai account automatically"
