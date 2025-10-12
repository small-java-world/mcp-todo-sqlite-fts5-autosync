import WebSocket from 'ws';
import fs from 'fs';

const WS_URL = process.env.MCP_URL || 'ws://127.0.0.1:8765';
const TOKEN = process.env.MCP_TOKEN || 'devtoken';

const inPath = process.argv[2] || 'TODO.import.md';
if (!fs.existsSync(inPath)) {
  console.error('File not found:', inPath); process.exit(1);
}

const ws = new WebSocket(WS_URL);
const send = (id, method, params) => ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
const recv = () => new Promise(res => ws.once('message', d => res(JSON.parse(d.toString()))));

ws.on('open', async () => {
  send(1, 'register', { worker_id:'cli', authToken:TOKEN });
  await recv();
  const b64 = fs.readFileSync(inPath).toString('base64');
  send(2, 'import_todo_md', { bytes_base64: b64 });
  const r = await recv();
  if (r.error) { console.error('RPC error:', r.error); process.exit(1); }
  console.log('[ok] imported from', inPath, JSON.stringify(r.result));
  ws.close();
});
