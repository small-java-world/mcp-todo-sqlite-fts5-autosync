import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import WebSocket from 'ws';
import net from 'net';
import path from 'path';

const PORT = 9876;
const TOKEN = 'testtoken';

function waitPort(port: number, timeoutMs=8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      const sock = net.createConnection({ host:'127.0.0.1', port }, () => {
        sock.end(); resolve();
      });
      sock.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('port timeout'));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

describe('MCP server integration', () => {
  let child: any;
  beforeAll(async () => {
    child = spawn(process.execPath, ['dist/server.js'], {
      env: { ...process.env, PORT: String(PORT), MCP_TOKEN: TOKEN },
      stdio: 'inherit',
      cwd: path.resolve('.')
    });
    await waitPort(PORT, 10000);
  }, 15000);

  afterAll(async () => {
    if (child && !child.killed) child.kill();
  });

  it('register/upsert/search/get', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    let sessionId = null;
    const call = (id: number, method: string, params: any) => {
      if (sessionId && method !== 'register') {
        params.session = sessionId;
      }
      ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
    };

    const recv = (): Promise<any> => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

    await new Promise<void>(r => ws.on('open', () => r()));

    call(1, 'register', { worker_id:'it', authToken: TOKEN });
    let r = await recv();
    expect(r.result?.ok).toBe(true);
    sessionId = r.result?.session;

    call(2, 'upsert_task', { id:'IT-1', title:'it test', text:'alpha beta gamma' });
    r = await recv();
    console.log('upsert_task response:', JSON.stringify(r, null, 2));
    expect(r.result?.vclock).toBeGreaterThan(0);

    call(3, 'search', { q:'beta', highlight:true });
    r = await recv();
    expect(r.result?.hits?.length).toBeGreaterThan(0);

    call(4, 'get_task', { id:'IT-1' });
    r = await recv();
    expect(r.result?.task?.id).toBe('IT-1');

    ws.close();
  }, 15000);
});
