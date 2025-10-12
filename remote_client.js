import WebSocket from 'ws';

// サーバーのIPアドレスを指定（例：192.168.1.9）
const SERVER_IP = process.env.MCP_SERVER_IP || '192.168.1.9';
const WS_URL = `ws://${SERVER_IP}:8765`;
const TOKEN = process.env.MCP_TOKEN || 'devtoken';

console.log(`Connecting to MCP TODO Server at: ${WS_URL}`);

const ws = new WebSocket(WS_URL);
let sessionId = null;

const call = (id, method, params) => {
  if (sessionId && method !== 'register') {
    params.session = sessionId;
  }
  ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
};

ws.on('open', () => {
  console.log('✅ Connected to remote MCP TODO Server');
  call(1, 'register', { worker_id:'remote-client', authToken:TOKEN });
});

ws.on('message', (d) => {
  const response = JSON.parse(d.toString());
  console.log('📨 Response:', d.toString());
  
  if (response.id === 1 && response.result && response.result.session) {
    sessionId = response.result.session;
    console.log('🔑 Session ID:', sessionId);
    
    // 接続成功後にTODO操作をテスト
    setTimeout(() => {
      console.log('\n🧪 Testing remote TODO operations...');
      call(2, 'upsert_task', { id:'REMOTE-1', title:'Remote Test', text:'This is a test from remote machine' });
      call(3, 'search', { q:'remote', highlight:true });
      call(4, 'get_task', { id:'REMOTE-1' });
    }, 100);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.log('\n💡 Troubleshooting:');
  console.log('1. Check if server is running on the target machine');
  console.log('2. Verify firewall settings (port 8765)');
  console.log('3. Confirm IP address is correct');
  console.log('4. Ensure both machines are on the same network');
});

ws.on('close', () => {
  console.log('🔌 Connection closed');
});
