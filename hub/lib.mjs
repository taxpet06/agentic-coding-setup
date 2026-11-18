// Pure decisions for the hub agent: which account runs a turn, which project a sentence means,
// and how each CLI's event stream maps onto one shape. No I/O here; hub/test.mjs covers it.

export const PROVIDERS = ['personal', 'school', 'codex'];
export const CLAUDE = new Set(['personal', 'school']);
// Claude model ids for --model ('' = the account's settings.json default). Codex keeps its config.toml model.
export const MODELS = ['claude-opus-5-5', 'claude-fable-5-2', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']; // same levels for claude --effort and codex model_reasoning_effort
const NEAR = 0.9; // 5-hour window utilization where an account starts yielding to one with more room

// accounts: { personal: { limitedUntil, utilization }, ... }  (ms epoch, 0..1)
export function pickProvider(accounts, now, { installed = PROVIDERS, exclude = [], prefer, force } = {}) {
  const ok = p => installed.includes(p) && !exclude.includes(p) && !((accounts[p]?.limitedUntil ?? 0) > now);
  const util = p => accounts[p]?.utilization ?? 0;
  if (force && ok(force)) return force;
  if (prefer && CLAUDE.has(prefer) && ok(prefer) && util(prefer) < NEAR) return prefer; // stay put: no session copy, no handoff
  const claude = PROVIDERS.filter(p => CLAUDE.has(p) && ok(p));
  if (claude.length) return claude.find(p => util(p) < NEAR) ?? claude.reduce((a, b) => (util(b) < util(a) ? b : a));
  return ok('codex') ? 'codex' : null; // Codex only once both Claude accounts are out
}

// Words that appear in requests but never name a project.
const STOP = new Set(('the and for with this that from into onto make add fix want wanna need please can you could would should ' +
  'update project projects repo repository app code file files new final test tests readme data look how what why when where which ' +
  'done some all about my our its it\'s get set use run build change changes work working page site there here then than just also ' +
  'like into over under more less very really thing stuff help write create delete remove move rename').split(' '));
const words = s => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));

// projects: [{ name: 'Github/dali/3dbattlefield', path }]. Returns the project the text names, or null.
export function matchProject(text, projects) {
  const tokens = [...new Set(words(text))];
  const hitsOf = p => {
    const parts = (p.name.split('/').pop() || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const joined = parts.join('');
    return new Set(tokens.filter(t => parts.includes(t) || (t.length >= 5 && joined.includes(t))));
  };
  const m = projects.map(p => ({ p, hits: hitsOf(p) })).filter(x => x.hits.size);
  const sup = (a, b) => a.size > b.size && [...b].every(t => a.has(t));
  const inside = (c, a) => c.p.path.startsWith(a.p.path + '/');
  const keep = m.filter(x => !m.some(y => y !== x && (
    (inside(y, x) && sup(y.hits, x.hits)) ||   // a sub-repo the text names more precisely beats its parent
    (inside(x, y) && !sup(x.hits, y.hits)))));  // a sub-repo adding nothing over its parent loses to it
  keep.sort((a, b) => b.hits.size - a.hits.size || a.p.path.length - b.p.path.length);
  return keep[0]?.p ?? null;
}

export const LIMIT_RE = /usage limit|rate limit|limit reached|hit your (usage )?limit|out of (credits|usage)|quota|\b429\b/i;

// When does a limit message say the account comes back? ms epoch, or null when it doesn't say.
export function limitResetFrom(text, now) {
  if (!text) return null;
  const epoch = text.match(/\|(\d{10})\b/);
  if (epoch) return Number(epoch[1]) * 1000;
  const rel = text.match(/try again in ([^.]+)/i);
  if (rel) {
    const unit = { d: 86_400_000, h: 3_600_000, m: 60_000 };
    let ms = 0;
    for (const [, n, u] of rel[1].matchAll(/(\d+)\s*(d|h|m)/gi)) ms += Number(n) * unit[u.toLowerCase()];
    if (ms) return now + ms;
  }
  const at = text.match(/(?:resets?|again)(?: at)? (\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (at) {
    const d = new Date(now);
    let h = Number(at[1]) % 12 + (at[3].toLowerCase() === 'pm' ? 12 : 0);
    d.setHours(h, Number(at[2] ?? 0), 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return null;
}

// Claude Code keeps sessions in <config>/projects/<slug>/<session>.jsonl
export const claudeSlug = cwd => cwd.replace(/[^a-zA-Z0-9]/g, '-');

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const toolDetail = i => cut(String(i?.command ?? i?.file_path ?? i?.notebook_path ?? i?.pattern ?? i?.url ?? i?.query ??
  i?.description ?? i?.prompt ?? i?.skill ?? ''), 200);

// One line of `claude -p --output-format stream-json --verbose --include-partial-messages` -> events
export function parseClaude(line) {
  let o; try { o = JSON.parse(line); } catch { return []; }
  switch (o.type) {
    case 'system': return o.subtype === 'init' ? [{ kind: 'session', id: o.session_id }] : [];
    case 'assistant':
      return (o.message?.content ?? []).flatMap(c =>
        c.type === 'text' && c.text ? [{ kind: 'text', text: c.text }]
          : c.type === 'tool_use' ? [{ kind: 'tool', name: c.name, detail: toolDetail(c.input) }] : []);
    case 'stream_event': {
      const d = o.event?.delta;
      return o.event?.type === 'content_block_delta' && d?.type === 'text_delta' ? [{ kind: 'delta', text: d.text }] : [];
    }
    case 'rate_limit_event': {
      const i = o.rate_limit_info ?? {}, w = i.unifiedWindows?.five_hour ?? {};
      const r = w.resetsAt ?? i.resetsAt;
      return [{ kind: 'usage', status: i.status, utilization: w.utilization ?? i.utilization ?? null, resetsAt: r ? r * 1000 : null }];
    }
    case 'result': {
      const text = o.result ?? null;
      return [{ kind: 'result', ok: !o.is_error, text, limited: !!o.is_error && (o.api_error_status === 429 || LIMIT_RE.test(text ?? '')) }];
    }
    default: return [];
  }
}

// One line of `codex exec --json` -> events
export function parseCodex(line) {
  let o; try { o = JSON.parse(line); } catch { return []; }
  const it = o.item;
  switch (o.type) {
    case 'thread.started': return [{ kind: 'session', id: o.thread_id }];
    case 'item.completed':
      switch (it?.type) {
        case 'agent_message': return it.text ? [{ kind: 'text', text: it.text }] : [];
        case 'command_execution': return [{ kind: 'tool', name: 'Shell', detail: cut(it.command ?? '', 200), ...(it.exit_code ? { failed: true } : {}) }];
        case 'file_change': return [{ kind: 'tool', name: 'Edit', detail: cut((it.changes ?? []).map(c => c.path).join(', '), 200) }];
        case 'mcp_tool_call': return [{ kind: 'tool', name: `${it.server}.${it.tool}`, detail: '' }];
        case 'web_search': return [{ kind: 'tool', name: 'Search', detail: cut(it.query ?? '', 200) }];
        default: return [];
      }
    case 'turn.completed': return [{ kind: 'result', ok: true, text: null, limited: false }];
    case 'turn.failed': {
      const text = o.error?.message ?? 'turn failed';
      return [{ kind: 'result', ok: false, text, limited: LIMIT_RE.test(text) }];
    }
    case 'error': return [{ kind: 'error', text: o.message ?? '', limited: LIMIT_RE.test(o.message ?? '') }];
    default: return [];
  }
}

// turns: [{ role: 'user'|'assistant', provider?, text }]. The catch-up text for an agent that last saw turns[0..seen).
export function contextFor(turns, seen) {
  const missed = turns.slice(seen).filter(t => t.text);
  if (!missed.length) return '';
  const lines = [];
  let budget = 24_000;
  for (const t of [...missed].reverse()) { // newest first, so the budget keeps the most recent turns
    const s = `${t.role === 'user' ? 'User' : `Assistant (${t.provider})`}: ${cut(t.text, 6_000)}`;
    if (s.length > budget) break;
    budget -= s.length;
    lines.unshift(s);
  }
  return '[Hub handoff: this conversation continued with another assistant account while you were away. ' +
    'Here is what happened since you last saw it; the working tree already has those changes.]\n\n' + lines.join('\n\n') +
    '\n\n[End of handoff. The new request follows.]\n\n';
}
