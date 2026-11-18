#!/usr/bin/env node
// Project hub CLI (Linux, macOS, Windows). Index every git repo on this machine, keep them synced with their
// remotes, run the Hub app agent, and serve this repo to the Claude iOS app over Remote Control. See HUB.md.
//   hub scan [--graph]   index repos -> ~/.claude/hub/projects.tsv (--graph: build/refresh graphify graphs too)
//   hub find <word>      look a project up by any part of its path
//   hub pull             fast-forward every repo that has an upstream
//   hub push <repo>...   commit (auto-sync msg) + pull --rebase + push those repos
//   hub serve            start `claude remote-control` for the hub in the background
//   hub app [stop|logs]  run the Hub app agent as a service and publish it at https://<host>.<tailnet>.ts.net
//   hub selftest         sanity-check push/secret guard against a throwaway repo, then the app's logic tests
//   hub hook-start|hook-touch|hook-stop   Claude Code hooks (claude/settings.json)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { WIN, HOME, which, command, widenPath, killPid, alive, background } from './platform.mjs';

widenPath();
const H = path.join(HOME, '.claude', 'hub');
for (const d of ['graphs', 'touched']) fs.mkdirSync(path.join(H, d), { recursive: true });
const INDEX = path.join(H, 'projects.tsv');
const HUB_DIR = process.env.HUB_DIR || path.resolve(import.meta.dirname, '..');
const SELF = path.join(import.meta.dirname, 'cli.mjs');
const PORT = Number(process.env.HUB_PORT || 7787);
process.env.GIT_TERMINAL_PROMPT = '0'; // a missing credential fails fast instead of hanging a background job
// never auto-commit these; the repo is skipped and reported instead
const SECRETS = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|id_(rsa|ed25519).*|credentials\.json|\.credentials\.json|auth\.json|.*\.sqlite)$/;
const pushOnly = () => new RegExp(process.env.HUB_PUSH_ONLY || 'github\\.com[:/]taxpet06/');

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 60_000, ...opts });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};
const git = (cwd, args, timeout) => run('git', ['-C', cwd, ...args], timeout ? { timeout } : {});

async function fail(msg) {
  const line = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${msg}`;
  fs.appendFileSync(path.join(H, 'failed'), line + '\n');
  console.error(line);
  // optional phone push for sync problems: ntfy app, a hard-to-guess topic, HUB_NTFY_TOPIC in the environment
  if (process.env.HUB_NTFY_TOPIC) await fetch(`https://ntfy.sh/${process.env.HUB_NTFY_TOPIC}`, { method: 'POST', body: `hub: ${msg}`, signal: AbortSignal.timeout(10_000) }).catch(() => {});
}

// ---------- index ----------
const SKIP = new Set(['node_modules', 'snap', 'AppData', 'Library']);
function* repos(dir = HOME, depth = 0) {
  // ponytail: skips dot-dirs, node_modules, snap, AppData/Library; depth 5 covers ~/Github/org/repo/sub; raise if repos live deeper
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  if (ents.some(e => e.name === '.git')) yield dir; // .git dir, or a file for worktrees and submodules; nested repos still count
  if (depth >= 5) return;
  for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : 1)))
    if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$') && !SKIP.has(e.name)) yield* repos(path.join(dir, e.name), depth + 1);
}
const nameOf = p => path.relative(HOME, p).split(path.sep).join('/');
function scan(graph) {
  const gf = graph === '--graph' ? command('graphify') : null;
  const rows = [];
  for (const p of repos()) {
    const slug = nameOf(p).replace(/\//g, '_');
    if (gf) {
      const out = fs.existsSync(path.join(p, 'graphify-out', 'graph.json'));
      // outside the repo when it has no graph yet: nothing new to commit
      run(gf.cmd, [...gf.pre, ...(out ? ['update', p] : ['extract', p, '--code-only', '--out', path.join(H, 'graphs', slug)])], { timeout: 600_000, shell: gf.shell });
    }
    const g = [path.join(p, 'graphify-out', 'graph.json'), path.join(H, 'graphs', slug, 'graphify-out', 'graph.json')].find(f => fs.existsSync(f)) ?? '-';
    const origin = git(p, ['remote', 'get-url', 'origin']);
    rows.push([nameOf(p), p, origin.ok && origin.out ? origin.out : '-', g].join('\t'));
  }
  fs.writeFileSync(`${INDEX}.tmp`, rows.map(r => r + '\n').join(''));
  fs.renameSync(`${INDEX}.tmp`, INDEX);
  console.log(`indexed ${rows.length} repos -> ${INDEX}`);
}
const indexed = () => { if (!fs.existsSync(INDEX)) scan(); return fs.readFileSync(INDEX, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')); };

// ---------- sync ----------
async function pull() {
  for (const [, r] of indexed()) {
    if (!git(r, ['rev-parse', '-q', '--verify', '@{u}']).ok) continue; // local-only repo
    if (!git(r, ['pull', '-q', '--ff-only'], 60_000).ok) await fail(`${r}: can't fast-forward (diverged or offline); next push from a session rebases it`);
  }
}

// ponytail: one global lock (a directory, atomic everywhere); two sessions ending together just queue. Stale after 10 min.
async function locked(f) {
  const lock = path.join(H, 'sync.lock.d');
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 600_000) fs.rmSync(lock, { recursive: true, force: true }); } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
  }
  try { return await f(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}
async function pushOne(r) {
  if (!fs.existsSync(r) || !git(r, ['rev-parse', '-q', '--verify', '@{u}']).ok) return; // no upstream: nothing to push to
  // only auto-commit to your own repos; shared/org/third-party clones are pull-only
  if (!pushOnly().test(git(r, ['remote', 'get-url', 'origin']).out)) return;
  const midRebase = ['rebase-merge', 'rebase-apply'].some(d => fs.existsSync(path.resolve(r, git(r, ['rev-parse', '--git-path', d]).out)));
  if (midRebase) return fail(`${r}: mid-rebase, left alone`);
  if (git(r, ['status', '--porcelain']).out) {
    git(r, ['add', '-A']);
    const secret = git(r, ['diff', '--cached', '--name-only']).out.split('\n').filter(f => SECRETS.test(f));
    if (secret.length) { git(r, ['reset', '-q']); return fail(`${r}: secret-looking file would be committed (${secret.slice(0, 3).join(' ')}); gitignore it`); }
    if (!git(r, ['commit', '-qm', `auto-sync from ${os.hostname()}`]).ok) { git(r, ['reset', '-q']); return fail(`${r}: commit failed (pre-commit hook?)`); }
  }
  if (!git(r, ['pull', '-q', '--rebase', '--autostash'], 120_000).ok) { git(r, ['rebase', '--abort']); return fail(`${r}: pull conflicts with remote, resolve by hand`); }
  if (Number(git(r, ['rev-list', '--count', '@{u}..HEAD']).out) > 0 && !git(r, ['push', '-q'], 120_000).ok) return fail(`${r}: push rejected`);
}
const push = repos => locked(async () => { for (const r of repos) await pushOne(r); });

// ---------- remote control + the app agent ----------
const pidOf = f => { try { return Number(fs.readFileSync(path.join(H, f), 'utf8')) || null; } catch { return null; } };
function serve() {
  const args = [path.join(import.meta.dirname, 'claude-profile.mjs'), process.env.HUB_PROFILE || 'personal', 'remote-control', '--name', 'hub', '--spawn', 'same-dir', '--permission-mode', 'auto'];
  git(HUB_DIR, ['remote', 'set-head', 'origin', '-a']); // else remote sessions land on a generated branch
  if (!WIN && which('tmux')) { // Linux/macOS: a tmux session you can attach to
    if (run('tmux', ['has-session', '-t', 'hub']).ok) return console.log('hub already serving (tmux attach -t hub)');
    run('tmux', ['new-session', '-d', '-s', 'hub', '-c', HUB_DIR, [process.execPath, ...args].map(a => `'${a.replace(/'/g, `'\\''`)}'`).join(' ') + "; read -p 'remote-control exited, enter to close'"]);
    return console.log("hub serving: Claude iOS app -> Code -> session 'hub'   (watch: tmux attach -t hub)");
  }
  if (alive(pidOf('serve.pid'))) return console.log(`hub already serving (log: ${path.join(H, 'serve.log')})`);
  const c = background(args, path.join(H, 'serve.log'), { cwd: HUB_DIR });
  fs.writeFileSync(path.join(H, 'serve.pid'), String(c.pid));
  console.log(`hub serving: Claude iOS app -> Code -> session 'hub'   (log: ${path.join(H, 'serve.log')})`);
}

const systemd = () => !WIN && run('systemctl', ['--user', 'show-environment']).ok;
const TASK = 'HubAgent';
async function app(arg) {
  const server = path.join(HUB_DIR, 'hub', 'server.mjs');
  if (arg === 'stop') {
    if (systemd()) run('systemctl', ['--user', 'disable', '--now', 'hub-agent']);
    if (WIN) { run('schtasks', ['/End', '/TN', TASK]); run('schtasks', ['/Delete', '/F', '/TN', TASK]); }
    killPid(pidOf('agent.pid'));
    run('tailscale', ['serve', '--https=443', 'off']);
    return console.log('hub app stopped');
  }
  if (arg === 'logs') {
    if (systemd() && run('systemctl', ['--user', 'is-enabled', 'hub-agent']).ok) return console.log(run('journalctl', ['--user', '-u', 'hub-agent', '-n', '80', '--no-pager']).out);
    try { return console.log(fs.readFileSync(path.join(H, 'agent.log'), 'utf8').split('\n').slice(-80).join('\n')); } catch { return console.log('no log yet'); }
  }
  if (!fs.existsSync(path.join(HUB_DIR, 'hub', 'node_modules', 'web-push'))) {
    const r = spawnSync('npm ci --omit=dev --no-fund --no-audit', { cwd: path.join(HUB_DIR, 'hub'), shell: true, stdio: 'inherit' });
    if (r.status !== 0) return console.error(`npm ci failed in ${path.join(HUB_DIR, 'hub')}`);
  }
  if (systemd()) { // Linux: a user service that restarts on failure and starts at login (or boot, with linger)
    const unit = path.join(HOME, '.config', 'systemd', 'user', 'hub-agent.service');
    fs.mkdirSync(path.dirname(unit), { recursive: true });
    fs.writeFileSync(unit, `[Unit]
Description=Hub agent (phone app + agent runner, see ${HUB_DIR}/HUB.md)
After=network-online.target

[Service]
ExecStart=${process.execPath} ${server}
WorkingDirectory=${HUB_DIR}
Environment=HUB_DIR=${HUB_DIR} HUB_PORT=${PORT} PATH=${process.env.PATH}
Restart=on-failure
RestartSec=5
# turns run as child processes; let them finish their own cleanup on stop
KillMode=mixed
TimeoutStopSec=20

[Install]
WantedBy=default.target
`);
    run('systemctl', ['--user', 'daemon-reload']); run('systemctl', ['--user', 'enable', 'hub-agent']);
    run('systemctl', ['--user', 'restart', 'hub-agent']); // restart picks up a `git pull`ed server.mjs
    if (!run('loginctl', ['show-user', os.userInfo().username, '-p', 'Linger']).out.includes('yes')) console.log(`  tip: 'sudo loginctl enable-linger ${os.userInfo().username}' keeps the agent running while you're logged out`);
  } else if (WIN) { // Windows: a logon task running a hidden launcher, so no console window stays open
    killPid(pidOf('agent.pid'));
    const vbs = path.join(H, 'hub-agent.vbs');
    const q = s => `""${s}""`;
    fs.writeFileSync(vbs, `' started at logon by the ${TASK} scheduled task (hub app)\r\nSet sh = CreateObject("WScript.Shell")\r\nsh.CurrentDirectory = "${HUB_DIR}"\r\nsh.Run "${q(process.execPath)} ${q(server)}", 0, False\r\n`);
    const made = run('schtasks', ['/Create', '/F', '/SC', 'ONLOGON', '/RL', 'LIMITED', '/TN', TASK, '/TR', `wscript.exe "${vbs}"`]);
    if (!made.ok) { console.log(`  couldn't register the logon task (${made.err || made.out}); starting it for this session only`); background([server], null, { cwd: HUB_DIR }); }
    else run('schtasks', ['/Run', '/TN', TASK]);
  } else { // macOS, WSL without systemd: a background process for this login
    killPid(pidOf('agent.pid'));
    background([server], null, { cwd: HUB_DIR });
    console.log('  tip: this runs until logout; run `hub app` again after a reboot');
  }
  for (let i = 0; i < 15; i++) { // wait for it to answer
    if (await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  const dns = (() => { try { return JSON.parse(run('tailscale', ['status', '--json']).out).Self.DNSName.replace(/\.$/, ''); } catch { return null; } })();
  const out = run('tailscale', ['serve', '--bg', String(PORT)], { timeout: 20_000 });
  if (run('tailscale', ['serve', 'status']).out.includes(String(PORT))) {
    console.log(`Hub app: https://${dns}/`);
    console.log('  iPhone: open it in Safari → Share → Add to Home Screen, then open Hub from the Home Screen and turn on notifications.');
  } else {
    console.log("Hub agent is running, but tailscale serve isn't on yet (the iPhone app needs it for HTTPS and notifications):");
    console.log((out.out + '\n' + out.err).trim().split('\n').slice(0, 6).map(l => `  ${l}`).join('\n'));
    console.log('  Enable HTTPS once at https://login.tailscale.com/admin/dns (HTTPS Certificates → Enable), then run: hub app');
  }
}

// ---------- Claude Code hooks ----------
const stdinJSON = () => { try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return {}; } };
const bg = (...args) => background([SELF, ...args], path.join(H, 'bg.log'));
const toplevel = dir => { const r = git(dir, ['rev-parse', '--show-toplevel']); return r.ok ? path.resolve(r.out) : null; };

async function selftest() {
  process.env.HUB_PUSH_ONLY = '.';
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
  try {
    const remote = path.join(T, 'remote.git'), w = path.join(T, 'w');
    run('git', ['init', '-q', '--bare', remote]); run('git', ['clone', '-q', remote, w]);
    git(w, ['config', 'user.name', 't']); git(w, ['config', 'user.email', 't@t']);
    git(w, ['commit', '-q', '--allow-empty', '-m', 'init']); git(w, ['push', '-q', '-u', 'origin', 'HEAD']);
    const commits = () => git(remote, ['log', '--oneline', '--all']).out.split('\n').filter(Boolean).length;
    fs.writeFileSync(path.join(w, 'a.txt'), 'hi\n'); await push([w]);
    if (commits() !== 2) { console.log('FAIL: change not pushed'); process.exit(1); }
    fs.writeFileSync(path.join(w, '.env'), 'X=1\n'); await push([w]);
    if (commits() !== 2) { console.log('FAIL: .env was pushed'); process.exit(1); }
    // don't leave the test's warning for the next session
    const f = path.join(H, 'failed'); const lines = fs.readFileSync(f, 'utf8').split('\n');
    fs.writeFileSync(f, lines.filter(l => !l.includes(w)).join('\n'));
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
  const t = spawnSync(process.execPath, ['--test', path.join(import.meta.dirname, 'test.mjs')], { encoding: 'utf8' });
  if (t.status !== 0) { console.log('FAIL: hub app logic tests (node --test hub/test.mjs)'); process.exit(1); }
  console.log('hub app logic tests ok\nselftest ok');
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'scan': scan(rest[0]); break;
  case 'find': {
    const w = (rest[0] ?? '').toLowerCase();
    if (!w) { console.error('usage: hub find <word>'); process.exit(1); }
    for (const [n, p, , g] of indexed()) if (`${n}\t${p}`.toLowerCase().includes(w)) console.log([n, p, g].join('\t'));
    break;
  }
  case 'pull': await pull(); break;
  case 'push': await push(rest); break;
  case 'serve': serve(); break;
  case 'app': await app(rest[0]); break;
  case 'hook-start': { // stdout lands in the session's context
    const f = path.join(H, 'failed');
    const s = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    if (s.trim()) { console.log(`hub sync problems since last session:\n${s.trimEnd()}`); fs.appendFileSync(path.join(H, 'failed.seen'), s); fs.writeFileSync(f, ''); }
    if (!fs.existsSync(INDEX)) bg('scan');
    bg('pull');
    break;
  }
  case 'hook-touch': { // PostToolUse Edit|Write: remember which repo this session changed
    const j = stdinJSON(), f = j.tool_input?.file_path ?? j.tool_input?.notebook_path;
    const top = f && toplevel(path.dirname(f));
    if (top && j.session_id) fs.appendFileSync(path.join(H, 'touched', String(j.session_id).replace(/[^\w-]/g, '')), top + '\n');
    break;
  }
  case 'hook-stop': { // Stop (end of every turn): push repos this session touched, plus its cwd's repo
    const j = stdinJSON(), t = path.join(H, 'touched', String(j.session_id ?? '').replace(/[^\w-]/g, '') || 'none');
    const list = new Set(fs.existsSync(t) ? fs.readFileSync(t, 'utf8').split('\n').filter(Boolean) : []);
    const top = j.cwd && toplevel(j.cwd); if (top) list.add(top);
    fs.rmSync(t, { force: true });
    if (list.size) bg('push', ...list);
    break;
  }
  case 'selftest': await selftest(); break;
  default:
    console.log(fs.readFileSync(SELF, 'utf8').split('\n').slice(1, 11).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 1 : 0);
}
