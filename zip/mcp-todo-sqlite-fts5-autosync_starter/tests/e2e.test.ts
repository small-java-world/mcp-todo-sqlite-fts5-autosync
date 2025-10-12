
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';

const TOKEN = 'devtoken';

function rpc(ws: WebSocket, method: string, params?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id === id) {
          ws.off('message', onMsg);
          if (msg.error) reject(new Error(`${msg.error.code}:${msg.error.message}`));
          else resolve(msg.result);
        }
      } catch (e) { reject(e); }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
  });
}

describe('E2E basic flow', () => {
  let proc: any;
  let ws: WebSocket;

  beforeAll(async () => {
    proc = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['dev'], {
      cwd: path.join(process.cwd()),
      env: { ...process.env, MCP_TOKEN: TOKEN, PORT: '8787', DATA_DIR: './data' },
      stdio: 'ignore'
    });
    await new Promise(r => setTimeout(r, 1500));
    ws = new WebSocket('ws://127.0.0.1:8787');
    await new Promise(res => ws.on('open', res));
    await rpc(ws, 'register', { token: TOKEN });
  }, 60000);

  afterAll(async () => {
    try { ws.close(); } catch {}
    try { proc.kill(); } catch {}
  });

  it('should upsert, search, archive, restore, and attach blob', async () => {
    const id = 'task-1';
    const now = Date.now();
    await rpc(ws, 'upsert_task', { task: { id, title: 'Hello FTS', body: 'body text', created_at: now, updated_at: now, state: 'open', priority: 1, vclock: 0 } });
    const s = await rpc(ws, 'search', { q: 'Hello', limit: 10 });
    expect(s.rows.find((r:any)=>r.id===id)).toBeTruthy();

    // conflict patch
    let caught: any = null;
    try { await rpc(ws, 'patch_task', { id, operations: [{op:'set', path:'/title', value:'Hello World'}], if_vclock: 0 }); }
    catch (e:any) { caught = String(e); }
    expect(String(caught)).toMatch(/40901/);

    // attach blob (correct sha)
    const buf = Buffer.from('hi');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const ok = await rpc(ws, 'attach_blob', { taskId: id, base64: buf.toString('base64'), sha256: sha });
    expect(ok.ok).toBe(true);

    // archive -> restore
    await rpc(ws, 'archive_task', { id });
    await rpc(ws, 'restore_task', { id });
  }, 60000);
});
