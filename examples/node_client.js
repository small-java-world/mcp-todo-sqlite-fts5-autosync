
import WebSocket from 'ws';

const WS_URL = process.env.MCP_URL || 'ws://127.0.0.1:8765';
const TOKEN = process.env.MCP_TOKEN || 'devtoken';

const ws = new WebSocket(WS_URL);

const call = (id, method, params) => ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));

ws.on('open', () => {
  console.log('connected');
  call(1, 'register', { worker_id:'node-client', authToken:TOKEN });
  call(2, 'upsert_task', { id:'T-1', title:'Hello', text:'- [ ] write server skeleton', meta:{owner:'me'} });
  call(3, 'search', { q:'skeleton', highlight:true });
  call(4, 'mark_done', { id:'T-1', done:true });
  call(5, 'get_task', { id:'T-1' });
});

ws.on('message', (d) => console.log('->', d.toString()));

// archive & restore demo
// call(6, 'archive_task', { id:'T-1', reason:'done' });
// call(7, 'list_archived', {});
// call(8, 'restore_task', { id:'T-1' });
