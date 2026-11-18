// node --test hub/test.mjs : the decisions that must not regress (provider choice, routing, event parsing)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickProvider, matchProject, limitResetFrom, claudeSlug, parseClaude, parseCodex, contextFor } from './lib.mjs';

const now = 1_800_000_000_000;
const all = ['personal', 'school', 'codex'];

test('pickProvider: order, limits, stickiness, near-limit balancing', () => {
  assert.equal(pickProvider({}, now, { installed: all }), 'personal');
  assert.equal(pickProvider({ personal: { limitedUntil: now + 1 } }, now, { installed: all }), 'school');
  assert.equal(pickProvider({ personal: { limitedUntil: now - 1 } }, now, { installed: all }), 'personal', 'expired limit is forgotten');
  assert.equal(pickProvider({ personal: { limitedUntil: now + 1 }, school: { limitedUntil: now + 1 } }, now, { installed: all }), 'codex');
  assert.equal(pickProvider({ personal: { limitedUntil: now + 1 }, school: { limitedUntil: now + 1 }, codex: { limitedUntil: now + 1 } }, now, { installed: all }), null);
  assert.equal(pickProvider({}, now, { installed: all, exclude: ['personal'] }), 'school');
  assert.equal(pickProvider({}, now, { installed: ['school', 'codex'] }), 'school', 'missing profile skipped');
  assert.equal(pickProvider({}, now, { installed: all, prefer: 'school' }), 'school', 'stay on the thread\'s account');
  assert.equal(pickProvider({ school: { utilization: 0.95 } }, now, { installed: all, prefer: 'school' }), 'personal', 'leave an account about to run out');
  assert.equal(pickProvider({ personal: { utilization: 0.93 }, school: { utilization: 0.2 } }, now, { installed: all }), 'school');
  assert.equal(pickProvider({ personal: { utilization: 0.93 }, school: { utilization: 0.97 } }, now, { installed: all }), 'personal');
  assert.equal(pickProvider({}, now, { installed: all, force: 'codex' }), 'codex');
  assert.equal(pickProvider({}, now, { installed: all, prefer: 'codex' }), 'personal', 'Codex is a last resort: go back to Claude when it has room');
  assert.equal(pickProvider({ codex: { limitedUntil: now + 1 } }, now, { installed: all, force: 'codex' }), 'personal', 'forced but limited falls back');
});

const P = [
  'agentic-coding-setup', 'Github/dali/3dbattlefield', 'Github/dali/3dbattlefield/3d-battlefield',
  'Github/dali/3dbattlefield/3d-battlefield-vercel', 'Github/drill-coordination', 'Github/drill-coordination/drill-reimagined',
  'Github/zigma-points', 'Classes/26f/cosc72/Final Project/fairmod', 'lab', 'lab/2026_Ascites',
].map(name => ({ name, path: '/home/u/' + name }));

test('matchProject: names in plain words', () => {
  const m = t => matchProject(t, P)?.name ?? null;
  assert.equal(m('I wanna fix the camera jitter for battlefield'), 'Github/dali/3dbattlefield', 'parent beats sub-repo');
  assert.equal(m('deploy battlefield to vercel'), 'Github/dali/3dbattlefield/3d-battlefield-vercel', 'extra word picks the sub-repo');
  assert.equal(m('update the drill reimagined readme'), 'Github/drill-coordination/drill-reimagined');
  assert.equal(m('how is scoring done in zigma?'), 'Github/zigma-points');
  assert.equal(m('Fairmod: add a test'), 'Classes/26f/cosc72/Final Project/fairmod');
  assert.equal(m('look at the ascites data'), 'lab/2026_Ascites');
  assert.equal(m('add a new project for my final'), null, 'generic words never route');
  assert.equal(m('hello'), null);
});

test('limitResetFrom', () => {
  assert.equal(limitResetFrom('Claude AI usage limit reached|1800003600', now), 1800003600_000);
  assert.equal(limitResetFrom("You've hit your usage limit. Try again in 2 hours 30 minutes.", now), now + 150 * 60_000);
  assert.equal(limitResetFrom('try again in 3 days', now), now + 3 * 86_400_000);
  assert.equal(limitResetFrom('something else', now), null);
});

test('claudeSlug matches Claude Code project dirs', () => {
  assert.equal(claudeSlug('/home/petros/Github/dali/3dbattlefield'), '-home-petros-Github-dali-3dbattlefield');
  assert.equal(claudeSlug('/home/p/Final Project/x_y'), '-home-p-Final-Project-x-y');
});

test('parseClaude normalizes stream-json', () => {
  const ev = l => parseClaude(JSON.stringify(l));
  assert.deepEqual(ev({ type: 'system', subtype: 'init', session_id: 's1' }), [{ kind: 'session', id: 's1' }]);
  assert.deepEqual(ev({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }] } }),
    [{ kind: 'text', text: 'hi' }, { kind: 'tool', name: 'Bash', detail: 'ls -la' }]);
  assert.deepEqual(ev({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'impeccable' } }] } }),
    [{ kind: 'tool', name: 'Skill', detail: 'impeccable' }], 'skill name feeds the skill labels in the app');
  assert.deepEqual(ev({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'h' } } }), [{ kind: 'delta', text: 'h' }]);
  assert.deepEqual(ev({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1800003600, unifiedWindows: { five_hour: { utilization: 0.91 } } } }),
    [{ kind: 'usage', status: 'allowed_warning', utilization: 0.91, resetsAt: 1800003600_000 }]);
  assert.deepEqual(ev({ type: 'result', is_error: false, result: 'done' }), [{ kind: 'result', ok: true, text: 'done', limited: false }]);
  assert.equal(ev({ type: 'result', is_error: true, api_error_status: 429, result: 'x' })[0].limited, true);
  assert.equal(ev({ type: 'result', is_error: true, result: 'Claude AI usage limit reached|1800003600' })[0].limited, true);
  assert.equal(ev({ type: 'result', is_error: true, result: 'Tool failed: file not found' })[0].limited, false);
  assert.deepEqual(parseClaude('not json'), []);
});

test('parseCodex normalizes exec --json', () => {
  const ev = l => parseCodex(JSON.stringify(l));
  assert.deepEqual(ev({ type: 'thread.started', thread_id: 't1' }), [{ kind: 'session', id: 't1' }]);
  assert.deepEqual(ev({ type: 'item.completed', item: { type: 'agent_message', text: 'pong' } }), [{ kind: 'text', text: 'pong' }]);
  assert.deepEqual(ev({ type: 'item.completed', item: { type: 'command_execution', command: 'npm test', exit_code: 1 } }), [{ kind: 'tool', name: 'Shell', detail: 'npm test', failed: true }]);
  assert.deepEqual(ev({ type: 'item.completed', item: { type: 'file_change', changes: [{ path: 'a.js' }, { path: 'b.js' }] } }), [{ kind: 'tool', name: 'Edit', detail: 'a.js, b.js' }]);
  assert.deepEqual(ev({ type: 'turn.completed' }), [{ kind: 'result', ok: true, text: null, limited: false }]);
  assert.equal(ev({ type: 'turn.failed', error: { message: "You've hit your usage limit." } })[0].limited, true);
  assert.equal(ev({ type: 'error', message: 'stream disconnected' })[0].limited, false);
});

test('contextFor hands over only what the agent has not seen', () => {
  const turns = [
    { role: 'user', text: 'make a button' }, { role: 'assistant', provider: 'personal', text: 'Added Button.tsx' },
    { role: 'user', text: 'make it blue' }, { role: 'assistant', provider: 'codex', text: 'Changed color' },
  ];
  assert.equal(contextFor(turns, 4), '', 'nothing missed');
  const c = contextFor(turns, 2);
  assert.match(c, /make it blue/);
  assert.match(c, /Changed color/);
  assert.doesNotMatch(c, /make a button/);
  assert.ok(contextFor([{ role: 'user', text: 'x'.repeat(100_000) }], 0).length < 30_000, 'bounded');
});
