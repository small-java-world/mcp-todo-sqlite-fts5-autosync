import WebSocket from 'ws';

const TOKEN = process.env.MCP_TOKEN || 'devtoken';
console.log('Using token:', TOKEN);

function rpc(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id === id) {
          ws.off('message', onMsg);
          if (msg.error) {
            console.log('RPC Error:', msg.error);
            reject(new Error(`${msg.error.code}:${msg.error.message}`));
          } else {
            console.log('RPC Success:', msg.result);
            resolve(msg.result);
          }
        }
      } catch (e) { 
        console.log('Parse Error:', e);
        reject(e); 
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
  });
}

async function testAuth() {
  console.log('Connecting to server...');
  const ws = new WebSocket('ws://127.0.0.1:8765');
  
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  
  console.log('Connected! Testing register...');
  
  try {
    // 認証なしでregisterを試す
    const result1 = await rpc(ws, 'register', { authToken: TOKEN });
    console.log('Register result:', result1);
    
    // セッションIDを使ってupsert_taskを試す
    const result2 = await rpc(ws, 'upsert_task', { 
      session: result1.session,
      id: 'test-1', 
      title: 'Test Task', 
      text: 'Test description' 
    });
    console.log('Upsert result:', result2);
    
  } catch (error) {
    console.log('Test failed:', error.message);
  }
  
  ws.close();
}

testAuth().catch(console.error);
