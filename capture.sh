#!/usr/bin/env bash
# Inverse of bootstrap.sh: copy the live setup on this machine into the repo, ready to commit.
set -euo pipefail
R="$(cd "$(dirname "$0")" && pwd)"
cp ~/.claude/CLAUDE.md ~/.claude/settings.json "$R/claude/"
sync_dir() { rsync -a --delete --exclude='gsd-*' --exclude=synced "$1/" "$2/"; }   # gsd-* come from the installer
sync_dir ~/.claude/skills "$R/claude/skills"
sync_dir ~/.agents/skills "$R/agents-skills"
cp ~/.codex/AGENTS.md ~/.codex/config.toml ~/.codex/hooks.json "$R/codex/"
rsync -a --delete ~/.codex/rules/ "$R/codex/rules/"
rsync -a --delete ~/.codex/skills/ "$R/codex/skills/"
echo "captured. review with: git -C $R status && git -C $R diff --stat"
