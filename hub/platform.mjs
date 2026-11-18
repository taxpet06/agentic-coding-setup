// Cross-platform process helpers for the hub server, CLI and profile launcher (Linux, macOS, Windows).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

export const WIN = process.platform === 'win32';
export const HOME = os.homedir();

// services and logon tasks start with a bare PATH; add the usual user tool dirs after whatever PATH says
export function widenPath() {
  const dirs = [path.join(HOME, '.local', 'bin'), path.join(HOME, '.n', 'bin'), path.join(HOME, '.local', 'node', 'bin'), path.dirname(process.execPath)];
  if (WIN) dirs.push(path.join(process.env.APPDATA ?? path.join(HOME, 'AppData', 'Roaming'), 'npm'), 'C:\\Program Files\\Tailscale', 'C:\\Program Files\\Git\\cmd');
  const cur = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) if (!cur.includes(d)) cur.push(d);
  process.env.PATH = cur.join(path.delimiter);
}

// first match on PATH; on Windows only real executables (PATHEXT), never a bash script called `hub` or `claude`
export function which(name) {
  const exts = WIN ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').toLowerCase().split(';').filter(Boolean) : [''];
  for (const d of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!d) continue;
    for (const e of exts) {
      const f = path.join(d, name + e);
      try { if (!fs.statSync(f).isFile()) continue; if (!WIN) fs.accessSync(f, fs.constants.X_OK); return f; } catch {}
    }
  }
  return null;
}

// What to spawn for a command: { cmd, pre } so spawn(cmd, [...pre, ...args]) works without a shell.
// Windows can't spawn npm's .cmd shims without one (and cmd.exe would mangle quoted args like -c key="v"),
// so run the JS file the shim points at with this node instead.
export function command(name) {
  const f = which(name);
  if (!f) return null;
  if (WIN && /\.(cmd|bat)$/i.test(f)) {
    const js = parseShim(fs.readFileSync(f, 'utf8'), path.dirname(f));
    return js ? { cmd: process.execPath, pre: [js] } : { cmd: f, pre: [], shell: true };
  }
  return { cmd: f, pre: [] };
}
// npm's shims run `"%dp0%\node_modules\pkg\bin\x.js" %*` (older ones `%~dp0\`)
export function parseShim(text, dir) {
  const m = text.match(/"%~?dp0%?\\([^"]+?\.(?:js|cjs|mjs))"/i);
  return m ? path.join(dir, ...m[1].split('\\')) : null;
}

// agent turns: their own process group on Unix (so the whole tree can be stopped), no console window on Windows
export const childOpts = { detached: !WIN, windowsHide: true };

// stop a process and everything it started
export function killTree(child) {
  if (!child?.pid) return;
  if (WIN) { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {}); return; }
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000).unref();
}
export function killPid(pid) {
  if (!pid) return;
  if (WIN) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
  else try { process.kill(pid, 'SIGTERM'); } catch {}
}
export const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// run a node script in the background, outliving us (hooks return at once; the work carries on)
export function background(args, log, opts = {}) {
  const out = log ? fs.openSync(log, 'a') : 'ignore';
  const c = spawn(process.execPath, args, { detached: true, windowsHide: true, stdio: ['ignore', out, out], ...opts });
  c.unref();
  return c;
}
