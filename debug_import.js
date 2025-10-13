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
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch (e) { reject(e); }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
  });
}

async function runTest() {
  const ws = new WebSocket('ws://127.0.0.1:8765');

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  console.log('Connected! Testing importTodoMd...');

  try {
    // 認証
    const result1 = await rpc(ws, 'register', { authToken: TOKEN });
    console.log('Register result:', result1);

    // 簡単なTODO.mdをインポート
    const todoMd = `# Tasks

## [T-DEBUG-1] Debug Test

- [ ] Test task
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Issues:

#### Issue 1: Test Issue
- **Status**: Open
- **Priority**: High
- **Category**: Bug
- **Severity**: High
- **Created**: 2025-01-16T09:00:00Z by reviewer1
- **Description**: Test issue for debugging
- **Tags**: test, debug

**Responses:**
- 2025-01-16T10:00:00Z by developer1: I'll fix this
`;

    const importResult = await rpc(ws, 'importTodoMd', {
      session: result1.session,
      content: todoMd
    });
    console.log('Import result:', importResult);

    // 全てのタスクを検索
    const searchResult = await rpc(ws, 'search', {
      session: result1.session,
      q: 'Debug Test',
      limit: 10
    });
    console.log('Search result:', searchResult);

    // タスクを取得
    try {
      const taskResult = await rpc(ws, 'get_task', {
        session: result1.session,
        id: 'T-DEBUG-1'
      });
      console.log('Task result:', taskResult);
    } catch (error) {
      console.log('Get task error:', error);
    }

    // Issuesを検索
    const issuesResult = await rpc(ws, 'search_issues', {
      session: result1.session,
      q: 'Test',
      limit: 10
    });
    console.log('Issues result:', issuesResult);

  } catch (error) {
    console.log('Error:', error);
  } finally {
    ws.close();
  }
}

runTest();