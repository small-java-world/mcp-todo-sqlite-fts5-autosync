import WebSocket from 'ws';

const WS_URL = process.env.MCP_URL || 'ws://127.0.0.1:8765';
const TOKEN = process.env.MCP_TOKEN || 'devtoken';

if (process.argv.length < 3) {
  console.error('Usage: node tools/rpc.mjs <method> [<params-json>]');
  process.exit(1);
}

const method = process.argv[2];
let params = {};
if (process.argv[3]) {
  try { params = JSON.parse(process.argv[3]); } catch(e) {
    console.error('Invalid JSON for params'); process.exit(2);
  }
}

const ws = new WebSocket(WS_URL);

const send = (id, method, params) => ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
const recv = () => new Promise(res => ws.once('message', d => res(JSON.parse(d.toString()))));

ws.on('open', async () => {
  send(1, 'register', { worker_id:'cli', authToken:TOKEN });
  await recv();
  send(2, method, params);
  const r = await recv();
  console.log(JSON.stringify(r, null, 2));
  ws.close();
});
