#!/usr/bin/env node
// Run Claude Code under a separate account while sharing ~/.claude skills, plugins, agents, CLAUDE.md, settings
// and user-scope MCP servers.   node claude-profile.mjs <profile> [claude args...]
// The claude-personal / claude-school launchers (bash and .cmd, written by bootstrap.sh) call this.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { WIN, HOME, command, widenPath } from './platform.mjs';

export function prepareProfile(profile) {
  const main = path.join(HOME, '.claude'), dir = path.join(HOME, `.claude-${profile}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['skills', 'agents', 'plugins', 'CLAUDE.md', 'settings.json']) {
    const src = path.join(main, f), dst = path.join(dir, f);
    if (!fs.existsSync(src)) continue;
    const isDir = fs.statSync(src).isDirectory();
    let st = null; try { st = fs.lstatSync(dst); } catch {}
    if (st?.isSymbolicLink()) continue; // symlink, or a junction on Windows
    // ponytail: Windows can't symlink a file without Developer Mode, so files are copies refreshed on every launch
    if (st && WIN && !isDir && st.isFile()) { fs.copyFileSync(src, dst); continue; }
    if (st) fs.renameSync(dst, `${dst}.bak-${Date.now()}`);
    try { fs.symlinkSync(src, dst, isDir ? 'junction' : 'file'); } // junctions need no admin rights on Windows
    catch (e) { if (isDir) throw e; fs.copyFileSync(src, dst); }
  }
  // user-scope MCP servers live in .claude.json, which also holds this profile's account state, so it can't be
  // linked: copy just the mcpServers key across. ponytail: last writer wins if this profile is already running.
  try {
    const want = JSON.parse(fs.readFileSync(path.join(HOME, '.claude.json'), 'utf8')).mcpServers ?? {};
    const dst = path.join(dir, '.claude.json');
    const cur = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst, 'utf8')) : {};
    if (JSON.stringify(cur.mcpServers) !== JSON.stringify(want)) {
      cur.mcpServers = want;
      fs.writeFileSync(`${dst}.tmp`, JSON.stringify(cur, null, 2), { mode: 0o600 });
      fs.renameSync(`${dst}.tmp`, dst);
    }
  } catch {}
  return dir;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [profile, ...args] = process.argv.slice(2);
  if (!profile) { console.error('usage: claude-profile.mjs <profile> [claude args...]'); process.exit(1); }
  widenPath();
  const dir = prepareProfile(profile);
  const c = command('claude');
  if (!c) { console.error('claude is not installed (see bootstrap.sh)'); process.exit(127); }
  const child = spawn(c.cmd, [...c.pre, ...args], { stdio: 'inherit', shell: c.shell, env: { ...process.env, CLAUDE_CONFIG_DIR: dir } });
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => {}); // the terminal signals claude directly; just outlive it
  child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
}
