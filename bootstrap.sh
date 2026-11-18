#!/usr/bin/env bash
# Idempotent: install this repo's Claude/Codex setup into $HOME and update everything.
# Safe to re-run after every `git pull`. Linux, macOS, and Windows (run it in Git Bash, which Claude Code needs anyway).
set -uo pipefail
R="$(cd "$(dirname "$0")" && pwd)"
step() { printf '\n==> %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) WIN=1 ;; *) WIN= ;; esac
ps() { powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$*"; }
export PATH="$HOME/.local/bin:$HOME/.n/bin:$HOME/.local/node/bin:$PATH"
[ -n "$WIN" ] && export PATH="$PATH:$APPDATA/npm:/c/Program Files/nodejs:/c/Program Files/Tailscale"
mkdir -p ~/.local/bin
# a command in ~/.local/bin that runs a Node script from this repo: bash launcher, plus a .cmd one on Windows
launcher() {   # $1 = name, $2 = script (relative to the repo), $3 = optional fixed first argument
  local n=$1 js=$2 a=${3:-}
  printf '#!/usr/bin/env bash\nexec node "%s/%s" %s"$@"\n' "$R" "$js" "${a:+$a }" > ~/.local/bin/$n && chmod +x ~/.local/bin/$n
  [ -n "$WIN" ] && printf '@node "%s\\%s" %s%%*\r\n' "$(cygpath -w "$R")" "${js//\//\\}" "${a:+$a }" > ~/.local/bin/$n.cmd
  return 0
}

step "prerequisites"
if ! have node; then
  if [ -n "$WIN" ]; then winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  else   # user-space install, no sudo needed
    arch=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/'); os=$(uname -s | tr A-Z a-z)
    v=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v[0-9.]*-$os-$arch.tar.xz" | head -1)
    mkdir -p ~/.local/node && curl -fsSL "https://nodejs.org/dist/latest-v22.x/$v" | tar -xJ -C ~/.local/node --strip-components=1
    for b in node npm npx; do ln -sfn ~/.local/node/bin/$b ~/.local/bin/$b; done
  fi
fi
have node || { echo "MISSING node: install Node.js 22+ and re-run"; exit 1; }
have git  || echo "MISSING git"
if [ -n "$WIN" ]; then
  have claude || ps "irm https://claude.ai/install.ps1 | iex"
  have uv || ps "irm https://astral.sh/uv/install.ps1 | iex"
else
  have claude || { curl -fsSL https://claude.ai/install.sh | bash; }
  have uv || curl -LsSf https://astral.sh/uv/install.sh | sh
fi
have npm && { have codex || npm i -g @openai/codex; npm i -g defuddle vercel; }
[ -z "$WIN" ] && for b in codex defuddle vercel; do [ -x "$(npm prefix -g 2>/dev/null)/bin/$b" ] && ln -sfn "$(npm prefix -g)/bin/$b" ~/.local/bin/$b; done   # (Windows: npm's global dir is already on PATH)
have uv && uv tool install 'graphifyy[pdf]' >/dev/null 2>&1 || true   # [pdf] = pypdf, needed to extract PDF text

step "claude shared config -> ~/.claude (existing files backed up once)"
mkdir -p ~/.claude/skills ~/.local/bin ~/.agents/skills
for f in CLAUDE.md settings.json; do
  [ -f ~/.claude/$f ] && ! cmp -s "$R/claude/$f" ~/.claude/$f && cp -n ~/.claude/$f ~/.claude/$f.pre-setup
  cp "$R/claude/$f" ~/.claude/$f
done
# hooks hardcode the source machine's node path and home; point them at this machine's
sed -i "s#/home/petros/#$HOME/#g; s#/usr/bin/node#$(command -v node)#g" ~/.claude/settings.json   # home first + trailing slash, so a $HOME like /home/petros_x is not rewritten twice
mkdir -p ~/.claude/hooks
cp -a "$R/claude/skills/." ~/.claude/skills/
cp -a "$R/agents-skills/." ~/.agents/skills/
rm -f ~/.local/bin/claude-profile   # the old bash wrapper
for p in personal school; do rm -f ~/.local/bin/claude-$p; launcher claude-$p hub/claude-profile.mjs $p; done

step "cloned skill packs: clone/pull, link each skills/<name> into ~/.agents/skills (Codex) and ~/.claude/skills (Claude)"
skill_pack() {   # $1 = github owner/repo, $2 = dir under ~/.agents
  local A=~/.agents/$2
  [ -d $A/.git ] && git -C $A pull -q || git clone -q --depth 1 https://github.com/$1.git $A
  for d in $A/skills/*/; do n=$(basename "$d")
    if [ -n "$WIN" ]; then   # Git Bash can't make real symlinks without Developer Mode: fresh copies each run
      for t in ~/.agents/skills/$n ~/.claude/skills/$n; do rm -rf "$t"; cp -r "${d%/}" "$t"; done
    else ln -sfn "${d%/}" ~/.agents/skills/$n; ln -sfn ../../.agents/skills/$n ~/.claude/skills/$n; fi
  done
}
skill_pack artemnovitckii/claude-animation-skills claude-animation-skills   # /graph, /map-route, /stick-figure ...
skill_pack Jeffallan/claude-skills fullstack-dev-skills                      # 67 language/framework experts
A=~/.agents/claude-animation-skills
# ponytail: needs ffmpeg + python3; --voice pulls ~1 GB of models (stick-figure / zach-d-films only), skipped if already there
have ffmpeg && bash $A/kit/setup.sh --voice 2>&1 | tail -3 || echo "  MISSING ffmpeg: sudo apt install ffmpeg, then: bash $A/kit/setup.sh --voice"

step "plugins + marketplaces"
claude plugin marketplace add DietrichGebert/ponytail 2>&1 | tail -1
claude plugin marketplace update 2>&1 | tail -1
claude plugin install ponytail@ponytail 2>&1 | tail -1
claude plugin update ponytail@ponytail 2>&1 | tail -1

step "GSD (skills, agents, hooks for Claude + Codex)"
have npx && npx -y get-shit-done-cc@latest --claude --codex --global

step "MCP servers (user scope; claude-personal/school copy these on launch)"
claude mcp get dali-os >/dev/null 2>&1 || claude mcp add --scope user --transport http dali-os https://os.dali.dartmouth.edu/mcp
have npx && { claude mcp get airtable >/dev/null 2>&1 || claude mcp add --scope user airtable -- npx -y airtable-mcp-server; }   # needs AIRTABLE_API_KEY exported in ~/.bashrc
echo "see mcp.md for the OAuth logins and the linkedin MCP"

step "codex"
mkdir -p ~/.codex/rules ~/.codex/skills
cp -a "$R/codex/AGENTS.md" "$R/codex/hooks.json" ~/.codex/
cp -a "$R/codex/rules/." ~/.codex/rules/; cp -a "$R/codex/skills/." ~/.codex/skills/
# GSD generates config.toml; append only the portable settings once (full desktop config: codex/config.toml)
grep -q 'agentic-coding-setup' ~/.codex/config.toml 2>/dev/null || { echo; cat "$R/codex/config.portable.toml"; } >> ~/.codex/config.toml
grep -q '^model = ' ~/.codex/config.toml || sed -i '1i model = "gpt-5.6-luna"\nmodel_reasoning_effort = "medium"' ~/.codex/config.toml   # top-level keys must precede tables
sed -i 's#/home/petros/#'"$HOME"'/#g' ~/.codex/hooks.json

step "project hub (see HUB.md): index repos, let hub sessions work anywhere under \$HOME"
rm -f ~/.local/bin/hub; launcher hub hub/cli.mjs
have npm && (cd "$R/hub" && npm ci --omit=dev --no-fund --no-audit 2>&1 | tail -1)   # Hub app agent deps (web-push)
# restart a running agent on the pulled code
{ systemctl --user is-active -q hub-agent 2>/dev/null || [ -f ~/.claude/hub/agent.pid ]; } && ~/.local/bin/hub app >/dev/null
[ -z "$WIN" ] && ! have tmux && echo "  optional: tmux makes 'hub serve' attachable (sudo apt install tmux)"
# gitignored, machine-specific: phone sessions started in this repo may touch any repo in \$HOME
H=$HOME; [ -n "$WIN" ] && H=$(cygpath -m "$HOME")
mkdir -p "$R/.claude"; [ -f "$R/.claude/settings.local.json" ] || printf '{"permissions":{"additionalDirectories":["%s"]}}\n' "$H" > "$R/.claude/settings.local.json"
~/.local/bin/hub scan

step "tailscale (install or update; needs sudo)"
if [ -n "$WIN" ]; then
  have tailscale || winget install -e --id Tailscale.Tailscale --silent --accept-package-agreements --accept-source-agreements
  echo "  Windows: sign in from the Tailscale tray icon, then run: hub app   (and hub serve for Remote Control)"
else
install -m755 "$R/bin/tailscale_install" "$R/bin/tailscale_up" ~/.local/bin/
if [ -t 0 ] || sudo -n true 2>/dev/null; then
  ~/.local/bin/tailscale_install || echo "  TAILSCALE INSTALL FAILED (see above)"
else
  echo "  no terminal for sudo: skipped. tailscale_up installs it on first run."
fi
fi

step "manual logins still needed (tokens are never in this repo)"
for c in "gh auth status" "claude auth status" "codex login status"; do $c >/dev/null 2>&1 || echo "  run: ${c%% status}"; done
tailscale status >/dev/null 2>&1 || { [ -n "$WIN" ] && echo "  sign in to Tailscale (tray icon)" || echo "  run: tailscale_up   (joins the tailnet with SSH enabled)"; }
echo "  claude-personal / claude-school: log in once each (/login)"
echo "  claude.ai connectors (Gmail, Drive, Notion, Higgsfield...) follow your claude.ai account automatically"
