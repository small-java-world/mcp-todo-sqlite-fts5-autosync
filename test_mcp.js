import WebSocket from 'ws';

const WS_URL = process.env.MCP_URL || 'ws://127.0.0.1:8765';
const TOKEN = process.env.MCP_TOKEN || 'devtoken';

const ws = new WebSocket(WS_URL);
let sessionId = null;

const call = (id, method, params) => {
  // セッションIDがある場合は追加
  if (sessionId && method !== 'register') {
    params.session = sessionId;
  }
  ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
};

ws.on('open', () => {
  console.log('connected');
  call(1, 'register', { worker_id:'node-client', authToken:TOKEN });
});

ws.on('message', (d) => {
  const response = JSON.parse(d.toString());
  console.log('->', d.toString());
  
  // registerの応答からセッションIDを取得
  if (response.id === 1 && response.result && response.result.session) {
    sessionId = response.result.session;
    console.log('Session ID:', sessionId);
    
    // セッション取得後にTODO操作を実行
    setTimeout(() => {
      call(2, 'upsert_task', { id:'T-1', title:'Hello', text:'- [ ] write server skeleton', meta:{owner:'me'} });
      call(3, 'search', { q:'skeleton', highlight:true });
      call(4, 'mark_done', { id:'T-1', done:true });
      call(5, 'get_task', { id:'T-1' });
    }, 100);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
