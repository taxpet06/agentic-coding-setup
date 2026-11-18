#!/usr/bin/env node
// Hub agent, one per device. Serves the Hub PWA and a JSON API, runs agent turns (Claude personal → Claude school → Codex)
// and talks to the other hub devices on the tailnet. Only the tailnet owner gets in (tailscale whois / serve headers).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import webpush from 'web-push';
import * as lib from './lib.mjs';

const run = promisify(execFile);
const HOME = os.homedir();
const PORT = Number(process.env.HUB_PORT || 7787);
const STATE = process.env.HUB_STATE || path.join(HOME, '.claude/hub');
const THREADS = path.join(STATE, 'threads');
const HUB_DIR = process.env.HUB_DIR || path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(import.meta.dirname, 'public');
const PERMISSION_MODE = process.env.HUB_PERMISSION_MODE || 'auto';
const TURN_TIMEOUT = Number(process.env.HUB_TURN_TIMEOUT_MIN || 120) * 60_000;
const VERSION = 1;
const UPLOADS = path.join(STATE, 'uploads');
const APPROVAL_TOKEN = crypto.randomBytes(24).toString('hex'); // lets approve.mjs, spawned by our own Claude turns, reach /api/approvals
const IMG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
// systemd starts us with a bare PATH; add the user's tool dirs after whatever PATH says
for (const d of ['.local/bin', '.n/bin', '.local/node/bin']) if (!process.env.PATH.split(':').includes(path.join(HOME, d))) process.env.PATH += `:${path.join(HOME, d)}`;
fs.mkdirSync(path.join(THREADS, 'archive'), { recursive: true });

// ---------- small helpers ----------
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v, mode = 0o644) => { const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 1), { mode }); fs.renameSync(t, f); };
const which = b => process.env.PATH.split(':').map(d => path.join(d, b)).find(f => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } }) ?? null;
const log = (...a) => console.log(new Date().toISOString(), ...a);
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function getJSON(url, timeout = 2500, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, timeout, headers: { 'content-type': 'application/json' } }, res => {
      let s = ''; res.setEncoding('utf8'); res.on('data', c => (s += c));
      res.on('end', () => (res.statusCode < 300 ? resolve(s ? JSON.parse(s) : null) : reject(new Error(`${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

// ---------- tailscale identity ----------
let me = { id: os.hostname().toLowerCase(), ips: [], dns: null, login: null, os: process.platform };
const tsStatus = async () => JSON.parse((await run('tailscale', ['status', '--json'], { timeout: 5000 })).stdout);
const idOf = node => (node.DNSName || node.HostName || '').split('.')[0].toLowerCase();
async function loadSelf() {
  try {
    const s = await tsStatus();
    me = { id: idOf(s.Self), ips: s.Self.TailscaleIPs ?? [], dns: s.Self.DNSName?.replace(/\.$/, '') || null, login: s.User?.[s.Self.UserID]?.LoginName ?? null, os: s.Self.OS };
  } catch { /* tailscale down: loopback-only until it comes up */ }
}
const whoisCache = new Map();
async function whoisLogin(ip) {
  const c = whoisCache.get(ip);
  if (c && Date.now() - c.t < 300_000) return c.login;
  let login = null;
  try { login = JSON.parse((await run('tailscale', ['whois', '--json', ip], { timeout: 4000 })).stdout).UserProfile?.LoginName ?? null; } catch {}
  whoisCache.set(ip, { login, t: Date.now() });
  return login;
}
// Who may drive agents on this machine: the tailnet owner only.
async function authorized(req) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') {
    // via `tailscale serve`: it stamps the tailnet login. Funnel (public) traffic carries none and is refused.
    if (!me.login) return true; // no tailscale at all: local use only
    return req.headers['tailscale-user-login'] === me.login;
  }
  return !!me.login && (await whoisLogin(ip)) === me.login; // a peer hub, straight over the tailnet
}

// ---------- providers & accounts ----------
const ACCOUNTS = path.join(STATE, 'accounts.json');
let accounts = readJSON(ACCOUNTS, {});
let providerState = {}; // p -> { installed, loggedIn }
const saveAccounts = () => writeJSON(ACCOUNTS, accounts);
function effectiveAccounts(now = Date.now()) {
  const out = {};
  for (const p of lib.PROVIDERS) {
    const a = { ...(accounts[p] ?? {}) };
    if (a.resetsAt && a.resetsAt < now) a.utilization = 0; // window rolled over since we last saw it
    if (a.limitedUntil && a.limitedUntil < now) delete a.limitedUntil;
    out[p] = { ...a, ...providerState[p] };
  }
  return out;
}
const ready = () => lib.PROVIDERS.filter(p => providerState[p]?.installed && providerState[p]?.loggedIn);
async function checkProviders() {
  const claude = which('claude');
  for (const p of ['personal', 'school']) {
    const dir = path.join(HOME, `.claude-${p}`);
    let installed = !!claude && fs.existsSync(dir), loggedIn = false;
    if (installed) {
      try { loggedIn = !!JSON.parse((await run(claude, ['auth', 'status'], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, timeout: 20_000 })).stdout).loggedIn; } catch {}
    }
    providerState[p] = { installed, loggedIn };
  }
  const codex = which('codex');
  let loggedIn = false;
  if (codex) { try { await run(codex, ['login', 'status'], { timeout: 20_000 }); loggedIn = true; } catch {} }
  providerState.codex = { installed: !!codex, loggedIn };
}
function noteUsage(p, ev) {
  const a = (accounts[p] ??= {});
  if (ev.utilization != null) a.utilization = ev.utilization;
  if (ev.resetsAt) a.resetsAt = ev.resetsAt;
  a.status = ev.status; a.seenAt = Date.now();
  if (ev.status === 'rejected') a.limitedUntil = ev.resetsAt ?? Date.now() + 3_600_000;
  saveAccounts();
}
function markLimited(p, until) {
  const a = (accounts[p] ??= {});
  a.limitedUntil = until; a.status = 'rejected'; a.seenAt = Date.now();
  saveAccounts();
}
const LABEL = { personal: 'Claude personal', school: 'Claude school', codex: 'Codex' };
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---------- threads ----------
const threads = new Map();
for (const f of fs.readdirSync(THREADS)) {
  if (!f.endsWith('.json')) continue;
  const t = readJSON(path.join(THREADS, f), null);
  if (!t) continue;
  if (t.status === 'running') { // the agent died mid-turn; say so instead of pretending
    t.status = 'idle';
    for (const turn of t.turns) if (turn.status === 'running') { turn.status = 'interrupted'; turn.endedAt = Date.now(); }
  }
  threads.set(t.id, t);
}
const saveTimers = new Map();
function saveThread(t, now = false) {
  t.updatedAt = Date.now();
  clearTimeout(saveTimers.get(t.id));
  const w = () => writeJSON(path.join(THREADS, `${t.id}.json`), t);
  if (now) w(); else saveTimers.set(t.id, setTimeout(w, 300));
}
const summary = t => {
  const last = t.turns.at(-1);
  const lastText = [...t.turns].reverse().flatMap(x => (x.items ?? []).filter(i => i.kind === 'text')).at(0)?.text ?? '';
  return { id: t.id, title: t.title, project: t.project, auto: t.auto, status: t.status, provider: t.provider, model: t.model ?? null, effort: t.effort ?? null, mode: t.mode ?? null, queued: t.queue?.length ?? 0, waiting: (last?.items ?? []).filter(i => (i.kind === 'approval' || i.kind === 'question') && i.status === 'pending').length, updatedAt: t.updatedAt,
    createdAt: t.createdAt, lastStatus: last?.status ?? null, preview: lastText.slice(0, 160), turns: t.turns.length };
};
const asTranscript = turns => turns.map(t => t.role === 'user' ? { role: 'user', text: t.text }
  : { role: 'assistant', provider: t.provider, text: (t.items ?? []).filter(i => i.kind === 'text').map(i => i.text).join('\n\n') });

// live streams per thread
const watchers = new Map();
function emit(id, ev) { for (const res of watchers.get(id) ?? []) res.write(`data: ${JSON.stringify(ev)}\n\n`); }
function addItem(t, turn, item) { turn.items.push(item); saveThread(t); emit(t.id, { type: 'item', turnId: turn.id, item }); }
function patchItem(t, turn, item) { saveThread(t); emit(t.id, { type: 'patch', turnId: turn.id, index: turn.items.indexOf(item), item }); }
function setTurn(t, turn) { saveThread(t); emit(t.id, { type: 'turn', turn: { ...turn, items: undefined }, thread: summary(t) }); }

// ---------- projects ----------
function projects() {
  try {
    return fs.readFileSync(path.join(STATE, 'projects.tsv'), 'utf8').split('\n').filter(Boolean).map(l => {
      const [name, p, origin, graph] = l.split('\t');
      return { name, path: p, origin: origin === '-' ? null : origin, graph: graph && graph !== '-' ? graph : null };
    });
  } catch { return []; }
}
const hubBin = () => which('hub') ?? path.join(HUB_DIR, 'bin/hub');

// ---------- running a turn ----------
const running = new Map(); // threadId -> { child, stopped }

function claudeResume(t, profile, cwd) {
  const s = t.sessions.claude;
  if (!s) return null;
  if (s.profile === profile) return s.id;
  // carry the session to the other account: same transcript file, same session id
  const src = path.join(HOME, `.claude-${s.profile}`, 'projects', lib.claudeSlug(cwd), `${s.id}.jsonl`);
  if (!fs.existsSync(src)) return null;
  const dir = path.join(HOME, `.claude-${profile}`, 'projects', lib.claudeSlug(cwd));
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, `${s.id}.jsonl`));
  return s.id;
}

function runProvider(p, t, turn, prompt, cwd, resumeId, images = []) {
  const isClaude = lib.CLAUDE.has(p);
  let cmd, args, env = process.env;
  if (isClaude) {
    cmd = which(`claude-${p}`) ?? 'claude';
    env = { ...process.env, CLAUDE_CONFIG_DIR: path.join(HOME, `.claude-${p}`) };
    args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', t.mode || PERMISSION_MODE];
    if (resumeId) args.push('--resume', resumeId);
    const model = t.model || process.env.HUB_CLAUDE_MODEL;
    if (model) args.push('--model', model);
    if (t.effort) args.push('--effort', t.effort);
    // anything that would ask for permission is relayed to the phone (see approve.mjs); --mcp-config takes several values, so it goes last
    const hub = { command: process.execPath, args: [path.join(import.meta.dirname, 'approve.mjs')],
      env: { HUB_URL: `http://127.0.0.1:${PORT}`, HUB_TOKEN: APPROVAL_TOKEN, HUB_THREAD: t.id, HUB_TURN: turn.id } };
    args.push('--permission-prompt-tool', 'mcp__hub__approve', '--mcp-config', JSON.stringify({ mcpServers: { hub } }));
    env.MCP_TOOL_TIMEOUT = '3600000'; // a prompt may wait an hour for an answer
  } else {
    cmd = 'codex';
    const cfg = ['-c', `sandbox_mode="${lib.codexSandbox(t.mode || PERMISSION_MODE)}"`, '-c', 'approval_policy="never"', '-c', 'sandbox_workspace_write.network_access=true'];
    if (t.effort) cfg.push('-c', `model_reasoning_effort="${t.effort}"`);
    if (cwd === HUB_DIR) cfg.push('-c', `sandbox_workspace_write.writable_roots=[${JSON.stringify(HOME)}]`);
    const img = images.flatMap(f => ['--image', f]); // before --json: --image takes several values
    args = resumeId ? ['exec', 'resume', resumeId, ...img, '--json', '--skip-git-repo-check', ...cfg, '-'] : ['exec', ...img, '--json', '--skip-git-repo-check', ...cfg, '-'];
  }
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const job = running.get(t.id); if (job) job.child = child;
    child.stdin.on('error', () => {}); child.stdin.end(prompt);
    let final = null, limited = false, errText = '', stderr = '', sessionId = null;
    const timer = setTimeout(() => { errText = `Stopped after ${TURN_TIMEOUT / 60_000} minutes`; killTree(child); }, TURN_TIMEOUT);
    readline.createInterface({ input: child.stdout }).on('line', line => {
      for (const ev of (isClaude ? lib.parseClaude : lib.parseCodex)(line)) {
        if (ev.kind === 'session') {
          sessionId = ev.id;
          if (isClaude) t.sessions.claude = { id: ev.id, profile: p, seen: t.sessions.claude?.seen ?? 0 };
          else t.sessions.codex = { id: ev.id, seen: t.sessions.codex?.seen ?? 0 };
          saveThread(t);
        } else if (ev.kind === 'text') addItem(t, turn, { kind: 'text', text: ev.text });
        else if (ev.kind === 'tool') addItem(t, turn, { kind: 'tool', id: ev.id, name: ev.name, detail: ev.detail, view: ev.view ?? undefined });
        else if (ev.kind === 'toolResult') {
          const i = turn.items.findIndex(x => x.kind === 'tool' && x.id === ev.id);
          if (i < 0) { if (ev.tool) addItem(t, turn, { ...ev.tool, output: ev.output, failed: ev.failed || undefined }); }
          else { Object.assign(turn.items[i], { output: ev.output, failed: ev.failed || undefined }); patchItem(t, turn, turn.items[i]); }
        }
        else if (ev.kind === 'delta') emit(t.id, { type: 'delta', turnId: turn.id, text: ev.text });
        else if (ev.kind === 'usage') { noteUsage(p, ev); if (ev.status === 'rejected') limited = true; }
        else if (ev.kind === 'result') final = ev;
        else if (ev.kind === 'error') { errText = ev.text; if (ev.limited) limited = true; }
      }
    });
    child.stderr.on('data', c => (stderr = (stderr + c).slice(-4000)));
    child.on('error', e => (errText = e.message));
    child.on('close', code => {
      clearTimeout(timer);
      const text = final?.text ?? errText ?? '';
      const ok = final ? final.ok : code === 0 && !errText;
      limited ||= !!final?.limited || (!ok && lib.LIMIT_RE.test(`${text}\n${stderr}`));
      resolve({ ok, limited, text: ok ? text : (text || stderr.trim().split('\n').slice(-3).join('\n') || `exited with code ${code}`), sessionId,
        noSession: !ok && /no conversation found|session not found/i.test(`${text}\n${stderr}`) });
    });
  });
}
function killTree(child) {
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000).unref();
}

function seamReason(prev, next, prevLimited, forced) {
  const a = effectiveAccounts()[prev] ?? {};
  if (prevLimited) return `${LABEL[prev]} hit its limit${a.limitedUntil ? ` · back ${clock(a.limitedUntil)}` : ''}`;
  if (forced) return 'picked by you';
  if (a.limitedUntil) return `${LABEL[prev]} is out until ${clock(a.limitedUntil)}`;
  if ((a.utilization ?? 0) >= 0.9) return `${LABEL[prev]} at ${Math.round(a.utilization * 100)}% of its 5-hour window`;
  if (prev === 'codex' && lib.CLAUDE.has(next)) return 'Claude has room again';
  return `${LABEL[next]} has more room`;
}

async function runTurn(t, turn, force) {
  const job = running.get(t.id);
  const cwd = t.project?.path ?? HUB_DIR;
  const transcript = asTranscript(t.turns.slice(0, -2)); // everything before this exchange
  const userTurn = t.turns.at(-2);
  const images = (userTurn.images ?? []).map(n => path.join(UPLOADS, t.id, n));
  // Claude opens attachments with its Read tool; Codex gets them as --image
  const claudeText = userTurn.text + (images.length ? `\n\n[Attached ${images.length === 1 ? 'image' : 'images'}: open with the Read tool: ${images.join(', ')}]` : '');
  turn.base ??= await gitHead(cwd);
  baseUntracked.set(turn.id, new Set(turn.base ? await untracked(cwd) : []));
  const intro = t.rewound ? lib.REWOUND : undefined;
  const tried = [];
  let prevLimited = false;
  for (;;) {
    const p = lib.pickProvider(effectiveAccounts(), Date.now(), { installed: ready(), exclude: tried, prefer: t.provider, force: tried.length ? undefined : force });
    if (!p) {
      const backs = lib.PROVIDERS.map(x => effectiveAccounts()[x]?.limitedUntil).filter(Boolean);
      turn.status = 'failed';
      addItem(t, turn, { kind: 'note', tone: 'error', text: ready().length
        ? `Every account is out right now.${backs.length ? ` First one back at ${clock(Math.min(...backs))}.` : ''}`
        : 'No agent account is logged in on this device. Run claude-personal, claude-school or codex login here once.' });
      return;
    }
    if (t.provider && p !== t.provider) addItem(t, turn, { kind: 'seam', from: t.provider, to: p, reason: seamReason(t.provider, p, prevLimited, !tried.length && force === p) });
    turn.provider = p; t.provider = p; setTurn(t, turn);

    const family = lib.CLAUDE.has(p) ? 'claude' : 'codex';
    let resumeId = family === 'claude' ? claudeResume(t, p, cwd) : t.sessions.codex?.id ?? null;
    const seen = resumeId ? t.sessions[family]?.seen ?? 0 : 0;
    // work this turn already did on an account that ran out, so the next one doesn't start over
    const partial = turn.items.filter(i => i.kind === 'text').map(i => i.text).join('\n\n');
    // (a resumed Claude session already holds its own partial work in the copied transcript)
    const carry = lib.contextFor(transcript, seen, intro) + (partial && (family === 'codex' || !resumeId)
      ? `[The previous assistant was cut off by a usage limit partway through this request. Its progress:]\n${partial}\n\n` : '');
    // Claude gets the stack-router nudge from its UserPromptSubmit hook; Codex has no Claude hooks, so it rides along here
    const hint = family !== 'codex' ? '' : (cwd === HUB_DIR ? '[You are in the hub repo. Projects on this machine: ~/.claude/hub/projects.tsv; `hub find <word>` looks one up.]\n' : '')
      + '[Before acting on a coding, UI, debugging or prose task, read ~/.claude/skills/stack-router/SKILL.md and follow its routing: each skill it names is at ~/.claude/skills/<name>/SKILL.md.]\n\n';
    const userText = family === 'codex' ? userTurn.text : claudeText;
    const imgs = family === 'codex' ? images : [];
    let res = await runProvider(p, t, turn, hint + carry + userText, cwd, resumeId, imgs);
    if (res.noSession && resumeId) { // transcript file went missing: start a fresh session with the whole history
      t.sessions[family] = null;
      res = await runProvider(p, t, turn, hint + lib.contextFor(transcript, 0, intro) + userText, cwd, null, imgs);
    }
    if (job.stopped) { if (t.sessions[family]) t.sessions[family].seen = t.turns.length; turn.status = 'stopped'; return; } // the session saw this request even if cut short
    if (res.limited) {
      const known = effectiveAccounts()[p]?.resetsAt;
      markLimited(p, lib.limitResetFrom(res.text, Date.now()) ?? (known > Date.now() ? known : Date.now() + 3_600_000));
      tried.push(p); prevLimited = true;
      continue;
    }
    if (t.sessions[family]) t.sessions[family].seen = t.turns.length; // it has now seen everything through this turn
    turn.status = res.ok ? 'done' : 'failed';
    if (!res.ok) addItem(t, turn, { kind: 'note', tone: 'error', text: res.text });
    return;
  }
}

// model/effort/mode stick to the thread until changed; '' means the default
function parseSettings(p) {
  const out = {};
  for (const [k, ok] of [['model', lib.MODELS], ['effort', lib.EFFORTS], ['mode', lib.MODES]]) {
    if (p[k] === undefined) continue;
    if (p[k] !== '' && !ok.includes(p[k])) throw new HttpError(400, `Unknown ${k} ${p[k]}`);
    out[k] = p[k] || null;
  }
  return out;
}

// Every message goes through the thread's queue: it runs now if the thread is idle, otherwise after the current
// turn ends (done, failed or stopped), in order. Settings travel with each message and apply when it starts.
function enqueue(t, p, { front = false, images } = {}) {
  if (p.provider && !lib.PROVIDERS.includes(p.provider)) throw new HttpError(400, `Unknown account ${p.provider}`);
  t.queue ??= [];
  if (t.queue.length >= 20) throw new HttpError(429, 'Twenty messages are already queued here.');
  const settings = parseSettings(p);
  if (!str(p.text)?.trim() && !p.images?.length && !images?.length) throw new HttpError(400, 'Message is empty.');
  images ??= saveImages(t, p.images);
  const text = str(p.text)?.trim() || 'Look at the attached image.';
  const q = { id: crypto.randomUUID(), text, provider: p.provider || null, settings, images, at: Date.now() };
  if (front) t.queue.unshift(q); else t.queue.push(q);
  drain(t);
}
// attachments arrive as base64 from the app (already downscaled there); they live in STATE/uploads/<thread>/
function saveImages(t, list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 6) throw new HttpError(400, 'Attach up to six images.');
  const bufs = list.map(x => {
    const ext = IMG[x?.type], b = typeof x?.data === 'string' ? Buffer.from(x.data, 'base64') : null;
    if (!ext || !b?.length) throw new HttpError(400, 'Images must be JPEG, PNG, WebP or GIF.');
    if (b.length > 10_000_000) throw new HttpError(413, 'Each image must be under 10 MB.');
    return [ext, b];
  });
  fs.mkdirSync(path.join(UPLOADS, t.id), { recursive: true });
  return bufs.map(([ext, b]) => { const n = `${crypto.randomUUID()}.${ext}`; fs.writeFileSync(path.join(UPLOADS, t.id, n), b); return n; });
}
function queueChanged(t) { saveThread(t, true); emit(t.id, { type: 'queue', queue: t.queue }); }
function drain(t) {
  if (running.has(t.id) || !t.queue?.length) return queueChanged(t);
  const q = t.queue.shift();
  Object.assign(t, q.settings);
  queueChanged(t);
  startTurn(t, q.text, q.provider || undefined, q.images);
}

function startTurn(t, text, force, images = []) {
  if (running.has(t.id)) throw new HttpError(409, 'This thread is still working. Stop it first, or wait.');
  if (!text?.trim()) throw new HttpError(400, 'Message is empty.');
  if (force && !lib.PROVIDERS.includes(force)) throw new HttpError(400, `Unknown account ${force}`);
  const now = Date.now();
  t.turns.push({ id: crypto.randomUUID(), role: 'user', text: text.trim(), at: now, ...(images.length ? { images } : {}) });
  if (t.auto && !t.project) {
    const m = lib.matchProject(text, projects());
    if (m) t.project = { name: m.name, path: m.path };
  }
  const turn = { id: crypto.randomUUID(), role: 'assistant', provider: null, status: 'running', items: [], startedAt: now,
    model: t.model ?? null, effort: t.effort ?? null, mode: t.mode ?? null };
  t.turns.push(turn);
  if (t.auto && t.turns.length === 2) turn.items.push({ kind: 'note', text: t.project ? `Working in ${t.project.name}` : 'No project named, so working from the hub repo. The agent will look the project up.' });
  t.status = 'running';
  saveThread(t, true);
  emit(t.id, { type: 'snapshot', thread: t });
  const job = { child: null, stopped: false };
  running.set(t.id, job);
  (async () => {
    try { await runTurn(t, turn, force); }
    catch (e) { turn.status = 'failed'; addItem(t, turn, { kind: 'note', tone: 'error', text: `Hub error: ${e.message}` }); log('turn crashed', e); }
    finally {
      running.delete(t.id);
      turn.endedAt = Date.now(); t.status = 'idle'; delete t.rewound;
      for (const a of approvals.values()) if (a.t === t) a.done(false, 'expired');
      const where = t.project?.path ?? HUB_DIR;
      const ch = await changesSince(where, turn.base, baseUntracked.get(turn.id)).catch(() => null);
      baseUntracked.delete(turn.id);
      const card = ch?.files.length ? { kind: 'changes', ...ch, push: 'pending' } : null;
      if (card) addItem(t, turn, card);
      setTurn(t, turn); saveThread(t, true);
      // commit + push the repo (own repos only), then say on the card whether it made it
      const pushed = new Promise(r => { const c = spawn(hubBin(), ['push', where], { detached: true, stdio: 'ignore' }); c.on('close', r); c.on('error', r); c.unref(); });
      if (card) pushed.then(() => pushState(where)).then(st => { Object.assign(card, st); patchItem(t, turn, card); }).catch(() => {});
      const last = turn.items.filter(i => i.kind === 'text' || i.kind === 'note').at(-1)?.text ?? '';
      const proj = (t.project?.name ?? 'hub').split('/').pop();
      const verb = { done: 'done', failed: 'failed', stopped: 'stopped' }[turn.status] ?? turn.status;
      // quiet until it matters: with more queued, only a failure is worth a buzz
      if (turn.status === 'failed' || (turn.status === 'done' && !t.queue?.length)) notify({ title: `${proj} · ${verb}`, body: `${last.replace(/\s+/g, ' ').slice(0, 150)}${turn.provider ? ` (${LABEL[turn.provider]})` : ''}`, tag: t.id, url: `/#/d/${me.id}/t/${t.id}` });
      try { drain(t); } catch (e) { log("queue failed", e); } // the next queued message, if any
    }
  })();
}

// ---------- git: what a turn changed, and whether it got pushed ----------
const git = async (cwd, args) => (await run('git', ['-C', cwd, ...args], { timeout: 15_000, maxBuffer: 16_000_000 })).stdout;
const gitHead = cwd => git(cwd, ['rev-parse', 'HEAD']).then(s => s.trim(), () => null);
const untracked = cwd => git(cwd, ['ls-files', '--others', '--exclude-standard']).then(s => s.split('\n').filter(Boolean), () => []);
const baseUntracked = new Map(); // turnId -> untracked files that were already there when it started
// ponytail: diffs the work tree against HEAD at turn start, so a pull that lands mid-turn counts too; per-turn stash snapshots if that ever matters
async function changesSince(cwd, base, before = new Set()) {
  if (!base) return null;
  const files = (await git(cwd, ['diff', '--numstat', base])).split('\n').filter(Boolean).map(l => {
    const [a, d, ...rest] = l.split('\t');
    return { path: rest.join('\t'), add: a === '-' ? null : Number(a), del: d === '-' ? null : Number(d) };
  });
  for (const f of await untracked(cwd)) {
    if (before.has(f)) continue;
    const text = await fsp.readFile(path.join(cwd, f), 'utf8').catch(() => null);
    files.push({ path: f, add: text == null || text.length > 2_000_000 ? null : text.split('\n').length - (text.endsWith('\n') ? 1 : 0), del: 0, new: true });
  }
  return { files: files.slice(0, 200), more: Math.max(0, files.length - 200), add: files.reduce((n, f) => n + (f.add ?? 0), 0), del: files.reduce((n, f) => n + (f.del ?? 0), 0) };
}
async function pushState(cwd) {
  const head = (await git(cwd, ['rev-parse', '--short', 'HEAD']).catch(() => '')).trim() || null;
  const ahead = await git(cwd, ['rev-list', '--count', '@{u}..HEAD']).catch(() => null);
  if (ahead == null) return { push: 'local', head }; // no upstream, nothing to push to
  const dirty = (await git(cwd, ['status', '--porcelain']).catch(() => 'x')).trim();
  return { push: Number(ahead) === 0 && !dirty ? 'pushed' : 'unpushed', head };
}

// ---------- approvals: Claude's permission prompts, answered from the phone ----------
const approvals = new Map(); // id -> { t, done(allow, status) }
async function askApproval(req, res) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const tok = Buffer.from(String(req.headers['x-hub-token'] ?? ''));
  if ((ip !== '127.0.0.1' && ip !== '::1') || tok.length !== APPROVAL_TOKEN.length || !crypto.timingSafeEqual(tok, Buffer.from(APPROVAL_TOKEN)))
    return json(res, 403, { error: 'Not a hub turn.' });
  const p = await body(req);
  const t = threads.get(p.thread), turn = t?.turns.find(x => x.id === p.turn);
  if (!t || turn?.status !== 'running') return json(res, 200, { allow: false, message: 'That turn is no longer running.' });
  const tool = str(p.tool, 200) ?? 'tool', input = p.input && typeof p.input === 'object' ? p.input : {};
  // AskUserQuestion arrives here too (it needs a human): it becomes a question card, answered with updatedInput.answers
  const questions = tool === 'AskUserQuestion' && Array.isArray(input.questions) ? lib.cleanQuestions(input.questions) : null;
  const item = questions
    ? { kind: 'question', id: crypto.randomUUID(), questions, status: 'pending' }
    : { kind: 'approval', id: crypto.randomUUID(), name: tool, detail: lib.toolDetail(input), view: lib.toolView(tool, input) ?? undefined, status: 'pending' };
  addItem(t, turn, item);
  emit(t.id, { type: 'turn', turn: { ...turn, items: undefined }, thread: summary(t) });
  const proj = (t.project?.name ?? 'hub').split('/').pop();
  notify(questions ? { title: `${proj} · Claude asks`, body: questions[0].question.slice(0, 160), tag: `${t.id}-ask`, url: `/#/d/${me.id}/t/${t.id}` }
    : { title: `${proj} · needs you`, body: `Allow ${tool}: ${item.detail}`.slice(0, 160), tag: `${t.id}-ask`, url: `/#/d/${me.id}/t/${t.id}` }).catch(() => {});
  const answer = await new Promise(resolve => {
    const done = (allow, status, answers) => {
      if (item.status !== 'pending') return;
      approvals.delete(item.id); item.status = status;
      if (answers) item.answers = answers;
      patchItem(t, turn, item);
      emit(t.id, { type: 'turn', turn: { ...turn, items: undefined }, thread: summary(t) });
      resolve(answers ? { allow: true, updatedInput: { ...input, answers } }
        : { allow, message: status === 'denied' ? (questions ? 'The user skipped these questions. Use your best judgment and say what you assumed.' : 'The user denied this from the Hub app.') : undefined });
    };
    approvals.set(item.id, { t, done });
    res.on('close', () => done(false, 'expired')); // the agent went away (stopped, timed out)
  });
  if (!res.writableEnded && !res.destroyed) json(res, 200, answer);
}

// ---------- push notifications ----------
const PUSHF = path.join(STATE, 'push.json');
let push = readJSON(PUSHF, null);
if (!push) { const k = webpush.generateVAPIDKeys(); push = { publicKey: k.publicKey, privateKey: k.privateKey, subs: [] }; writeJSON(PUSHF, push, 0o600); }
async function sendPush(payload) {
  if (!push.subs.length) return;
  webpush.setVapidDetails(me.dns ? `https://${me.dns}` : 'mailto:hub@example.com', push.publicKey, push.privateKey);
  const dead = [];
  await Promise.all(push.subs.map(s => webpush.sendNotification(s, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' })
    .catch(e => { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); else log('push failed', e.statusCode, e.body); })));
  if (dead.length) { push.subs = push.subs.filter(s => !dead.includes(s.endpoint)); writeJSON(PUSHF, push, 0o600); }
}
async function notify(payload) {
  await sendPush({ ...payload, device: me.id });
  for (const d of await devices().catch(() => [])) // phones subscribed through another device's app still hear about this one
    if (d.hub && !d.self) getJSON(`http://${d.ip}:${PORT}/api/push/relay`, 4000, { method: 'POST', body: { ...payload, device: me.id } }).catch(() => {});
}

// ---------- devices on the tailnet ----------
let devCache = { t: 0, list: null };
async function remoteControl() { try { await run('tmux', ['has-session', '-t', 'hub'], { timeout: 2000 }); return true; } catch { return false; } }
async function info() {
  return { id: me.id, dns: me.dns, os: me.os, version: VERSION, hubDir: HUB_DIR, accounts: effectiveAccounts(), ready: ready(),
    next: lib.pickProvider(effectiveAccounts(), Date.now(), { installed: ready() }),
    running: running.size, threads: threads.size, projects: projects().length, remoteControl: await remoteControl(),
    pushSubs: push.subs.length, now: Date.now() };
}
async function devices(fresh = false) {
  if (!fresh && devCache.list && Date.now() - devCache.t < 8000) return devCache.list;
  const self = { id: me.id, dns: me.dns, ip: me.ips[0] ?? '127.0.0.1', os: me.os, online: true, hub: true, self: true, info: await info() };
  let peers = [];
  try {
    const s = await tsStatus();
    peers = await Promise.all(Object.values(s.Peer ?? {}).map(async n => {
      const d = { id: idOf(n), dns: n.DNSName?.replace(/\.$/, ''), ip: n.TailscaleIPs?.[0], os: n.OS, online: !!n.Online, hub: false, self: false, lastSeen: n.LastSeen };
      if (d.online && d.ip) { try { d.info = await getJSON(`http://${d.ip}:${PORT}/api/info`, 2500); d.hub = true; } catch {} }
      return d;
    }));
  } catch {}
  const prev = new Map((devCache.list ?? []).map(d => [d.id, d]));
  for (const d of peers) if (!d.hub && prev.get(d.id)?.info) d.lastInfo = prev.get(d.id).info ?? prev.get(d.id).lastInfo; // remember a hub that went offline
  devCache = { t: Date.now(), list: [self, ...peers] };
  return devCache.list;
}

// ---------- HTTP ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const json = (res, code, v) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(v)); };
async function body(req, max = 1_000_000) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > max) throw new HttpError(413, 'Request too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Body is not JSON'); }
}
const str = (v, max = 100_000) => (typeof v === 'string' && v.length <= max ? v : null);

async function local(req, res, parts) {
  const [a, b, c] = parts, m = req.method;
  if (a === 'info' && m === 'GET') return json(res, 200, await info());
  if (a === 'projects' && m === 'GET') return json(res, 200, projects());
  if (a === 'scan' && m === 'POST') { await run(hubBin(), ['scan'], { timeout: 60_000 }).catch(() => {}); return json(res, 200, projects()); }
  if (a === 'accounts' && b && c === 'reset' && m === 'POST') {
    if (!lib.PROVIDERS.includes(b)) throw new HttpError(404, 'No such account');
    delete accounts[b]?.limitedUntil; if (accounts[b]) accounts[b].status = 'allowed'; saveAccounts();
    return json(res, 200, effectiveAccounts());
  }
  if (a === 'push' && b === 'key' && m === 'GET') return json(res, 200, { publicKey: push.publicKey });
  if (a === 'push' && b === 'subscribe' && m === 'POST') {
    const s = (await body(req)).subscription;
    if (!str(s?.endpoint, 2000)?.startsWith('https://') || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'Not a push subscription');
    push.subs = [...push.subs.filter(x => x.endpoint !== s.endpoint), { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }];
    writeJSON(PUSHF, push, 0o600);
    return json(res, 200, { ok: true });
  }
  if (a === 'push' && b === 'test' && m === 'POST') { await sendPush({ title: 'Hub', body: `Notifications from ${me.id} work.`, url: '/' }); return json(res, 200, { ok: true }); }
  if (a === 'push' && b === 'relay' && m === 'POST') {
    const p = await body(req);
    await sendPush({ title: str(p.title, 200) ?? 'Hub', body: str(p.body, 500) ?? '', url: str(p.url, 300) ?? '/', tag: str(p.tag, 100) ?? undefined, device: str(p.device, 100) });
    return json(res, 200, { ok: true });
  }
  if (a === 'threads' && !b && m === 'GET') return json(res, 200, [...threads.values()].map(summary).sort((x, y) => y.updatedAt - x.updatedAt));
  if (a === 'threads' && !b && m === 'POST') {
    const p = await body(req, 30_000_000);
    const text = str(p.text);
    let project = null;
    if (p.project) {
      project = projects().find(x => x.name === p.project);
      if (!project) throw new HttpError(404, `No project ${p.project} on ${me.id}`);
    }
    const t = { id: crypto.randomUUID(), title: (text ?? '').trim().replace(/\s+/g, ' ').slice(0, 80) || (p.images?.length ? 'Image' : 'New thread'), auto: !project,
      project: project ? { name: project.name, path: project.path } : null, createdAt: Date.now(), updatedAt: Date.now(),
      status: 'idle', provider: null, model: null, effort: null, mode: null, queue: [], sessions: { claude: null, codex: null }, turns: [] };
    threads.set(t.id, t);
    try { enqueue(t, p); } catch (e) { threads.delete(t.id); throw e; }
    return json(res, 201, t);
  }
  const t = a === 'threads' && b ? threads.get(b) : null;
  if (a === 'threads' && b && !t) throw new HttpError(404, 'No such thread');
  if (t && !c && m === 'GET') return json(res, 200, t);
  if (t && !c && m === 'DELETE') {
    if (running.has(t.id)) throw new HttpError(409, 'Stop the thread before archiving it.');
    threads.delete(t.id);
    await fsp.rename(path.join(THREADS, `${t.id}.json`), path.join(THREADS, 'archive', `${t.id}.json`)).catch(() => {});
    return json(res, 200, { ok: true });
  }
  if (t && c === 'messages' && m === 'POST') { enqueue(t, await body(req, 30_000_000)); return json(res, 202, summary(t)); }
  if (t && c === 'queue' && parts[3] && m === 'DELETE') { // drop one queued message
    t.queue = (t.queue ?? []).filter(q => q.id !== parts[3]);
    queueChanged(t);
    return json(res, 200, { queue: t.queue });
  }
  if (t && c === 'approvals' && parts[3] && m === 'POST') {
    const a = approvals.get(parts[3]);
    if (!a || a.t !== t) throw new HttpError(404, 'That request already has an answer.');
    const p = await body(req);
    if (p.answers && typeof p.answers === 'object') { // a question card: { question text: answer }
      const answers = Object.fromEntries(Object.entries(p.answers).map(([q, v]) => [String(q).slice(0, 500), String(v).slice(0, 2000)]));
      a.done(true, 'answered', answers);
    } else a.done(!!p.allow, p.allow ? 'allowed' : 'denied');
    return json(res, 200, { ok: true });
  }
  if (t && c === 'rewind' && m === 'POST') { // edit or retry: drop this message and everything after it, then send it again
    if (running.has(t.id)) throw new HttpError(409, 'Stop this turn before editing or retrying.');
    const p = await body(req, 30_000_000);
    const i = t.turns.findIndex(x => x.id === p.turnId && x.role === 'user');
    if (i < 0) throw new HttpError(404, 'No such message.');
    const orig = t.turns[i];
    const text = p.text === undefined ? orig.text : str(p.text)?.trim();
    if (!text) throw new HttpError(400, 'Message is empty.');
    const removed = t.turns.splice(i); // kept on disk, not shown
    fs.appendFileSync(path.join(THREADS, 'archive', `${t.id}.rewound.jsonl`), JSON.stringify({ at: Date.now(), turns: removed }) + '\n');
    t.sessions = { claude: null, codex: null }; t.rewound = true; // a fresh session gets the earlier turns as a recap
    if (i === 0) t.title = text.replace(/\s+/g, ' ').slice(0, 80);
    enqueue(t, { ...p, text }, { front: true, images: orig.images ?? [] });
    return json(res, 202, summary(t));
  }
  if (t && c === 'images' && parts[3] && m === 'GET') {
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(parts[3])) throw new HttpError(404, 'Not found');
    const data = await fsp.readFile(path.join(UPLOADS, t.id, parts[3])).catch(() => null);
    if (!data) throw new HttpError(404, 'Not found');
    const type = Object.keys(IMG).find(k => IMG[k] === path.extname(parts[3]).slice(1));
    res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
    return res.end(data);
  }
  if (t && c === 'stop' && m === 'POST') {
    const job = running.get(t.id);
    if (job) { job.stopped = true; if (job.child) killTree(job.child); }
    return json(res, 200, { ok: true });
  }
  if (t && c === 'events' && m === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`data: ${JSON.stringify({ type: 'snapshot', thread: t })}\n\n`);
    if (!watchers.has(t.id)) watchers.set(t.id, new Set());
    watchers.get(t.id).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => { clearInterval(ping); watchers.get(t.id)?.delete(res); });
    return;
  }
  throw new HttpError(404, 'Not found');
}

function proxy(req, res, peer, rest) {
  const up = http.request({ host: peer.ip, port: PORT, method: req.method, path: `/api/${rest}`, timeout: 10_000,
    headers: { 'content-type': req.headers['content-type'] ?? 'application/json', accept: req.headers.accept ?? '*/*' } }, pres => {
    up.setTimeout(0); // event streams stay open; the peer pings
    res.writeHead(pres.statusCode, { 'content-type': pres.headers['content-type'] ?? 'application/json', 'cache-control': 'no-store' });
    pres.pipe(res);
  });
  up.on('timeout', () => up.destroy(new Error('timeout')));
  up.on('error', e => { if (!res.headersSent) json(res, 502, { error: `${peer.id} did not answer (${e.message})` }); else res.end(); });
  res.on('close', () => up.destroy());
  req.pipe(up);
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const f = path.resolve(PUBLIC, rel);
  if (!f.startsWith(PUBLIC + path.sep)) throw new HttpError(404, 'Not found');
  const data = await fsp.readFile(f).catch(() => null);
  if (!data) throw new HttpError(404, 'Not found');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/approvals' && req.method === 'POST') return await askApproval(req, res); // our own turns, by token
    if (!(await authorized(req))) return json(res, 403, { error: 'Only the tailnet owner can use this hub.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // CSRF: another site open on the phone could otherwise post a text/plain form that parses as JSON
      const origin = req.headers.origin;
      if (origin && origin !== 'null' && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-site request refused.' });
      if (req.headers['content-length'] !== '0' && req.headers['transfer-encoding'] == null && Number(req.headers['content-length'] ?? 0) > 0 &&
        !(req.headers['content-type'] ?? '').startsWith('application/json')) return json(res, 415, { error: 'Send JSON.' });
    }
    const { pathname } = new URL(req.url, 'http://x');
    if (!pathname.startsWith('/api/')) return await serveStatic(req, res, pathname);
    const parts = pathname.slice(5).split('/').filter(Boolean);
    if (parts[0] === 'devices' && req.method === 'GET') return json(res, 200, await devices(new URL(req.url, 'http://x').searchParams.has('fresh')));
    if (parts[0] === 'd' && parts[1]) {
      if (parts[1] === me.id) return await local(req, res, parts.slice(2));
      const peer = (await devices()).find(d => d.id === parts[1]);
      if (!peer?.hub) throw new HttpError(503, `${parts[1]} is offline or not running the hub.`);
      return proxy(req, res, peer, parts.slice(2).join('/') + (new URL(req.url, 'http://x').search));
    }
    return await local(req, res, parts);
  } catch (e) {
    if (!(e instanceof HttpError)) log('error', req.method, req.url, e);
    if (!res.headersSent) json(res, e.code ?? 500, { error: e.message });
  }
});
server.requestTimeout = 0; // event streams

// Bind loopback (for `tailscale serve`) and the tailnet address (for peer hubs). Never all interfaces.
const bound = new Set();
function listen(host) {
  if (bound.has(host)) return;
  const s = host === '127.0.0.1' ? server : http.createServer(server.listeners('request')[0]);
  s.requestTimeout = 0;
  s.on('error', e => { bound.delete(host); log(`listen ${host}:${PORT} failed: ${e.code}`); });
  s.listen(PORT, host, () => log(`hub agent on http://${host}:${PORT}`));
  bound.add(host);
}
await loadSelf();
listen('127.0.0.1');
setInterval(async () => { await loadSelf(); for (const ip of me.ips.filter(i => i.includes('.'))) listen(ip); }, 30_000).unref();
for (const ip of me.ips.filter(i => i.includes('.'))) listen(ip);
await checkProviders();
setInterval(checkProviders, 10 * 60_000).unref();
log(`device ${me.id}; accounts ready: ${ready().join(', ') || 'none'}`);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  for (const [, job] of running) if (job.child) killTree(job.child);
  for (const t of threads.values()) if (saveTimers.has(t.id)) writeJSON(path.join(THREADS, `${t.id}.json`), t);
  process.exit(0);
});
