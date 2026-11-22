import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
// Hub PWA. Talks to the hub agent that served it; other devices are reached through it at /api/d/<device>/...
const app = document.getElementById('app');
const PROVIDERS = ['personal', 'school', 'codex'];
const LABEL = { personal: 'Claude personal', school: 'Claude school', codex: 'Codex' };
const SHORT = { personal: 'Personal', school: 'School', codex: 'Codex' };
// keep in step with lib.mjs MODELS / EFFORTS
const MODELS = { 'claude-opus-5-5': 'Opus 5.5', 'claude-fable-5-2': 'Fable 5.2', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };
const EFFORTS = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' };
// keep in step with lib.mjs MODES
const MODES = { auto: 'Auto mode', manual: 'Ask me', acceptEdits: 'Accept edits', plan: 'Plan only', bypassPermissions: 'Bypass permissions' };

// ---------- tiny DOM kit (text always goes in as text nodes; only prose() output is HTML, and it's sanitized) ----------
function h(tag, attrs, ...kids) {
  const el = document.createElementNS(tag === 'svg' || tag === 'use' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const icon = (name, cls = '') => { const s = h('svg', { class: `i ${cls}`, 'aria-hidden': 'true' }); s.append(h('use', { href: `#i-${name}` })); return s; };
// Markdown: full GFM (tables, task lists, strikethrough, nested lists, quotes) via marked, then DOMPurify,
// because agent output can carry raw HTML. Single newlines break lines, like a chat.
marked.use({ gfm: true, breaks: true });
DOMPurify.addHook('afterSanitizeAttributes', n => { if (n.tagName === 'A' && n.hasAttribute('href')) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
function prose(src, cls = 'prose') {
  const el = h('div', { class: cls, html: DOMPurify.sanitize(marked.parse(src, { async: false })) });
  for (const t of el.querySelectorAll('table')) t.replaceWith(h('div', { class: 'tbl' }, t.cloneNode(true))); // wide tables scroll, the page doesn't
  for (const pre of el.querySelectorAll('pre')) { // code blocks get a copy button
    const b = h('button', { class: 'copy-code', type: 'button', 'aria-label': 'Copy code', onclick: async () => {
      try { await navigator.clipboard.writeText(pre.innerText); b.replaceChildren(icon('check', 'sm')); setTimeout(() => b.replaceChildren(icon('copy', 'sm')), 1400); } catch { toast('Couldn’t copy'); }
    } }, icon('copy', 'sm'));
    pre.replaceWith(h('div', { class: 'code' }, pre.cloneNode(true), b));
  }
  return el;
}

// drafts survive leaving a screen, reloading, or closing the app
const saved = {
  get: k => { try { return localStorage.getItem(`hub.draft.${k}`) ?? ''; } catch { return ''; } },
  set: (k, v) => { try { v.trim() ? localStorage.setItem(`hub.draft.${k}`, v) : localStorage.removeItem(`hub.draft.${k}`); } catch {} },
};

// ---------- data ----------
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(`/api/${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status });
  return j;
}
const dev = id => `d/${encodeURIComponent(id)}/`;
const short = name => (name ?? 'hub').split('/').pop();
function ago(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return new Date(ms).toLocaleDateString([], { weekday: 'short' });
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dur = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

let devicesCache = null;
const selfId = () => devicesCache?.find(d => d.self)?.id;

// ---------- screen lifecycle ----------
let cleanups = [];
const onCleanup = f => cleanups.push(f);
function every(ms, f) { const t = setInterval(() => document.visibilityState === 'visible' && f(), ms); onCleanup(() => clearInterval(t)); }
function mount(...nodes) { app.replaceChildren(...nodes); }
function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t); setTimeout(() => t.remove(), 3200);
}
function bar({ back, mid, end = [], always = false }) {
  const b = h('header', { class: `bar${always ? ' always' : ''}` },
    h('div', {}, back ? h('a', { class: 'navbtn', href: back.href, 'aria-label': `Back to ${back.label}` }, icon('back'), h('span', { class: 'lbl' }, back.label)) : null),
    h('div', { class: 'mid' }, mid ?? ''),
    h('div', { class: 'end' }, end));
  const onScroll = () => b.classList.toggle('scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true }); onCleanup(() => removeEventListener('scroll', onScroll));
  return b;
}
const navIcon = (name, label, onclick, attrs = {}) => h('button', { class: 'navbtn', 'aria-label': label, title: label, onclick, ...attrs }, icon(name));

function meters(info) {
  const now = info.now ?? Date.now();
  return h('div', { class: 'meters', role: 'list', 'aria-label': 'Agent accounts' }, PROVIDERS.map(p => {
    const a = info.accounts?.[p] ?? {};
    const out = a.limitedUntil && a.limitedUntil > now, off = !a.installed || !a.loggedIn;
    const pct = a.utilization != null ? Math.round(a.utilization * 100) : null;
    const right = out ? `out · ${clock(a.limitedUntil)}` : off ? (a.installed ? 'logged out' : 'not set up') : pct != null ? `${pct}% used` : 'ready';
    return h('div', { class: `meter c-${p}${out ? ' out' : ''}${off ? ' off' : ''}${info.next === p ? ' next' : ''}`, role: 'listitem',
      'aria-label': `${LABEL[p]}: ${right}${info.next === p ? ', used next' : ''}` },
      h('div', { class: 'k' }, SHORT[p]),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: { '--w': `${pct ?? 0}%` } })),
      h('div', { class: 'v num' }, right));
  }));
}

// ---------- home: devices ----------
async function home() {
  const list = h('div', {}, h('div', { class: 'skel' }), h('div', { class: 'skel' }));
  const others = h('div');
  const sub = h('p', { class: 'subtitle num' }, 'Looking for machines on your tailnet…');
  const refresh = navIcon('refresh', 'Refresh', () => load(true));
  mount(h('main', { class: 'screen' }, bar({ mid: 'Hub', end: [refresh] }), h('h1', { class: 'title' }, 'Hub'), sub, list, notifySection(), others));
  async function load(fresh) {
    try {
      const ds = await api(`devices${fresh ? '?fresh=1' : ''}`);
      devicesCache = ds;
      const hubs = ds.filter(d => d.hub || d.lastInfo).sort((a, b) => b.self - a.self || b.online - a.online || a.id.localeCompare(b.id));
      const running = hubs.reduce((n, d) => n + (d.info?.running ?? 0), 0);
      sub.textContent = `${hubs.filter(d => d.hub).length} of ${hubs.length} ${hubs.length === 1 ? 'machine' : 'machines'} online · ${running} running`;
      list.replaceChildren(h('div', { class: 'group' }, hubs.map(deviceRow)));
      const rest = ds.filter(d => !d.hub && !d.lastInfo);
      others.replaceChildren(h('p', { class: 'hint foot' }, 'To add a machine, run ', h('code', {}, 'hub app'), ' on it.',
        rest.length ? ` ${rest.length} other ${rest.length === 1 ? 'device' : 'devices'} on your tailnet ${rest.length === 1 ? 'isn’t' : 'aren’t'} running it.` : ''));
    } catch (e) { list.replaceChildren(h('div', { class: 'error' }, `Couldn't reach the hub: ${e.message}`)); }
  }
  load(); every(6000, () => load());
}
function deviceRow(d) {
  const info = d.info ?? d.lastInfo;
  const meta = d.hub ? `${info.running ? `${info.running} running · ` : ''}${info.threads} ${info.threads === 1 ? 'thread' : 'threads'} · ${info.projects} ${info.projects === 1 ? 'project' : 'projects'}` : `offline${d.lastSeen ? ` · seen ${ago(Date.parse(d.lastSeen))} ago` : ''}`;
  return h('a', { class: `row top${d.hub ? '' : ' dim'}`, href: `#/d/${encodeURIComponent(d.id)}` },
    h('span', { class: `dot${info?.running ? ' run' : d.hub ? ' on' : ''}`, 'aria-label': d.hub ? 'online' : 'offline' }),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, d.id, d.self ? h('span', { class: 'tag' }, 'serving this app') : null),
      h('div', { class: 'meta num' }, meta),
      info && d.hub ? meters(info) : null),
    icon('chev', 'chev'));
}

// ---------- notifications ----------
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushable = isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function notifySection() {
  const box = h('div', { class: 'group' });
  const row = (text, action) => box.replaceChildren(h('div', { class: 'row' }, icon('bell'), h('div', { class: 'body' }, h('div', { class: 'meta', style: { 'white-space': 'normal' } }, text)), action ?? null));
  async function paint() {
    if (!isSecureContext) return row(h('span', {}, 'Notifications need the HTTPS address. Run ', h('code', {}, 'hub app'), ' on this machine and open the https://…ts.net link it prints.'));
    if (isIOS && !standalone) return row('Add Hub to your Home Screen first: tap Share, then Add to Home Screen. iOS only sends notifications to Home Screen apps.');
    if (!pushable) return row('This browser can’t receive web push.');
    if (Notification.permission === 'denied') return row('Notifications are blocked. Allow them in Settings → Notifications → Hub.');
    // ready never settles if the worker failed to install; don't leave the section blank
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('the app’s service worker isn’t running; reload the page')), 4000))]);
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') {
      return row('On. You’ll hear when a turn finishes, fails, or every account runs out.',
        h('button', { class: 'btn quiet sm', onclick: async e => { e.target.disabled = true; try { await subscribe(); await api(`${dev(selfId())}push/test`, { method: 'POST' }); toast('Test sent'); } catch (err) { toast(err.message); } e.target.disabled = false; } }, 'Test'));
    }
    row('Get a notification when an agent finishes or needs you.', h('button', { class: 'btn sm', onclick: async e => {
      e.target.disabled = true;
      try { await subscribe(); toast('Notifications on'); } catch (err) { toast(err.message); }
      paint();
    } }, 'Turn on'));
  }
  paint().catch(e => row(`Notifications unavailable: ${e.message}`));
  return h('section', {}, h('h2', { class: 'section' }, 'Notifications'), box);
}
async function subscribe() {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Permission not granted');
  const id = selfId() ?? (await api('devices')).find(d => d.self).id;
  const { publicKey } = await api(`${dev(id)}push/key`);
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  let sub = await reg.pushManager.getSubscription();
  if (sub && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey ?? []))).replace(/=+$/, '') !== btoa(String.fromCharCode(...key)).replace(/=+$/, '')) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api(`${dev(id)}push/subscribe`, { method: 'POST', body: { subscription: sub.toJSON() } });
}

// ---------- device ----------
async function device(id, params) {
  const tabKey = `hub.tab.${id}`;
  let tab = params.get('tab') ?? (() => { try { return sessionStorage.getItem(tabKey); } catch { return null; } })() ?? 'threads';
  let info = devicesCache?.find(d => d.id === id)?.info;
  let projects = null, threads = null;
  const sub = h('p', { class: 'subtitle num' }, '');
  const composerSlot = h('div');
  const content = h('div', {}, h('div', { class: 'skel' }), h('div', { class: 'skel' }));
  const seg = h('div', { class: 'seg', role: 'tablist' }, ['threads', 'projects', 'accounts'].map(t =>
    h('button', { role: 'tab', 'aria-selected': String(t === tab), 'data-t': t, onclick: () => setTab(t) }, t[0].toUpperCase() + t.slice(1))));
  const plus = navIcon('plus', 'New thread', () => openComposer());
  const filesBtn = h('a', { class: 'navbtn', href: `#/d/${encodeURIComponent(id)}/files`, 'aria-label': `Files on ${id}`, title: 'Files' }, icon('folder'));
  mount(h('main', { class: 'screen' }, bar({ back: { href: '#/', label: 'Hub' }, mid: id, end: [filesBtn, plus] }), h('h1', { class: 'title' }, id), sub, composerSlot, seg, content));

  function setTab(t) {
    tab = t; try { sessionStorage.setItem(tabKey, t); } catch {}
    for (const b of seg.children) b.setAttribute('aria-selected', String(b.dataset.t === t));
    paint();
  }
  function openComposer(project, focus = true) {
    composerSlot.replaceChildren(newThreadForm(id, projects ?? [], project, () => { saved.set(`${id}/new`, ''); composerSlot.replaceChildren(); }));
    if (focus) composerSlot.querySelector('textarea')?.focus();
  }
  function paint() {
    if (!info) return;
    sub.textContent = `${info.os ?? ''} · ${info.running ? `${info.running} running` : 'idle'}${info.remoteControl ? ' · Remote Control on' : ''}`;
    if (tab === 'threads') {
      if (!threads) return;
      content.replaceChildren(threads.length ? h('div', { class: 'group' }, threads.map(t => threadRow(id, t)))
        : h('div', { class: 'empty' }, h('p', { class: 'big' }, `No threads on ${id} yet`),
          h('p', {}, 'Name a project in plain words, like “fix the camera jitter in battlefield”, and the hub finds the repo.'),
          h('button', { class: 'btn', style: { 'margin-top': '10px' }, onclick: () => openComposer() }, icon('plus', 'sm'), 'New thread')));
    } else if (tab === 'projects') {
      if (!projects) return;
      const q = h('input', { type: 'search', placeholder: `Search ${projects.length} projects`, 'aria-label': 'Search projects', autocapitalize: 'off', autocorrect: 'off' });
      const rows = h('div', { class: 'group' });
      const fill = () => {
        const s = q.value.toLowerCase();
        const hits = projects.filter(p => p.name.toLowerCase().includes(s));
        rows.replaceChildren(...(hits.length ? hits.map(p => h('button', { class: 'row', onclick: () => { openComposer(p.name); scrollTo({ top: 0, behavior: 'smooth' }); } },
          h('div', { class: 'body' }, h('div', { class: 'name' }, short(p.name)), h('div', { class: 'meta' }, p.name)),
          p.graph ? h('span', { title: 'Has a graphify graph', 'aria-label': 'has graph' }, icon('graph', 'sm')) : null,
          icon('plus', 'chev'))) : [h('div', { class: 'empty' }, h('p', {}, `No project matches “${q.value}”.`))]));
      };
      q.addEventListener('input', fill); fill();
      content.replaceChildren(h('a', { class: 'btn wide', href: `#/d/${encodeURIComponent(id)}/new-project`, style: { 'margin-bottom': '12px', 'text-decoration': 'none' } }, icon('folder', 'sm'), 'Start a project from a folder'),
        h('div', { style: { 'margin-bottom': '10px' } }, q), rows,
        h('button', { class: 'btn quiet wide', style: { 'margin-top': '14px' }, onclick: async e => {
          e.target.disabled = true; try { projects = await api(`${dev(id)}scan`, { method: 'POST' }); toast(`${projects.length} projects`); paint(); } catch (err) { toast(err.message); } e.target.disabled = false;
        } }, icon('refresh', 'sm'), 'Rescan this machine'));
    } else {
      content.replaceChildren(accountsPanel(id, info, next => { info = next; paint(); }),
        h('p', { class: 'hint', style: { 'margin-top': '14px' } },
          'New turns use Claude personal, then Claude school, then Codex. An account near the end of its 5-hour window hands over early, and the conversation carries across.'),
        info.remoteControl ? h('p', { class: 'hint', style: { 'margin-top': '10px' } }, 'Remote Control is running too: Claude app → Code → hub, for interactive approvals.') : null);
    }
  }
  async function load() {
    try {
      const [i, t] = await Promise.all([api(`${dev(id)}info`), api(`${dev(id)}threads`)]);
      info = i; threads = t;
      if (!projects) projects = await api(`${dev(id)}projects`);
      paint();
    } catch (e) {
      const d = devicesCache?.find(x => x.id === id);
      content.replaceChildren(h('div', { class: 'error' }, e.status === 503 ? `${id} is offline. Its threads come back when it does.` : e.message));
      if (d?.lastSeen) sub.textContent = `offline · seen ${ago(Date.parse(d.lastSeen))} ago`;
      plus.disabled = true;
    }
  }
  if (params.get('new') != null) { projects = await api(`${dev(id)}projects`).catch(() => []); openComposer(params.get('new') || undefined); }
  else if (saved.get(`${id}/new`)) { projects = await api(`${dev(id)}projects`).catch(() => []); openComposer(undefined, false); } // an unsent new thread is waiting
  load(); every(5000, load);
}
function threadRow(id, t) {
  const st = t.waiting ? 'ask' : t.status === 'running' ? 'run' : t.lastStatus === 'failed' ? 'bad' : '';
  const stWord = t.waiting ? 'needs you' : t.status === 'running' ? 'working' : { failed: 'failed', stopped: 'stopped', interrupted: 'interrupted' }[t.lastStatus] ?? '';
  return h('a', { class: 'row', href: `#/d/${encodeURIComponent(id)}/t/${t.id}` },
    h('span', { class: `dot ${st}`, style: st ? {} : { background: `var(--${t.provider ?? 'text-3'})` } }),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, t.title),
      h('div', { class: 'meta num' }, [short(t.project?.name), t.provider ? SHORT[t.provider] : null, stWord, ago(t.updatedAt)].filter(Boolean).join(' · '))),
    icon('chev', 'chev'));
}
function accountsPanel(id, info, onChange) {
  const now = info.now ?? Date.now();
  return h('div', { class: 'group' }, PROVIDERS.map(p => {
    const a = info.accounts?.[p] ?? {};
    const out = a.limitedUntil && a.limitedUntil > now;
    const pct = a.utilization != null ? Math.round(a.utilization * 100) : null;
    const state = !a.installed ? 'Not set up on this machine' : !a.loggedIn ? 'Logged out: run the login once on this machine'
      : out ? `Out until ${clock(a.limitedUntil)}` : pct != null ? `${pct}% of the 5-hour window used${a.resetsAt > now ? `, resets ${clock(a.resetsAt)}` : ''}`
      : p === 'codex' ? 'Ready. Used once both Claude accounts are out' : 'Ready. Usage shows after its first turn';
    return h('div', { class: `acct c-${p}${out ? ' out' : ''}` },
      h('div', { class: 'who' }, h('span', { class: 'dot' }), LABEL[p], info.next === p ? h('span', { class: 'tag' }, 'next') : null),
      out ? h('button', { class: 'btn quiet sm', onclick: async () => { try { const acc = await api(`${dev(id)}accounts/${p}/reset`, { method: 'POST' }); onChange({ ...info, accounts: acc }); toast(`${LABEL[p]} will be tried again`); } catch (e) { toast(e.message); } } }, 'Try again') : h('span'),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: { '--w': `${pct ?? 0}%` } })),
      h('div', { class: `state num${out ? ' bad' : ''}` }, state));
  }));
}
function providerSelect(value = '') {
  return h('select', { 'aria-label': 'Account' }, h('option', { value: '' }, 'Auto account'),
    PROVIDERS.map(p => h('option', { value: p, selected: p === value }, LABEL[p])));
}
// model applies to Claude turns (Codex keeps its own), effort to both, permissions map to Codex's sandbox
function settingSelects(t) {
  const sel = (label, dflt, opts, v) => h('select', { 'aria-label': label }, dflt ? h('option', { value: '' }, dflt) : null,
    Object.entries(opts).map(([k, l]) => h('option', { value: k, selected: k === v }, l)));
  return { model: sel('Model', 'Default', MODELS, t?.model), effort: sel('Effort', 'Default', EFFORTS, t?.effort), mode: sel('Permissions', null, MODES, t?.mode ?? 'auto') };
}
// account/model/effort/permissions folded into one tappable line
function settingsLine(prov, set) {
  const sum = h('span', { class: 'sum' });
  const opts = h('details', { class: 'opts' }, h('summary', {}, icon('tune', 'sm'), sum, icon('chev', 'chev')),
    h('div', { class: 'grid' }, field('Account', prov), field('Permissions', set.mode), field('Model', set.model), field('Effort', set.effort)));
  const paint = () => { sum.textContent = [prov.value ? SHORT[prov.value] : 'Auto account', MODELS[set.model.value] ?? 'Default model',
    set.effort.value ? `${EFFORTS[set.effort.value]} effort` : 'Default effort', MODES[set.mode.value]].join(' · '); };
  for (const x of [prov, set.model, set.effort, set.mode]) x.addEventListener('change', paint);
  paint();
  return { opts, paint };
}
const field = (label, el, cls = '') => h('label', { class: `field ${cls}` }, h('span', {}, label), el);
function newThreadForm(id, projects, project, onClose) {
  const proj = h('select', { 'aria-label': 'Project', onchange: () => { if (proj.value === '\u0000new') location.hash = `#/d/${encodeURIComponent(id)}/new-project`; } },
    h('option', { value: '' }, 'Auto: from your message'),
    projects.map(p => h('option', { value: p.name, selected: p.name === project }, p.name.includes('/') ? `${short(p.name)} · ${p.name.slice(0, p.name.lastIndexOf('/'))}` : p.name)),
    h('option', { value: '\u0000new' }, 'New project from a folder…'));
  const prov = providerSelect();
  const set = settingSelects();
  const text = h('textarea', { placeholder: project ? `What should happen in ${short(project)}?` : 'e.g. fix the camera jitter in battlefield', rows: 4, 'aria-label': 'Message' });
  const dkey = `${id}/new`;
  text.value = saved.get(dkey);
  queueMicrotask(() => att.bind(text, f));
  text.addEventListener('input', () => saved.set(dkey, text.value));
  const send = h('button', { class: 'btn', type: 'submit' }, icon('send', 'sm'), 'Start');
  const att = attacher();
  const { opts } = settingsLine(prov, set);
  const f = h('form', { class: 'new', onsubmit: async e => {
    e.preventDefault();
    if (!text.value.trim() && !att.count()) return text.focus();
    send.disabled = true;
    try {
      const t = await api(`${dev(id)}threads`, { method: 'POST', body: { text: text.value, project: proj.value || undefined, provider: prov.value || undefined,
        model: set.model.value, effort: set.effort.value, mode: set.mode.value, images: att.take() } });
      saved.set(dkey, '');
      location.hash = `#/d/${encodeURIComponent(id)}/t/${t.id}`;
    } catch (err) { toast(err.message); send.disabled = false; }
  } },
  field('Project', proj),
  text, att.strip, att.input, opts,
  h('div', { class: 'new-acts' }, h('button', { class: 'attach', type: 'button', 'aria-label': 'Attach images', onclick: att.open }, icon('image')), h('span', { class: 'grow' }),
    h('button', { class: 'btn quiet', type: 'button', onclick: onClose }, 'Cancel'), send));
  text.addEventListener('keydown', e => sendKey(e, f));
  return f;
}

// ---------- image attachments: downscaled on the phone, sent as base64 ----------
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height)); // a 12 MP photo becomes a few hundred KB; screenshots stay readable
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
  const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  return { type: 'image/jpeg', data, url: URL.createObjectURL(blob) };
}
function attacher(onChange = () => {}) {
  const files = [];
  // images are downscaled on the phone; anything else (PDF, CSV, code, zip...) goes as-is, up to 20 MB each
  async function add(list) {
    for (const f of list) {
      if (files.length >= 10) { toast('Up to ten attachments'); break; }
      if (f.size > 20_000_000) { toast(`${f.name} is over 20 MB`); continue; }
      const img = /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.type);
      try { files.push(img ? { ...(await shrink(f)), name: f.name } : await raw(f)); }
      catch { if (img) try { files.push(await raw(f)); } catch { toast(`Couldn’t read ${f.name || 'that file'}`); } else toast(`Couldn’t read ${f.name || 'that file'}`); }
    }
    paint();
  }
  const raw = f => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok({ type: f.type || 'application/octet-stream', name: f.name, size: f.size, data: String(fr.result).split(',')[1] }); fr.onerror = no; fr.readAsDataURL(f); });
  const input = h('input', { type: 'file', multiple: true, hidden: true, onchange: async () => { await add([...input.files]); input.value = ''; } });
  const strip = h('div', { class: 'thumbs', hidden: true });
  function paint() {
    strip.hidden = !files.length;
    strip.replaceChildren(...files.map((f, i) => h('div', { class: `thumb${f.url ? '' : ' file'}` }, f.url ? h('img', { src: f.url, alt: `Attachment ${i + 1}` })
        : h('div', { class: 'fchip', title: f.name }, icon('file', 'sm'), h('span', {}, f.name), h('small', { class: 'num' }, size(f.size))),
      h('button', { type: 'button', class: 'rm', 'aria-label': `Remove attachment ${i + 1}`, onclick: () => { URL.revokeObjectURL(f.url); files.splice(i, 1); paint(); } }, icon('x', 'xs')))));
    onChange();
  }
  // paste a screenshot into the text box, or drop image files anywhere on the form
  function bind(field, zone) {
    field.addEventListener('paste', e => {
      const imgs = [...(e.clipboardData?.files ?? [])];
      if (!imgs.length) return;
      if (!e.clipboardData.getData('text/plain')) e.preventDefault(); // a bare image: don't also paste its file name
      add(imgs);
    });
    const hasFiles = e => [...(e.dataTransfer?.types ?? [])].includes('Files');
    zone.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); zone.classList.add('dropping'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('dropping'); });
    zone.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); zone.classList.remove('dropping'); add([...e.dataTransfer.files]); });
  }
  return { input, strip, bind, open: () => input.click(), count: () => files.length,
    take: () => files.map(f => ({ type: f.type, name: f.name, data: f.data })), clear: () => { files.forEach(f => URL.revokeObjectURL(f.url)); files.length = 0; paint(); } };
}

// ---------- tool calls ----------
const TOOL = { Bash: 'Run', Shell: 'Run', Read: 'Read', Edit: 'Edit', MultiEdit: 'Edit', Write: 'Write', NotebookEdit: 'Edit notebook', Grep: 'Search', Glob: 'Find files',
  WebFetch: 'Fetch', WebSearch: 'Web search', Search: 'Web search', Agent: 'Subagent', Task: 'Subagent', ToolSearch: 'Load tools' };
const toolLabel = n => TOOL[n] ?? (n.startsWith('mcp__') ? n.slice(5).replace('__', ' · ') : n);
const stepIcon = n => /bash|shell/i.test(n) ? 'term' : /edit|write/i.test(n) ? 'edit' : /read/i.test(n) ? 'file' : /grep|glob|search/i.test(n) ? 'search' : /web|fetch/i.test(n) ? 'globe' : /agent|task/i.test(n) ? 'graph' : 'step';
const base = p => (p ?? '').split('/').pop();
// a changed block: shared lines at either end become context, the middle shows as removed then added
function diffLines(old, neu) {
  const a = old ? old.split('\n') : [], b = neu ? neu.split('\n') : [];
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const ctx = l => ({ k: 'ctx', l });
  return [...a.slice(Math.max(0, s - 2), s).map(ctx), ...a.slice(s, a.length - e).map(l => ({ k: 'del', l })),
    ...b.slice(s, b.length - e).map(l => ({ k: 'add', l })), ...a.slice(a.length - e, a.length - e + 2).map(ctx)];
}
function diffView(edits) {
  const rows = edits.flatMap((x, i) => [...(i ? [{ k: 'gap', l: '' }] : []), ...diffLines(x.old, x.new)]);
  const shown = rows.slice(0, 120);
  return h('div', { class: 'diff', role: 'figure', 'aria-label': 'Changes' }, shown.map(r => h('div', { class: r.k }, h('span', { class: 'sg', 'aria-hidden': 'true' }, { add: '+', del: '−' }[r.k] ?? ''), r.l || ' ')),
    rows.length > shown.length ? h('div', { class: 'more' }, `${rows.length - shown.length} more lines`) : null);
}
function stepDetail(it) {
  if (it.view?.edits) {
    const rows = it.view.edits.flatMap(x => diffLines(x.old, x.new));
    const add = rows.filter(r => r.k === 'add').length, del = rows.filter(r => r.k === 'del').length;
    return [base(it.view.path), ' ', add ? h('span', { class: 'plus num' }, `+${add}`) : null, del ? h('span', { class: 'minus num' }, ` −${del}`) : null];
  }
  if (it.view?.desc) return it.view.desc;
  return /read|write|edit/i.test(it.name) ? base(it.detail) || it.detail : it.detail;
}
function toolBody(it) {
  const v = it.view ?? {}, parts = [];
  if (v.cmd) parts.push(h('pre', { class: 'term' }, h('span', { class: 'ps' }, '$ '), v.cmd, it.output ? h('span', { class: 'o' }, `\n${it.output}`) : null));
  else if (v.edits) { parts.push(h('div', { class: 'path' }, v.path)); parts.push(diffView(v.edits)); if (it.failed && it.output) parts.push(h('pre', { class: 'term bad' }, it.output)); }
  else if (it.output && (it.failed || !/^read$/i.test(it.name))) parts.push(h('pre', { class: `term${it.failed ? ' bad' : ''}` }, it.detail ? h('span', { class: 'ps' }, `${it.detail}\n`) : null, it.output));
  return parts.length ? h('div', { class: 'body' }, parts) : null;
}
function toolStep(it, busy) {
  const head = [icon(stepIcon(it.name), 'sm'), h('span', { class: 'n' }, toolLabel(it.name)), h('span', { class: 'd' }, stepDetail(it)),
    busy ? h('span', { class: 'spin', role: 'img', 'aria-label': 'Running' }) : it.failed ? h('span', { class: 'flag' }, 'failed') : null];
  const body = toolBody(it);
  const cls = `step${it.failed ? ' failed' : ''}`;
  const k = it.id ? `s:${it.id}` : undefined;
  return body ? h('details', { class: cls, 'data-k': k }, h('summary', {}, head), body) : h('div', { class: `${cls} flat`, 'data-k': k }, head);
}
function stepGroup(list, live) {
  const failed = list.filter(i => i.failed).length;
  const names = [...new Set(list.map(i => toolLabel(i.name)))].slice(0, 3).join(', ');
  const busy = live && list.at(-1).output == null;
  return h('details', { class: 'steps', open: live, 'data-k': list[0].id ? `g:${list[0].id}` : undefined },
    h('summary', {}, icon('chev', 'chev'), h('span', { class: 'sum' }, `${list.length} ${list.length === 1 ? 'step' : 'steps'} · ${names}`),
      failed ? h('span', { class: 'flag' }, `${failed} failed`) : null, busy ? h('span', { class: 'spin', role: 'img', 'aria-label': 'Running' }) : null),
    h('div', { class: 'list' }, list.map((it, i) => toolStep(it, busy && i === list.length - 1))));
}
function todoCard(todos) {
  const done = todos.filter(x => x.status === 'completed').length;
  return h('div', { class: 'todo' }, h('div', { class: 'hd num' }, h('b', {}, 'Plan'), ` · ${done} of ${todos.length} done`),
    h('ul', {}, todos.map(x => h('li', { class: x.status }, h('span', { class: 'box', 'aria-hidden': 'true' }, x.status === 'completed' ? icon('check', 'xs') : null),
      h('span', {}, x.text), x.status !== 'pending' ? h('span', { class: 'vh' }, x.status === 'completed' ? ' (done)' : ' (in progress)') : null))));
}
function copyButton(text) {
  const b = h('button', { class: 'act', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(text); b.replaceChildren(icon('check', 'sm'), 'Copied'); setTimeout(() => b.replaceChildren(icon('copy', 'sm'), 'Copy'), 1600); } catch { toast('Couldn’t copy'); }
  } }, icon('copy', 'sm'), 'Copy');
  return b;
}
// what the turn changed in its repo, and whether hub push got it to GitHub
function changesCard(it) {
  const n = it.files.length + (it.more ?? 0);
  const push = { pending: [h('span', { class: 'spin', 'aria-hidden': 'true' }), 'Pushing'], pushed: [icon('check', 'sm'), `Pushed${it.head ? ` ${it.head}` : ''}`],
    unpushed: ['Not pushed'], local: ['Local only'] }[it.push] ?? [];
  const dir = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  return h('details', { class: 'changes', open: it.files.length <= 4 },
    h('summary', {}, icon('chev', 'chev'), h('span', { class: 'sum num' }, `${n} ${n === 1 ? 'file' : 'files'} changed `,
      it.add ? h('span', { class: 'plus' }, `+${it.add}`) : null, it.del ? h('span', { class: 'minus' }, ` −${it.del}`) : null),
      h('span', { class: `ps ${it.push}` }, push)),
    h('div', { class: 'files' }, it.files.map(f => h('div', { class: 'f' },
      h('span', { class: 'p' }, h('span', { class: 'dir' }, dir(f.path)), base(f.path)),
      f.new ? h('span', { class: 'new' }, 'new') : null,
      h('span', { class: 'num c' }, f.add ? h('span', { class: 'plus' }, `+${f.add}`) : null, f.del ? h('span', { class: 'minus' }, ` −${f.del}`) : null))),
      it.more ? h('div', { class: 'f more' }, `${it.more} more`) : null));
}
const HIDDEN = new Set(['Skill', 'TodoWrite', 'AskUserQuestion']); // drawn as the skill labels and the plan card instead

// ---------- thread ----------
function thread(id, tid) {
  let t = null, live = '', liveTurn = null, settingsShown = false;
  // new things ease in once; everything on screen at first paint just appears
  const seen = new Set(); let primed = false;
  const markNew = root => {
    for (const n of [root, ...root.querySelectorAll('[data-k]')]) {
      const k = n.dataset.k; if (!k) continue;
      if (primed && !seen.has(k)) n.classList.add('enter');
      seen.add(k);
    }
    return root;
  };
  const drafts = new Map(); // question id -> answers being picked, so a repaint keeps them
  const turnsEl = h('div', { class: 'turns' });
  const bandWhat = h('div', { class: 'what num' }, 'Loading…');
  const band = h('div', { class: 'band', role: 'status' }, bandWhat);
  const titleEl = h('span', { class: 't1' }, ''), where = h('span', { class: 't2' }, '');
  const stopTurn = async () => { stop.disabled = true; try { await api(`${dev(id)}threads/${tid}/stop`, { method: 'POST' }); } catch (e) { toast(e.message); stop.disabled = false; } };
  const archive = navIcon('archive', 'Archive thread', async () => {
    try { await api(`${dev(id)}threads/${tid}`, { method: 'DELETE' }); location.hash = `#/d/${encodeURIComponent(id)}`; } catch (e) { toast(e.message); }
  });

  // composer: settings, queue, input, send (which turns into Stop while a turn runs and nothing is typed)
  const prov = providerSelect();
  const set = settingSelects();
  const { opts, paint: paintOpts } = settingsLine(prov, set);
  const queueEl = h('div', { class: 'queue', hidden: true });
  const input = h('textarea', { rows: 1, placeholder: 'Follow up…', 'aria-label': 'Message' });
  const send = h('button', { class: 'round send', type: 'submit', 'aria-label': 'Send' }, icon('send'));
  const stop = h('button', { class: 'round stop', type: 'button', 'aria-label': 'Stop this turn', hidden: true, onclick: stopTurn }, icon('stop'));
  const att = attacher(() => paintSend());
  const attach = h('button', { class: 'attach', type: 'button', 'aria-label': 'Attach images', onclick: att.open }, icon('image'));
  // editing a sent message: sending replaces it and everything after it
  let editing = null;
  const editBar = h('div', { class: 'editing', hidden: true }, icon('edit', 'sm'), h('span', {}, 'Editing. The replies after this message will be replaced.'),
    h('button', { type: 'button', class: 'qb', 'aria-label': 'Cancel editing', onclick: () => endEdit() }, icon('x', 'sm')));
  const dkey = `${id}/${tid}`;
  function startEdit(turn) {
    editing = turn; editBar.hidden = false; attach.hidden = true; att.clear();
    input.value = turn.text; grow(); paintSend(); input.focus();
  }
  function endEdit() { editing = null; editBar.hidden = true; attach.hidden = false; input.value = saved.get(dkey); grow(); paintSend(); } // back to the draft
  const rewind = async (turnId, text) => {
    try { await api(`${dev(id)}threads/${tid}/rewind`, { method: 'POST', body: { turnId, text, model: set.model.value, effort: set.effort.value, mode: set.mode.value } }); return true; }
    catch (e) { toast(e.message); return false; }
  };
  let busy = false;
  const form = h('form', { class: 'composer', onsubmit: async e => {
    e.preventDefault();
    if (busy) return;
    const text = input.value.trim();
    if (!text && !att.count()) return input.focus();
    busy = true; send.disabled = true;
    if (editing) { if (text && await rewind(editing.id, text)) endEdit(); }
    else try {
      await api(`${dev(id)}threads/${tid}/messages`, { method: 'POST', body: { text, provider: prov.value || undefined, model: set.model.value, effort: set.effort.value, mode: set.mode.value, images: att.take() } });
      input.value = ''; saved.set(dkey, ''); grow(); att.clear(); prov.value = ''; paintOpts(); opts.open = false;
    } catch (err) { toast(err.message); }
    busy = false; send.disabled = false; paintSend();
  } }, h('div', { class: 'wrap' }, opts, queueEl, editBar, att.strip, att.input, h('div', { class: 'box' }, attach, input, stop, send)));
  // one line is exactly button height, so the text and the image/send buttons share a centre line
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, innerHeight * 0.4)}px`; };
  input.addEventListener('input', () => { if (!editing) saved.set(dkey, input.value); grow(); paintSend(); });
  input.addEventListener('keydown', e => sendKey(e, form));
  // jump back to the newest message after scrolling up
  const jump = h('button', { class: 'jump', type: 'button', 'aria-label': 'Jump to latest', hidden: true, onclick: () => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }) }, icon('chev', 'sm'));
  mount(h('main', { class: 'screen has-composer thread' }, bar({ back: { href: `#/d/${encodeURIComponent(id)}`, label: id }, mid: h('div', { class: 'tt' }, titleEl, where), end: [archive], always: true }), band, turnsEl), jump, form);
  const onScroll = () => { jump.hidden = nearBottom(); };
  addEventListener('scroll', onScroll, { passive: true }); onCleanup(() => removeEventListener('scroll', onScroll));
  input.value = saved.get(dkey); grow();
  att.bind(input, form);
  const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', `${form.offsetHeight}px`));
  ro.observe(form); onCleanup(() => ro.disconnect());

  const nearBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 140;
  const stick = f => { const was = nearBottom(); f(); if (was) requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight })); };

  // while a turn runs, Stop is always there; Send joins it (as "queue") once there's something to send
  function paintSend() {
    const running = t?.status === 'running', has = !!input.value.trim() || att.count() > 0;
    stop.hidden = !running || !!editing; if (!running) stop.disabled = false;
    send.hidden = running && !has && !editing;
    send.disabled = !has;
    send.setAttribute('aria-label', editing ? 'Send edited message' : running ? 'Queue message' : 'Send');
    input.placeholder = editing ? 'Edit your message' : running ? 'Queue a follow-up…' : 'Follow up…';
  }
  function paintQueue() {
    const q = t?.queue ?? [];
    queueEl.hidden = !q.length;
    queueEl.replaceChildren(...q.map((m, i) => h('div', { class: 'q' },
      h('span', { class: 'k' }, i ? `Then` : 'Next'),
      h('span', { class: 't' }, m.text),
      h('button', { class: 'qb', type: 'button', 'aria-label': 'Edit queued message', onclick: async () => {
        try { await api(`${dev(id)}threads/${tid}/queue/${m.id}`, { method: 'DELETE' }); input.value = input.value.trim() ? `${input.value}\n${m.text}` : m.text; if (!editing) saved.set(dkey, input.value); grow(); paintSend(); input.focus(); } catch (e) { toast(e.message); }
      } }, icon('edit', 'sm')),
      h('button', { class: 'qb', type: 'button', 'aria-label': 'Remove queued message', onclick: async () => {
        try { await api(`${dev(id)}threads/${tid}/queue/${m.id}`, { method: 'DELETE' }); } catch (e) { toast(e.message); }
      } }, icon('x', 'sm')))));
  }
  function paintBand() {
    if (!t) return;
    const last = t.turns.at(-1);
    const running = t.status === 'running';
    const pending = (last?.items ?? []).filter(i => (i.kind === 'approval' || i.kind === 'question') && i.status === 'pending');
    const asks = pending.length;
    band.className = `band${asks ? ' ask' : running ? ' running' : last?.status === 'failed' ? ' failed' : ''}`;
    const who = last?.provider ? SHORT[last.provider] : running ? 'picking an account' : '';
    const word = asks ? (pending.some(i => i.kind === 'question') ? 'Claude asks' : 'Needs you') : running ? 'Working' : { done: 'Done', failed: 'Failed', stopped: 'Stopped', interrupted: 'Interrupted' }[last?.status] ?? 'Idle';
    const time = running ? dur(Date.now() - last.startedAt) : last?.endedAt ? (ago(last.endedAt) === 'now' ? 'just now' : `${ago(last.endedAt)} ago`) : '';
    const q = t.queue?.length ? `${t.queue.length} queued` : '';
    bandWhat.replaceChildren(h('b', {}, word), [who, time, q].filter(Boolean).map(s => ` · ${s}`).join(''));
    archive.disabled = running;
    paintSend();
  }
  function renderTurn(turn) {
    if (turn.role === 'user') return userBubble(turn);
    const el = h('div', { class: 'turn', 'data-id': turn.id, 'data-k': turn.id });
    // name whoever started the turn and how it ran; each handoff seam names who took over after that
    const first = turn.items.find(i => i.kind === 'seam')?.from ?? turn.provider;
    const how = [modelOf(turn, first), turn.effort ? `${EFFORTS[turn.effort]} effort` : null, turn.mode && turn.mode !== 'auto' ? MODES[turn.mode] : null].filter(Boolean);
    if (first) el.append(h('div', { class: `who-line c-${first}` }, h('span', { class: 'dot' }), LABEL[first], how.length ? h('span', { class: 'how' }, ` · ${how.join(' · ')}`) : null));
    const skills = [...new Set(turn.items.filter(i => i.kind === 'tool' && i.name === 'Skill' && i.detail).map(i => i.detail))];
    if (skills.length) el.append(h('div', { class: 'skills' }, icon('step', 'sm'), h('span', {}, `Skills: ${skills.join(', ')}`)));
    const plan = turn.items.findLast(i => i.kind === 'tool' && i.name === 'TodoWrite' && i.view?.todos?.length);
    if (plan) el.append(todoCard(plan.view.todos));
    const running = turn.status === 'running';
    let group = null;
    const flush = liveGroup => { if (group) el.append(stepGroup(group, liveGroup)); group = null; };
    turn.items.forEach((it, idx) => {
      if (it.kind === 'tool') { if (!HIDDEN.has(it.name)) (group ??= []).push(it); return; }
      flush(false);
      const at = el.childElementCount;
      if (it.kind === 'text') el.append(prose(it.text));
      else if (it.kind === 'seam') el.append(h('div', { class: 'seam', role: 'note' }, h('span', { class: 'lab' },
        h('span', { class: 'dot from', style: { '--cf': `var(--${it.from})` } }), '→', h('span', { class: 'dot to', style: { '--ct': `var(--${it.to})` } }),
        ` ${LABEL[it.to]} took over · ${it.reason}`)));
      else if (it.kind === 'approval') el.append(approvalCard(it));
      else if (it.kind === 'question') el.append(questionCard(it));
      else if (it.kind === 'changes') el.append(changesCard(it));
      else if (it.kind === 'note') el.append(it.tone === 'error' ? h('div', {}, h('span', { class: 'stamp bad' }, 'Failed'), h('div', { class: 'note bad' }, it.text)) : h('p', { class: 'note' }, it.text));
      // streamed text was already on screen, so only cards and notes ease in
      if (it.kind !== 'text') el.children[at]?.setAttribute('data-k', `${turn.id}:${idx}`);
    });
    flush(running);
    if (running && liveTurn === turn.id && live) el.append(prose(live, 'prose live'));
    else if (running && !turn.items.some(i => (i.kind === 'approval' || i.kind === 'question') && i.status === 'pending')) el.append(h('p', { class: 'note live' }, 'Working'));
    if (turn.status === 'stopped') el.append(h('span', { class: 'stamp muted' }, 'Stopped'));
    if (turn.status === 'interrupted') el.append(h('div', {}, h('span', { class: 'stamp muted' }, 'Interrupted'), h('p', { class: 'note' }, 'The hub restarted during this turn. Send a follow-up to continue.')));
    const text = turn.items.filter(i => i.kind === 'text').map(i => i.text).join('\n\n');
    const isLast = t.turns.at(-1) === turn, asked = t.turns[t.turns.indexOf(turn) - 1];
    if (!running && (text || (isLast && asked))) el.append(h('div', { class: 'acts' }, text ? copyButton(text) : null,
      isLast && asked ? h('button', { class: 'act', type: 'button', onclick: async e => { e.currentTarget.disabled = true; await rewind(asked.id); } }, icon('refresh', 'sm'), 'Retry') : null));
    return el;
  }
  const imgUrl = n => `/api/${dev(id)}threads/${tid}/images/${n}`;
  function userBubble(turn) {
    const wrap = h('div', { class: 'msg-user-wrap', 'data-id': turn.id, 'data-k': turn.id });
    if (turn.images?.length) wrap.append(h('div', { class: 'imgs' }, turn.images.map((n, i) =>
      h('a', { href: imgUrl(n), target: '_blank', rel: 'noopener', 'aria-label': `Attached image ${i + 1}` }, h('img', { src: imgUrl(n), alt: '', loading: 'lazy' })))));
    if (turn.files?.length) wrap.append(h('div', { class: 'files' }, turn.files.map(f =>
      h('a', { class: 'fchip', href: `/api/${dev(id)}threads/${tid}/files/${f.id}/${encodeURIComponent(f.name)}`, download: f.name, title: `Download ${f.name}` },
        icon('file', 'sm'), h('span', {}, f.name), h('small', { class: 'num' }, size(f.size))))));
    const lastUser = t.turns.findLast(x => x.role === 'user') === turn;
    // the newest message shows its actions; tap an older one to reveal them
    wrap.append(h('div', { class: 'msg-user', role: 'button', tabindex: 0, 'aria-expanded': String(lastUser), onclick: () => { if (!lastUser) { wrap.classList.toggle('show'); } } }, turn.text),
      h('div', { class: `acts end${lastUser ? ' always' : ''}` }, copyButton(turn.text),
        h('button', { class: 'act', type: 'button', onclick: () => startEdit(turn) }, icon('edit', 'sm'), 'Edit')));
    return wrap;
  }
  // Claude's AskUserQuestion: pick options (or write your own), then send; Skip lets it decide
  function questionCard(it) {
    const done = it.status !== 'pending';
    if (done) return h('div', { class: `qcard ${it.status}` },
      h('div', { class: 'hd' }, icon(it.status === 'answered' ? 'check' : 'x', 'sm'), h('b', {}, it.status === 'answered' ? 'You answered' : it.status === 'denied' ? 'Skipped' : 'No answer')),
      it.questions.map(q => h('div', { class: 'qa' }, h('div', { class: 'qq' }, q.question), it.answers?.[q.question] ? h('div', { class: 'aa' }, it.answers[q.question]) : null)));
    const d = drafts.get(it.id) ?? drafts.set(it.id, it.questions.map(() => ({ picked: new Set(), other: '' }))).get(it.id);
    const ready = () => d.every(x => x.picked.size || x.other.trim());
    const submit = h('button', { class: 'btn', type: 'button', disabled: !ready(), onclick: async e => {
      e.currentTarget.disabled = true;
      const answers = Object.fromEntries(it.questions.map((q, i) => [q.question, [...d[i].picked, d[i].other.trim()].filter(Boolean).join(', ')]));
      try { await api(`${dev(id)}threads/${tid}/approvals/${it.id}`, { method: 'POST', body: { answers } }); drafts.delete(it.id); } catch (err) { toast(err.message); submit.disabled = !ready(); }
    } }, 'Send answer');
    const skip = h('button', { class: 'btn quiet', type: 'button', onclick: async () => {
      try { await api(`${dev(id)}threads/${tid}/approvals/${it.id}`, { method: 'POST', body: { allow: false } }); drafts.delete(it.id); } catch (err) { toast(err.message); }
    } }, 'Skip');
    return h('div', { class: 'qcard pending', role: 'group', 'aria-label': 'Claude asks' },
      h('div', { class: 'hd' }, icon('ask', 'sm'), h('b', {}, it.questions.length > 1 ? `Claude has ${it.questions.length} questions` : 'Claude asks')),
      it.questions.map((q, i) => {
        const opts = q.options.map(o => {
          const b = h('button', { class: 'opt', type: 'button', 'aria-pressed': String(d[i].picked.has(o.label)), onclick: () => {
            if (q.multiSelect) d[i].picked.has(o.label) ? d[i].picked.delete(o.label) : d[i].picked.add(o.label);
            else { d[i].picked.clear(); d[i].picked.add(o.label); d[i].other = ''; other.value = ''; }
            for (const x of opts) x.setAttribute('aria-pressed', String(d[i].picked.has(x.dataset.v)));
            submit.disabled = !ready();
          } }, h('span', { class: 'mark', 'aria-hidden': 'true' }, icon('check', 'xs')), h('span', { class: 'ol' }, h('b', {}, o.label), o.description ? h('span', {}, o.description) : null));
          b.dataset.v = o.label;
          return b;
        });
        const other = h('input', { type: 'text', class: 'other', placeholder: q.options.length ? 'Or write your own…' : 'Your answer', value: d[i].other, 'aria-label': `Your own answer to: ${q.question}`,
          oninput: () => { d[i].other = other.value; if (!q.multiSelect && other.value.trim()) { d[i].picked.clear(); for (const x of opts) x.setAttribute('aria-pressed', 'false'); } submit.disabled = !ready(); } });
        return h('fieldset', { class: `qq-set${q.multiSelect ? ' multi' : ''}` }, h('legend', {}, q.header ? h('span', { class: 'qh' }, q.header) : null, h('span', { class: 'qt' }, q.question),
          q.multiSelect ? h('span', { class: 'qm' }, 'Pick any') : null), h('div', { class: 'opts-list' }, opts), other);
      }),
      h('div', { class: 'btns' }, skip, submit));
  }
  function approvalCard(it) {
    const pending = it.status === 'pending';
    const answer = allow => async e => {
      const btns = [...e.currentTarget.parentNode.children];
      btns.forEach(b => (b.disabled = true));
      try { await api(`${dev(id)}threads/${tid}/approvals/${it.id}`, { method: 'POST', body: { allow } }); } catch (err) { toast(err.message); btns.forEach(b => (b.disabled = false)); }
    };
    const verdict = { allowed: 'Allowed', denied: 'Denied', expired: 'No answer' }[it.status];
    return h('div', { class: `approval ${it.status}`, role: pending ? 'group' : 'note', 'aria-label': `Permission request: ${toolLabel(it.name)}` },
      h('div', { class: 'hd' }, icon(pending ? 'shield' : it.status === 'allowed' ? 'check' : 'x', 'sm'), h('b', {}, pending ? `Allow ${toolLabel(it.name).toLowerCase()}?` : verdict),
        !pending ? h('span', { class: 'what' }, toolLabel(it.name)) : null),
      toolBody(it) ?? (it.detail ? h('pre', { class: 'term' }, it.detail) : null),
      pending ? h('div', { class: 'btns' }, h('button', { class: 'btn quiet', type: 'button', onclick: answer(false) }, 'Deny'), h('button', { class: 'btn', type: 'button', onclick: answer(true) }, 'Allow')) : null);
  }
  const modelOf = (turn, p) => p && p !== 'codex' && turn.model ? MODELS[turn.model] : null;
  function repaintTurn(turn) {
    const old = turnsEl.querySelector(`[data-id="${turn.id}"]`);
    const keepOpen = [...(old?.querySelectorAll('details') ?? [])].map(d => d.open);
    const fresh = markNew(renderTurn(turn));
    // keep whatever the reader opened or closed; new groups take their own default
    fresh.querySelectorAll('details').forEach((d, i) => { if (i < keepOpen.length) d.open = keepOpen[i]; });
    stick(() => (old ? old.replaceWith(fresh) : turnsEl.append(fresh)));
  }
  const whereText = () => `${t.project?.name ?? (t.auto ? 'Auto project' : 'hub')} · ${id}`;
  function paintAll() {
    titleEl.textContent = t.title;
    where.textContent = whereText();
    stick(() => turnsEl.replaceChildren(...t.turns.map(x => markNew(renderTurn(x)))));
    primed = true;
    if (!settingsShown) { set.model.value = t.model ?? ''; set.effort.value = t.effort ?? ''; set.mode.value = t.mode ?? 'auto'; settingsShown = true; } // later snapshots mustn't undo an unsent pick
    paintOpts(); paintQueue(); paintBand();
  }

  const es = new EventSource(`/api/${dev(id)}threads/${tid}/events`);
  onCleanup(() => es.close());
  es.onmessage = e => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'snapshot') { t = ev.thread; live = ''; paintAll(); return; }
    if (!t) return;
    if (ev.type === 'queue') { t.queue = ev.queue; paintQueue(); paintBand(); return; }
    const turn = t.turns.find(x => x.id === ev.turnId || x.id === ev.turn?.id);
    if (!turn) return;
    if (ev.type === 'item') { turn.items.push(ev.item); if (ev.item.kind === 'text') live = ''; repaintTurn(turn); }
    else if (ev.type === 'patch') { turn.items[ev.index] = ev.item; repaintTurn(turn); }
    else if (ev.type === 'delta') { if (liveTurn !== turn.id) { liveTurn = turn.id; live = ''; } live += ev.text; repaintTurn(turn); }
    else if (ev.type === 'turn') { Object.assign(turn, ev.turn, { items: turn.items }); t.status = ev.thread.status; t.provider = ev.thread.provider; t.project = ev.thread.project; if (turn.status !== 'running') live = ''; repaintTurn(turn); paintBand(); where.textContent = whereText(); }
  };
  es.onerror = () => { if (!t) bandWhat.textContent = 'Can’t reach this thread. Retrying…'; };
  every(1000, () => t?.status === 'running' && paintBand());
}

const size = b => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

// ---------- folder browser: pick a folder for a new project, or explore files (read-only) ----------
function newProject(id, params) { return browse(id, params, 'project'); }
function browse(id, params, mode) {
  const files = mode === 'files';
  const key = `hub.browse.${id}`;
  let cur = params.get('path') || (() => { try { return localStorage.getItem(key); } catch { return null; } })() || '', listing = null, hidden = false, busy = false;
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Folder path' });
  const list = h('div', {}, h('div', { class: 'skel' }), h('div', { class: 'skel' }));
  const sub = h('p', { class: 'subtitle' }, files ? `On ${id}. Read-only: open any file to view it.` : `On ${id}. Use a folder as it is, or make a new one inside it.`);
  const filter = h('input', { type: 'search', placeholder: 'Filter this folder', 'aria-label': 'Filter this folder', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', oninput: () => paint() });
  const mkRow = h('form', { class: 'mkdir', hidden: true, onsubmit: async e => {
    e.preventDefault();
    const name = mkName.value.trim(); if (!name) return mkName.focus();
    try { const r = await api(`${dev(id)}fs/mkdir`, { method: 'POST', body: { path: listing.path, name } }); mkRow.hidden = true; mkName.value = ''; go(r.path); }
    catch (err) { toast(err.message); }
  } });
  const mkName = h('input', { type: 'text', placeholder: 'New folder name', 'aria-label': 'New folder name', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  mkRow.append(icon('folder', 'sm'), mkName, h('button', { class: 'btn sm', type: 'submit' }, 'Create'), h('button', { class: 'qb', type: 'button', 'aria-label': 'Cancel', onclick: () => { mkRow.hidden = true; } }, icon('x', 'sm')));
  const tools = h('div', { class: 'fs-tools' },
    h('button', { class: 'btn quiet sm', type: 'button', onclick: () => go(listing?.home ?? '') }, 'Home'),
    files ? null : h('button', { class: 'btn quiet sm', type: 'button', onclick: () => { mkRow.hidden = false; mkName.focus(); } }, icon('plus', 'sm'), 'New folder'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: e => { hidden = e.target.checked; go(cur); } }), files ? 'Hidden files' : 'Hidden folders'));
  // the action bar at the bottom: what happens to the folder you're in (projects only)
  const where = h('div', { class: 'here' });
  const github = h('input', { type: 'checkbox', checked: true });
  const ghRow = h('label', { class: 'check' }, github, 'Private GitHub repo');
  const start = h('button', { class: 'btn', type: 'button', onclick: () => setup() }, 'Start project here');
  const bar2 = files ? null : h('div', { class: 'composer fs-bar' }, h('div', { class: 'wrap' }, where, h('div', { class: 'fs-actions' }, ghRow, start)));
  mount(h('main', { class: `screen${files ? '' : ' has-composer'}` }, bar({ back: { href: `#/d/${encodeURIComponent(id)}${files ? '' : '?tab=projects'}`, label: id }, mid: files ? 'Files' : 'New project' }),
    h('h1', { class: 'title' }, files ? 'Files' : 'Pick a folder'), sub, crumbs, tools, files ? h('div', { class: 'fs-filter' }, filter) : mkRow, list), ...(bar2 ? [bar2] : []));
  if (bar2) { const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', `${bar2.offsetHeight}px`)); ro.observe(bar2); onCleanup(() => ro.disconnect()); }

  async function go(p) {
    try {
      listing = await api(`${dev(id)}fs?path=${encodeURIComponent(p)}${hidden ? '&hidden=1' : ''}${files ? '&files=1' : ''}`);
      cur = listing.path; try { localStorage.setItem(key, cur); } catch {}
      filter.value = '';
      if (files) history.replaceState(null, '', `#/d/${encodeURIComponent(id)}/files?path=${encodeURIComponent(cur)}`); // back from a file returns here
      paint();
    } catch (e) { toast(e.message); if (!listing) list.replaceChildren(h('div', { class: 'error' }, e.message)); }
  }
  function paint() {
    // (replaceChildren takes nodes, not arrays or nulls: flatten and drop the gaps)
    crumbs.replaceChildren(...listing.crumbs.flatMap((c, i) => [i ? h('span', { class: 'sep', 'aria-hidden': 'true' }, '/') : null,
      i === listing.crumbs.length - 1 ? h('span', { class: 'cur', 'aria-current': 'location' }, c.name) : h('button', { type: 'button', onclick: () => go(c.path) }, c.name)]).filter(Boolean));
    requestAnimationFrame(() => { crumbs.scrollLeft = crumbs.scrollWidth; });
    const f = filter.value.trim().toLowerCase(), match = n => !f || n.toLowerCase().includes(f);
    const rows = listing.entries.filter(e => match(e.name)).map(e => h('button', { class: 'row', type: 'button', onclick: () => go(e.path) },
      icon(e.project ? 'graph' : 'folder', 'sm'), h('div', { class: 'body' }, h('div', { class: 'name' }, e.name)),
      e.project ? h('span', { class: 'tag' }, 'project') : e.git ? h('span', { class: 'tag' }, 'git') : null, icon('chev', 'chev')));
    const frows = (listing.fileList ?? []).filter(x => match(x.name)).map(x => h('a', { class: 'row file', href: `#/d/${encodeURIComponent(id)}/file?path=${encodeURIComponent(x.path)}` },
      icon('file', 'sm'), h('div', { class: 'body' }, h('div', { class: 'name' }, x.name), h('div', { class: 'meta num' }, [size(x.size), x.mtime ? ago(x.mtime) : null].filter(Boolean).join(' · ')))));
    const all = [...rows, ...frows];
    list.replaceChildren(...[listing.parent ? h('div', { class: 'group up' }, h('button', { class: 'row', type: 'button', onclick: () => go(listing.parent) }, icon('back', 'sm'), h('div', { class: 'body' }, h('div', { class: 'name' }, 'Up one level')))) : null,
      all.length ? h('div', { class: 'group' }, all) : h('div', { class: 'empty' }, h('p', {}, f ? `Nothing here matches “${filter.value}”.` : files ? 'This folder is empty.' : listing.files ? `No folders here, ${listing.files} ${listing.files === 1 ? 'file' : 'files'}.` : 'This folder is empty.'))].filter(Boolean));
    if (files) return;
    const drives = listing.path === 'drives';
    // long paths lose their start, not their end: rtl box, with the path itself isolated so its slashes stay put
    where.replaceChildren(...[icon(listing.project ? 'graph' : 'folder', 'sm'), h('span', { class: 'p' }, h('bdi', {}, drives ? 'Pick a drive' : listing.path)),
      listing.project ? h('span', { class: 'tag' }, 'already a project') : null].filter(Boolean));
    ghRow.hidden = !!listing.project || listing.git;
    start.disabled = drives;
    start.textContent = listing.project ? 'Open this project' : listing.git ? 'Add this repo' : 'Start project here';
  }
  async function setup() {
    if (busy || !listing) return;
    if (listing.project) return void (location.hash = `#/d/${encodeURIComponent(id)}?new=${encodeURIComponent(listing.project)}`);
    busy = true; start.disabled = true; start.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), 'Setting up…');
    try {
      const r = await api(`${dev(id)}projects`, { method: 'POST', body: { path: listing.path, github: github.checked } });
      toast(r.steps.filter(x => !/^Building/.test(x)).at(-1) ?? 'Project ready');
      location.hash = `#/d/${encodeURIComponent(id)}?new=${encodeURIComponent(r.name)}`;
    } catch (e) { toast(e.message); busy = false; paint(); start.disabled = false; }
  }
  go(cur);
}

// ---------- file viewer (read-only for now; editing will add a Save to this screen) ----------
function csvRows(text, sep) { // quoted fields, doubled quotes, newlines inside quotes
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length > 500) break; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function fileView(id, params) {
  const p = params.get('path') ?? '';
  const raw = (extra = '') => `/api/${dev(id)}fs/raw?path=${encodeURIComponent(p)}${extra}`;
  const body = h('div', { class: 'viewer' }, h('div', { class: 'skel' }));
  const sub = h('p', { class: 'subtitle fpath' }, h('bdi', {}, p));
  const back = `#/d/${encodeURIComponent(id)}/files?path=${encodeURIComponent(p.replace(/[\\/][^\\/]*$/, '') || '/')}`;
  const wrapBtn = h('button', { class: 'btn quiet sm', type: 'button', hidden: true, 'aria-pressed': 'false', onclick: () => { const on = body.classList.toggle('wrap'); wrapBtn.setAttribute('aria-pressed', String(on)); } }, 'Wrap lines');
  const srcBtn = h('button', { class: 'btn quiet sm', type: 'button', hidden: true, 'aria-pressed': 'false' }, 'Source');
  const acts = h('div', { class: 'composer fs-bar' }, h('div', { class: 'wrap' }, h('div', { class: 'file-acts' },
    h('a', { class: 'btn quiet sm', href: raw('&download=1'), download: '' }, 'Download'),
    navigator.share ? h('button', { class: 'btn quiet sm', type: 'button', onclick: () => shareFile() }, 'Share') : null,
    h('button', { class: 'btn quiet sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(p); toast('Path copied'); } catch { toast('Couldn’t copy'); } } }, 'Copy path'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', type: 'button', onclick: () => askAgent() }, 'Ask the agent'))));
  const name = p.split(/[\\/]/).pop();
  mount(h('main', { class: 'screen has-composer' }, bar({ back: { href: back, label: 'Files' }, mid: name }), h('h1', { class: 'title clamp file-title' }, name), sub,
    h('div', { class: 'fs-tools' }, wrapBtn, srcBtn, h('span', { class: 'meta num', id: 'fmeta' })), body), acts);
  const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', `${acts.offsetHeight}px`)); ro.observe(acts); onCleanup(() => ro.disconnect());

  async function shareFile() {
    try {
      const blob = await (await fetch(raw('&download=1'))).blob();
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name }); else toast('This browser can’t share files');
    } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
  }
  async function askAgent() { // a new thread in the project that holds this file, with its path already typed
    const projects = await api(`${dev(id)}projects`).catch(() => []);
    const own = projects.filter(x => p.startsWith(x.path + (x.path.includes('\\') ? '\\' : '/'))).sort((a, b) => b.path.length - a.path.length)[0];
    saved.set(`${id}/new`, `About \`${p}\`: `);
    location.hash = `#/d/${encodeURIComponent(id)}?new=${encodeURIComponent(own?.name ?? '')}`;
  }
  async function load(reveal = false) {
    let f;
    try { f = await api(`${dev(id)}fs/read?path=${encodeURIComponent(p)}${reveal ? '&reveal=1' : ''}`); }
    catch (e) { return body.replaceChildren(h('div', { class: 'error' }, e.message)); }
    document.getElementById('fmeta').textContent = [size(f.size), f.mtime ? `changed ${ago(f.mtime)}${ago(f.mtime) === 'now' ? '' : ' ago'}` : null].filter(Boolean).join(' · ');
    if (f.kind === 'secret') return body.replaceChildren(h('div', { class: 'note-card' }, icon('shield', 'sm'),
      h('div', {}, h('b', {}, 'This looks like a secret'), h('p', {}, 'Keys, tokens and .env files stay hidden until you ask. Anyone looking at your screen will see it.')),
      h('button', { class: 'btn sm', type: 'button', onclick: () => load(true) }, 'Reveal')));
    if (f.kind === 'image') return body.replaceChildren(h('button', { class: 'img-view', type: 'button', 'aria-label': 'Toggle actual size', onclick: e => e.currentTarget.classList.toggle('actual') }, h('img', { src: raw(reveal ? '&reveal=1' : ''), alt: f.name })));
    if (f.kind === 'pdf') return body.replaceChildren(h('iframe', { class: 'pdf-view', src: raw(), title: f.name }));
    if (f.kind === 'binary') return body.replaceChildren(h('div', { class: 'note-card' }, icon('file', 'sm'), h('div', {}, h('b', {}, 'No preview for this file'), h('p', {}, `${f.ext ? `.${f.ext} file, ` : ''}${size(f.size)}. Download it to open it in another app.`))));
    const code = () => {
      const lines = f.text.split('\n'); if (lines.at(-1) === '') lines.pop();
      return h('pre', { class: 'code-view', style: { '--gw': `${String(lines.length).length + 1}ch` } }, h('code', {}, lines.map(l => h('span', {}, l || '​'))));
    };
    const more = f.truncated ? h('p', { class: 'note' }, `Showing the first ${size(1_000_000)} of ${size(f.size)}. Download for the rest.`) : null;
    wrapBtn.hidden = false;
    if (f.kind === 'markdown' || f.kind === 'csv') {
      srcBtn.hidden = false;
      const pretty = () => f.kind === 'markdown' ? prose(f.text) : (() => {
        const rows = csvRows(f.text, f.ext === 'tsv' ? '\t' : ',');
        return h('div', { class: 'prose' }, h('div', { class: 'tbl' }, h('table', {}, h('thead', {}, h('tr', {}, (rows[0] ?? []).map(c => h('th', {}, c)))),
          h('tbody', {}, rows.slice(1, 500).map(r => h('tr', {}, r.map(c => h('td', {}, c))))))), rows.length > 500 ? h('p', { class: 'note' }, 'First 500 rows.') : null);
      })();
      let src = false;
      const show = () => { body.replaceChildren(...[src ? code() : pretty(), more].filter(Boolean)); srcBtn.setAttribute('aria-pressed', String(src)); wrapBtn.hidden = !src; };
      srcBtn.onclick = () => { src = !src; show(); };
      return show();
    }
    body.replaceChildren(...[code(), more].filter(Boolean));
  }
  load();
}

// ---------- desktop: machines and threads in a sidebar beside whichever screen is open ----------
const wide = matchMedia('(min-width: 1000px)');
const side = document.getElementById('side');
const at = { dev: null, tid: null }; // what the main pane shows
const sideThreads = {}; // device -> its threads, as last fetched
async function paintSide(fetch = true) {
  document.body.classList.toggle('wide', wide.matches);
  side.hidden = !wide.matches;
  if (!wide.matches) return;
  try {
    if (fetch || !devicesCache) devicesCache = await api('devices');
    const hubs = devicesCache.filter(d => d.hub || d.lastInfo).sort((a, b) => b.self - a.self || b.online - a.online || a.id.localeCompare(b.id));
    const cur = at.dev ?? hubs[0]?.id;
    if (fetch && cur && hubs.find(d => d.id === cur)?.hub) sideThreads[cur] = await api(`${dev(cur)}threads`).catch(() => sideThreads[cur] ?? []);
    side.replaceChildren(
      h('div', { class: 'side-head' }, h('a', { href: '#/', class: 'brand' }, h('img', { src: 'icon.svg', alt: '' }), 'Hub'),
        cur ? h('a', { class: 'navbtn', href: `#/d/${encodeURIComponent(cur)}?new`, 'aria-label': `New thread on ${cur}`, title: 'New thread' }, icon('plus')) : null),
      ...hubs.map(d => {
        const info = d.info ?? d.lastInfo, open = d.id === cur;
        return h('section', { class: `side-dev${open ? ' open' : ''}${d.hub ? '' : ' off'}` },
          h('a', { class: 'side-dev-row', href: `#/d/${encodeURIComponent(d.id)}`, 'aria-current': at.dev === d.id && !at.tid ? 'page' : null },
            h('span', { class: `dot${info?.running ? ' run' : d.hub ? ' on' : ''}` }), h('span', { class: 'n' }, d.id),
            h('span', { class: 'm num' }, d.hub ? (info?.running ? `${info.running} running` : '') : 'offline')),
          open && d.hub && info ? meters(info) : null,
          open && d.hub ? h('a', { class: `side-link${at.tid === 'files' || at.tid === 'file' ? ' on' : ''}`, href: `#/d/${encodeURIComponent(d.id)}/files` }, icon('folder', 'sm'), 'Files') : null,
          open ? h('div', { class: 'side-threads' }, (sideThreads[d.id] ?? []).length
            ? sideThreads[d.id].map(t => h('a', { class: `side-t${t.id === at.tid ? ' on' : ''}`, href: `#/d/${encodeURIComponent(d.id)}/t/${t.id}`, 'aria-current': t.id === at.tid ? 'page' : null },
                h('span', { class: `dot ${t.waiting ? 'ask' : t.status === 'running' ? 'run' : t.lastStatus === 'failed' ? 'bad' : ''}`, style: t.waiting || t.status === 'running' || t.lastStatus === 'failed' ? {} : { background: `var(--${t.provider ?? 'text-3'})` } }),
                h('span', { class: 'b' }, h('span', { class: 't' }, t.title), h('span', { class: 'm num' }, [short(t.project?.name), t.waiting ? 'needs you' : t.status === 'running' ? 'working' : null, ago(t.updatedAt)].filter(Boolean).join(' · ')))))
            : h('p', { class: 'side-empty' }, d.hub ? 'No threads yet.' : 'Comes back when the machine does.')) : null);
      }));
  } catch (e) { side.replaceChildren(h('div', { class: 'error' }, `Couldn’t reach the hub: ${e.message}`)); }
}
wide.addEventListener('change', () => paintSide());
setInterval(() => document.visibilityState === 'visible' && wide.matches && paintSide(), 5000);
// desktop keyboards: Enter sends, Shift+Enter is a new line (on a phone, Return stays a new line)
const enterSends = matchMedia('(hover: hover) and (pointer: fine)').matches;
const sendKey = (e, form) => { if (e.key === 'Enter' && !e.isComposing && (e.metaKey || e.ctrlKey || (enterSends && !e.shiftKey))) { e.preventDefault(); form.requestSubmit(); } };

// ---------- router ----------
function route() {
  for (const f of cleanups) f();
  cleanups = [];
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query ?? '');
  scrollTo(0, 0);
  at.dev = parts[0] === 'd' ? parts[1] ?? null : null; at.tid = parts[2] === 't' ? parts[3] ?? null : parts[2] ?? null; // a sub-page (new-project) isn't the device page
  paintSide(!devicesCache || !sideThreads[at.dev]);
  if (parts[0] === 'd' && parts[1] && parts[2] === 't' && parts[3]) return thread(parts[1], parts[3]);
  if (parts[0] === 'd' && parts[1] && parts[2] === 'new-project') return newProject(parts[1], params);
  if (parts[0] === 'd' && parts[1] && parts[2] === 'files') return browse(parts[1], params, 'files');
  if (parts[0] === 'd' && parts[1] && parts[2] === 'file') return fileView(parts[1], params);
  if (parts[0] === 'd' && parts[1]) return device(parts[1], params);
  return home();
}
// screens cross-fade where the browser supports it (iOS 18+); reduced motion just swaps
addEventListener('hashchange', () => document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(route) : route());
if (pushable) navigator.serviceWorker.register('sw.js').catch(() => {});
route();
