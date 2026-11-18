// Stdio MCP server with one tool, `approve`, used as Claude's --permission-prompt-tool for hub turns.
// It forwards the permission prompt to the hub agent, which asks the phone and answers when you tap Allow or Deny.
// ponytail: hand-rolled JSON-RPC over newline-delimited stdio; the MCP SDK isn't worth a dependency for one tool.
import readline from 'node:readline';

const { HUB_URL, HUB_TOKEN, HUB_THREAD, HUB_TURN } = process.env;
const send = m => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');

async function decide(args) {
  try {
    const r = await fetch(`${HUB_URL}/api/approvals`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-token': HUB_TOKEN },
      body: JSON.stringify({ thread: HUB_THREAD, turn: HUB_TURN, tool: args.tool_name, input: args.input ?? {}, toolUseId: args.tool_use_id }),
      signal: AbortSignal.timeout(3_600_000), // an unanswered prompt is denied after an hour
    });
    const d = await r.json();
    // updatedInput carries the answers when the request was an AskUserQuestion
    return d.allow ? { behavior: 'allow', updatedInput: d.updatedInput ?? args.input ?? {} } : { behavior: 'deny', message: d.message || 'Denied from the Hub app.' };
  } catch (e) {
    return { behavior: 'deny', message: `No answer from the Hub app (${e.message}).` };
  }
}

readline.createInterface({ input: process.stdin }).on('line', async line => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.id === undefined) return; // notifications need no reply
  if (m.method === 'initialize') return send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'hub', version: '1' } } });
  if (m.method === 'ping') return send({ id: m.id, result: {} });
  if (m.method === 'tools/list') return send({ id: m.id, result: { tools: [{
    name: 'approve', description: 'Ask the owner on their phone whether a tool call may run.',
    inputSchema: { type: 'object', properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } }, required: ['tool_name', 'input'] },
  }] } });
  if (m.method === 'tools/call') return send({ id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(await decide(m.params?.arguments ?? {})) }] } });
  send({ id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } });
});
