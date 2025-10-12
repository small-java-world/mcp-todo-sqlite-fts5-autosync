import WebSocket from 'ws';

const WS_URL = process.env.MCP_URL || 'ws://127.0.0.1:8765';
const TOKEN = process.env.MCP_TOKEN || 'devtoken';

const ws = new WebSocket(WS_URL);
let sessionId = null;

const call = (id, method, params) => {
  if (sessionId && method !== 'register') {
    params.session = sessionId;
  }
  ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
};

ws.on('open', () => {
  console.log('connected');
  call(1, 'register', { worker_id:'search-test', authToken:TOKEN });
});

ws.on('message', (d) => {
  const response = JSON.parse(d.toString());
  console.log('->', d.toString());
  
  if (response.id === 1 && response.result && response.result.session) {
    sessionId = response.result.session;
    console.log('Session ID:', sessionId);
    
    // 検索テストを実行
    setTimeout(() => {
      console.log('\n=== Search Tests ===');
      call(2, 'search', { q:'skeleton', highlight:true });
      call(3, 'search', { q:'Hello', highlight:true });
      call(4, 'search', { q:'server', highlight:true });
    }, 100);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
