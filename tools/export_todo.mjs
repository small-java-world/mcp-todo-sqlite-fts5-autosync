import WebSocket from 'ws';
import fs from 'fs';

const WS_URL = process.env.MCP_URL || 'ws://127.0.0.1:8765';
const TOKEN = process.env.MCP_TOKEN || 'devtoken';

const outPath = process.argv[2] || 'TODO.export.md';

const ws = new WebSocket(WS_URL);
const send = (id, method, params) => ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
const recv = () => new Promise(res => ws.once('message', d => res(JSON.parse(d.toString()))));

ws.on('open', async () => {
  send(1, 'register', { worker_id:'cli', authToken:TOKEN });
  await recv();
  send(2, 'export_todo_md', {});
  const r = await recv();
  if (r.error) {
    console.error('RPC error:', r.error); process.exit(1);
  }
  const b64 = r.result?.bytes_base64;
  if (!b64) { console.error('No bytes_base64 in result'); process.exit(2); }
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(outPath, buf);
  console.log(`[ok] exported to ${outPath} (${buf.length} bytes)`);
  ws.close();
});
