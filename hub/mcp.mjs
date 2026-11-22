// The hub's stdio MCP server, started inside every agent turn:
//   approve      Claude's --permission-prompt-tool: permission prompts and AskUserQuestion go to the phone
//   attach_file  put a file from this machine into the chat, where the owner can open or download it
// HUB_TOOLS picks which ones this agent sees (Codex never asks permission, so it only gets attach_file).
// ponytail: hand-rolled JSON-RPC over newline-delimited stdio; the MCP SDK isn't worth a dependency for two tools.
import readline from 'node:readline';
import path from 'node:path';

const { HUB_URL, HUB_TOKEN, HUB_THREAD, HUB_TURN, HUB_TOOLS = 'approve,attach_file' } = process.env;
const send = m => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const hub = (route, body, timeout) => fetch(`${HUB_URL}/api/${route}`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-token': HUB_TOKEN },
  body: JSON.stringify({ thread: HUB_THREAD, turn: HUB_TURN, ...body }), signal: AbortSignal.timeout(timeout),
}).then(r => r.json());

const TOOLS = {
  approve: {
    description: 'Ask the owner on their phone whether a tool call may run.',
    inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name', 'input'] },
    async run(a) {
      try {
        const d = await hub('approvals', { tool: a.tool_name, input: a.input ?? {}, toolUseId: a.tool_use_id }, 3_600_000); // unanswered: denied after an hour
        // updatedInput carries the answers when the request was an AskUserQuestion
        return d.allow ? { behavior: 'allow', updatedInput: d.updatedInput ?? a.input ?? {} } : { behavior: 'deny', message: d.message || 'Denied from the Hub app.' };
      } catch (e) { return { behavior: 'deny', message: `No answer from the Hub app (${e.message}).` }; }
    },
  },
  attach_file: {
    description: 'Show the user a file from this machine in the Hub chat. They read the conversation on a phone or another computer and cannot see this disk, so attach any file they should look at: a report, chart, screenshot, PDF, CSV, a log, or a file you just made or changed. They can open readable formats in the app and download anything else. Attach the file itself; do not paste its whole contents into your reply.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Path to the file (absolute, or relative to your working directory)' }, caption: { type: 'string', description: 'One short line about what it is (optional)' } }, required: ['path'] },
    async run(a) {
      try {
        const r = await hub('attach', { path: path.resolve(String(a.path ?? '')), caption: a.caption }, 60_000);
        return r.error ? `Not attached: ${r.error}` : `Attached ${r.name} (${r.size} bytes). The user can open it in the app.`;
      } catch (e) { return `Not attached: the Hub app didn't answer (${e.message}).`; }
    },
  },
};
const enabled = HUB_TOOLS.split(',').filter(n => TOOLS[n]);

readline.createInterface({ input: process.stdin }).on('line', async line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notifications need no reply
  if (m.method === 'initialize') return send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'hub', version: '2' } } });
  if (m.method === 'ping') return send({ id: m.id, result: {} });
  if (m.method === 'tools/list') return send({ id: m.id, result: { tools: enabled.map(name => ({ name, description: TOOLS[name].description, inputSchema: TOOLS[name].inputSchema })) } });
  if (m.method === 'tools/call') {
    const t = enabled.includes(m.params?.name) && TOOLS[m.params.name];
    if (!t) return send({ id: m.id, error: { code: -32602, message: `Unknown tool ${m.params?.name}` } });
    const out = await t.run(m.params?.arguments ?? {});
    return send({ id: m.id, result: { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }] } });
  }
  send({ id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } });
});
