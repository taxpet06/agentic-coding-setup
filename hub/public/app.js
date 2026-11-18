// Hub PWA. Talks to the hub agent that served it; other devices are reached through it at /api/d/<device>/...
const app = document.getElementById('app');
const PROVIDERS = ['personal', 'school', 'codex'];
const LABEL = { personal: 'Claude personal', school: 'Claude school', codex: 'Codex' };
const SHORT = { personal: 'Personal', school: 'School', codex: 'Codex' };
// keep in step with lib.mjs MODELS / EFFORTS
const MODELS = { 'claude-opus-5-5': 'Opus 5.5', 'claude-fable-5-2': 'Fable 5.2', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };
const EFFORTS = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' };
// keep in step with lib.mjs MODES
const MODES = { auto: 'Auto mode', acceptEdits: 'Accept edits', plan: 'Plan only', bypassPermissions: 'Bypass permissions' };

// ---------- tiny DOM kit (text always goes in as text nodes; only md() output is HTML, and it escapes) ----------
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
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
function md(src) {
  const out = [];
  src.split('```').forEach((part, i) => {
    if (i % 2) { const nl = part.indexOf('\n'); out.push(`<pre>${esc((nl >= 0 ? part.slice(nl + 1) : part).replace(/\n$/, ''))}</pre>`); return; }
    for (const para of part.split(/\n{2,}/)) {
      let list = null, buf = [];
      const flushList = () => { if (list) out.push(`<${list.t}>${list.items.map(x => `<li>${inline(x)}</li>`).join('')}</${list.t}>`); list = null; };
      const flushP = () => { if (buf.length) out.push(`<p>${buf.map(inline).join('<br>')}</p>`); buf = []; };
      for (const line of para.split('\n')) {
        let m;
        if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { flushP(); if (list?.t !== 'ul') { flushList(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); }
        else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushP(); if (list?.t !== 'ol') { flushList(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); }
        else if ((m = line.match(/^#{1,6}\s+(.*)/))) { flushP(); flushList(); out.push(`<h4>${inline(m[1])}</h4>`); }
        else if (line.trim()) { flushList(); buf.push(line); }
      }
      flushP(); flushList();
    }
  });
  return out.join('');
}

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
  mount(h('main', { class: 'screen' }, bar({ mid: 'Hub', end: [refresh] }), h('h1', { class: 'title' }, 'Hub'), sub, list, others, notifySection(),
    h('p', { class: 'hint', style: { 'margin-top': '24px' } }, 'Each machine runs its own hub. To add one, run ', h('code', {}, 'hub app'), ' on it.')));
  async function load(fresh) {
    try {
      const ds = await api(`devices${fresh ? '?fresh=1' : ''}`);
      devicesCache = ds;
      const hubs = ds.filter(d => d.hub || d.lastInfo).sort((a, b) => b.self - a.self || b.online - a.online || a.id.localeCompare(b.id));
      const running = hubs.reduce((n, d) => n + (d.info?.running ?? 0), 0);
      sub.textContent = `${hubs.filter(d => d.hub).length} of ${hubs.length} ${hubs.length === 1 ? 'machine' : 'machines'} online · ${running} running`;
      list.replaceChildren(h('div', { class: 'group' }, hubs.map(deviceRow)));
      const rest = ds.filter(d => !d.hub && !d.lastInfo);
      others.replaceChildren(...(rest.length ? [h('h2', { class: 'section' }, 'Other devices on your tailnet'),
        h('div', { class: 'group' }, rest.map(d => h('div', { class: 'row dim' }, h('span', { class: `dot${d.online ? ' on' : ''}` }),
          h('div', { class: 'body' }, h('div', { class: 'name' }, d.id), h('div', { class: 'meta' }, `${d.os ?? ''} · ${d.online ? 'online, no hub' : 'offline'}`)))))] : []));
    } catch (e) { list.replaceChildren(h('div', { class: 'error' }, `Couldn't reach the hub: ${e.message}`)); }
  }
  load(); every(6000, () => load());
}
function deviceRow(d) {
  const info = d.info ?? d.lastInfo;
  const meta = d.hub ? `${info.running ? `${info.running} running · ` : ''}${info.threads} threads · ${info.projects} projects` : `offline${d.lastSeen ? ` · seen ${ago(Date.parse(d.lastSeen))} ago` : ''}`;
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
    const reg = await navigator.serviceWorker.ready;
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
  mount(h('main', { class: 'screen' }, bar({ back: { href: '#/', label: 'Hub' }, mid: id, end: [plus] }), h('h1', { class: 'title' }, id), sub, composerSlot, seg, content));

  function setTab(t) {
    tab = t; try { sessionStorage.setItem(tabKey, t); } catch {}
    for (const b of seg.children) b.setAttribute('aria-selected', String(b.dataset.t === t));
    paint();
  }
  function openComposer(project) {
    composerSlot.replaceChildren(newThreadForm(id, projects ?? [], project, () => composerSlot.replaceChildren()));
    composerSlot.querySelector('textarea')?.focus();
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
      content.replaceChildren(h('div', { style: { 'margin-bottom': '10px' } }, q), rows,
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
  load(); every(5000, load);
}
function threadRow(id, t) {
  const st = t.status === 'running' ? 'run' : t.lastStatus === 'failed' ? 'bad' : '';
  const stWord = t.status === 'running' ? 'working' : { failed: 'failed', stopped: 'stopped', interrupted: 'interrupted' }[t.lastStatus] ?? '';
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
const field = (label, el, cls = '') => h('label', { class: `field ${cls}` }, h('span', {}, label), el);
function newThreadForm(id, projects, project, onClose) {
  const proj = h('select', { 'aria-label': 'Project' }, h('option', { value: '' }, 'Auto: from your message'),
    projects.map(p => h('option', { value: p.name, selected: p.name === project }, p.name.includes('/') ? `${short(p.name)} · ${p.name.slice(0, p.name.lastIndexOf('/'))}` : p.name)));
  const prov = providerSelect();
  const set = settingSelects();
  const text = h('textarea', { placeholder: project ? `What should happen in ${short(project)}?` : 'e.g. fix the camera jitter in battlefield', rows: 4, 'aria-label': 'Message' });
  const send = h('button', { class: 'btn', type: 'submit' }, icon('send', 'sm'), 'Start');
  const f = h('form', { class: 'new', onsubmit: async e => {
    e.preventDefault();
    if (!text.value.trim()) return text.focus();
    send.disabled = true;
    try {
      const t = await api(`${dev(id)}threads`, { method: 'POST', body: { text: text.value, project: proj.value || undefined, provider: prov.value || undefined,
        model: set.model.value, effort: set.effort.value, mode: set.mode.value } });
      location.hash = `#/d/${encodeURIComponent(id)}/t/${t.id}`;
    } catch (err) { toast(err.message); send.disabled = false; }
  } },
  h('div', { class: 'two' }, field('Project', proj, 'span2'), field('Account', prov), field('Permissions', set.mode), field('Model', set.model), field('Effort', set.effort)),
  text,
  h('div', { style: { display: 'flex', gap: '8px', 'justify-content': 'flex-end' } }, h('button', { class: 'btn quiet', type: 'button', onclick: onClose }, 'Cancel'), send));
  text.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) f.requestSubmit(); });
  return f;
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
  return body ? h('details', { class: cls }, h('summary', {}, head), body) : h('div', { class: `${cls} flat` }, head);
}
function stepGroup(list, live) {
  const failed = list.filter(i => i.failed).length;
  const names = [...new Set(list.map(i => toolLabel(i.name)))].slice(0, 3).join(', ');
  const busy = live && list.at(-1).output == null;
  return h('details', { class: 'steps', open: live },
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
const HIDDEN = new Set(['Skill', 'TodoWrite']); // drawn as the skill labels and the plan card instead

// ---------- thread ----------
function thread(id, tid) {
  let t = null, live = '', liveTurn = null, settingsShown = false;
  const turnsEl = h('div');
  const bandWhat = h('div', { class: 'what num' }, 'Loading…');
  const stopTurn = async () => { stop.disabled = true; try { await api(`${dev(id)}threads/${tid}/stop`, { method: 'POST' }); } catch (e) { toast(e.message); stop.disabled = false; } };
  const stop = h('button', { class: 'btn danger sm', hidden: true, onclick: stopTurn }, icon('stop', 'sm'), 'Stop');
  const band = h('div', { class: 'band', role: 'status' }, bandWhat, stop);
  const titleEl = h('h1', { class: 'title clamp', style: { 'font-size': '24px' } }, '');
  const where = h('p', { class: 'subtitle' }, '');
  const archive = navIcon('archive', 'Archive thread', async () => {
    try { await api(`${dev(id)}threads/${tid}`, { method: 'DELETE' }); location.hash = `#/d/${encodeURIComponent(id)}`; } catch (e) { toast(e.message); }
  });

  // composer: settings, queue, input, send (which turns into Stop while a turn runs and nothing is typed)
  const prov = providerSelect();
  const set = settingSelects();
  const optsSum = h('span', { class: 'sum' });
  const opts = h('details', { class: 'opts' }, h('summary', {}, icon('tune', 'sm'), optsSum, icon('chev', 'chev')),
    h('div', { class: 'grid' }, field('Account', prov), field('Permissions', set.mode), field('Model', set.model), field('Effort', set.effort)));
  const paintOpts = () => { optsSum.textContent = [prov.value ? SHORT[prov.value] : 'Auto account', MODELS[set.model.value] ?? 'Default model',
    set.effort.value ? `${EFFORTS[set.effort.value]} effort` : 'Default effort', MODES[set.mode.value]].join(' · '); };
  for (const s of [prov, set.model, set.effort, set.mode]) s.addEventListener('change', paintOpts);
  const queueEl = h('div', { class: 'queue', hidden: true });
  const input = h('textarea', { rows: 1, placeholder: 'Follow up…', 'aria-label': 'Message' });
  const send = h('button', { class: 'btn send', type: 'submit', 'aria-label': 'Send' }, icon('send'));
  let busy = false;
  const stopMode = () => t?.status === 'running' && !input.value.trim();
  const form = h('form', { class: 'composer', onsubmit: async e => {
    e.preventDefault();
    if (busy) return;
    if (stopMode()) return stopTurn();
    const text = input.value.trim();
    if (!text) return input.focus();
    busy = true; send.disabled = true;
    try {
      await api(`${dev(id)}threads/${tid}/messages`, { method: 'POST', body: { text, provider: prov.value || undefined, model: set.model.value, effort: set.effort.value, mode: set.mode.value } });
      input.value = ''; grow(); prov.value = ''; paintOpts(); opts.open = false;
    } catch (err) { toast(err.message); }
    busy = false; send.disabled = false; paintSend();
  } }, h('div', { class: 'wrap' }, opts, queueEl, h('div', { class: 'in' }, input, send)));
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight + 2, innerHeight * 0.4)}px`; };
  input.addEventListener('input', () => { grow(); paintSend(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit(); });
  mount(h('main', { class: 'screen has-composer' }, bar({ back: { href: `#/d/${encodeURIComponent(id)}`, label: id }, mid: '', end: [archive] }), titleEl, where, band, turnsEl), form);
  const midEl = app.querySelector('.bar .mid');
  const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', `${form.offsetHeight}px`));
  ro.observe(form); onCleanup(() => ro.disconnect());

  const nearBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 140;
  const stick = f => { const was = nearBottom(); f(); if (was) requestAnimationFrame(() => scrollTo({ top: document.documentElement.scrollHeight })); };

  function paintSend() {
    const running = t?.status === 'running', s = stopMode();
    send.classList.toggle('stop', s);
    send.setAttribute('aria-label', s ? 'Stop' : running ? 'Queue message' : 'Send');
    send.replaceChildren(icon(s ? 'stop' : 'send'));
    input.placeholder = running ? 'Queue a follow-up…' : 'Follow up…';
  }
  function paintQueue() {
    const q = t?.queue ?? [];
    queueEl.hidden = !q.length;
    queueEl.replaceChildren(...q.map((m, i) => h('div', { class: 'q' },
      h('span', { class: 'k' }, i ? `Then` : 'Next'),
      h('span', { class: 't' }, m.text),
      h('button', { class: 'qb', type: 'button', 'aria-label': 'Edit queued message', onclick: async () => {
        try { await api(`${dev(id)}threads/${tid}/queue/${m.id}`, { method: 'DELETE' }); input.value = input.value.trim() ? `${input.value}\n${m.text}` : m.text; grow(); paintSend(); input.focus(); } catch (e) { toast(e.message); }
      } }, icon('edit', 'sm')),
      h('button', { class: 'qb', type: 'button', 'aria-label': 'Remove queued message', onclick: async () => {
        try { await api(`${dev(id)}threads/${tid}/queue/${m.id}`, { method: 'DELETE' }); } catch (e) { toast(e.message); }
      } }, icon('x', 'sm')))));
  }
  function paintBand() {
    if (!t) return;
    const last = t.turns.at(-1);
    const running = t.status === 'running';
    band.className = `band${running ? ' running' : last?.status === 'failed' ? ' failed' : ''}`;
    const who = last?.provider ? SHORT[last.provider] : running ? 'picking an account' : '';
    const word = running ? 'Working' : { done: 'Done', failed: 'Failed', stopped: 'Stopped', interrupted: 'Interrupted' }[last?.status] ?? 'Idle';
    const time = running ? dur(Date.now() - last.startedAt) : last?.endedAt ? (ago(last.endedAt) === 'now' ? 'just now' : `${ago(last.endedAt)} ago`) : '';
    const q = t.queue?.length ? `${t.queue.length} queued` : '';
    bandWhat.replaceChildren(h('b', {}, word), [who, time, q].filter(Boolean).map(s => ` · ${s}`).join(''));
    stop.hidden = !running; if (!running) stop.disabled = false;
    archive.disabled = running;
    paintSend();
  }
  function renderTurn(turn) {
    if (turn.role === 'user') return h('div', { class: 'msg-user', 'data-id': turn.id }, turn.text);
    const el = h('div', { class: 'turn', 'data-id': turn.id });
    // name whoever started the turn and how it ran; each handoff seam names who took over after that
    const first = turn.items.find(i => i.kind === 'seam')?.from ?? turn.provider;
    const how = [modelOf(turn, first), turn.effort ? `${EFFORTS[turn.effort]} effort` : null, turn.mode && turn.mode !== 'auto' ? MODES[turn.mode] : null].filter(Boolean);
    if (first) el.append(h('div', { class: `who-line c-${first}` }, h('span', { class: 'dot' }), LABEL[first], how.length ? h('span', { class: 'how' }, ` · ${how.join(' · ')}`) : null));
    const skills = [...new Set(turn.items.filter(i => i.kind === 'tool' && i.name === 'Skill' && i.detail).map(i => i.detail))];
    if (skills.length) el.append(h('div', { class: 'skills', 'aria-label': 'Skills loaded' }, skills.map(s => h('span', { class: 'tag' }, s))));
    const plan = turn.items.findLast(i => i.kind === 'tool' && i.name === 'TodoWrite' && i.view?.todos?.length);
    if (plan) el.append(todoCard(plan.view.todos));
    const running = turn.status === 'running';
    let group = null;
    const flush = liveGroup => { if (group) el.append(stepGroup(group, liveGroup)); group = null; };
    for (const it of turn.items) {
      if (it.kind === 'tool') { if (!HIDDEN.has(it.name)) (group ??= []).push(it); continue; }
      flush(false);
      if (it.kind === 'text') el.append(h('div', { class: 'prose', html: md(it.text) }));
      else if (it.kind === 'seam') el.append(h('div', { class: 'seam', role: 'note' }, h('span', { class: 'lab' },
        h('span', { class: 'dot from', style: { '--cf': `var(--${it.from})` } }), '→', h('span', { class: 'dot to', style: { '--ct': `var(--${it.to})` } }),
        ` ${LABEL[it.to]} took over · ${it.reason}`)));
      else if (it.kind === 'note') el.append(it.tone === 'error' ? h('div', {}, h('span', { class: 'stamp bad' }, 'Failed'), h('div', { class: 'note bad' }, it.text)) : h('p', { class: 'note' }, it.text));
    }
    flush(running);
    if (running && liveTurn === turn.id && live) el.append(h('div', { class: 'prose live', html: md(live) }));
    else if (running) el.append(h('p', { class: 'note live' }, 'Working'));
    if (turn.status === 'stopped') el.append(h('span', { class: 'stamp muted' }, 'Stopped'));
    if (turn.status === 'interrupted') el.append(h('div', {}, h('span', { class: 'stamp muted' }, 'Interrupted'), h('p', { class: 'note' }, 'The hub restarted during this turn. Send a follow-up to continue.')));
    const text = turn.items.filter(i => i.kind === 'text').map(i => i.text).join('\n\n');
    if (!running && text) {
      const copy = h('button', { class: 'act', type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(text); copy.replaceChildren(icon('check', 'sm'), 'Copied'); setTimeout(() => copy.replaceChildren(icon('copy', 'sm'), 'Copy'), 1600); } catch { toast('Couldn’t copy'); }
      } }, icon('copy', 'sm'), 'Copy');
      el.append(h('div', { class: 'acts' }, copy));
    }
    return el;
  }
  const modelOf = (turn, p) => p && p !== 'codex' && turn.model ? MODELS[turn.model] : null;
  function repaintTurn(turn) {
    const old = turnsEl.querySelector(`[data-id="${turn.id}"]`);
    const keepOpen = [...(old?.querySelectorAll('details') ?? [])].map(d => d.open);
    const fresh = renderTurn(turn);
    // keep whatever the reader opened or closed; new groups take their own default
    fresh.querySelectorAll('details').forEach((d, i) => { if (i < keepOpen.length) d.open = keepOpen[i]; });
    stick(() => (old ? old.replaceWith(fresh) : turnsEl.append(fresh)));
  }
  const whereText = () => `${t.project?.name ?? (t.auto ? 'Auto project' : 'hub')} · ${id}`;
  function paintAll() {
    titleEl.textContent = t.title; midEl.textContent = t.title;
    where.textContent = whereText();
    stick(() => turnsEl.replaceChildren(...t.turns.map(renderTurn)));
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

// ---------- router ----------
function route() {
  for (const f of cleanups) f();
  cleanups = [];
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query ?? '');
  scrollTo(0, 0);
  if (parts[0] === 'd' && parts[1] && parts[2] === 't' && parts[3]) return thread(parts[1], parts[3]);
  if (parts[0] === 'd' && parts[1]) return device(parts[1], params);
  return home();
}
addEventListener('hashchange', route);
if (pushable) navigator.serviceWorker.register('sw.js').catch(() => {});
route();
