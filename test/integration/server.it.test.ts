import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import WebSocket from 'ws';
import net from 'net';
import path from 'path';
import crypto from 'crypto';

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

  it('handles task lifecycle, metadata, archiving, and blob validation', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    let sessionId: string | null = null;
    const primaryId = `IT-${Date.now()}`;
    const metaId = `${primaryId}-meta`;
    const call = (id: number, method: string, params: any = {}) => {
      if (sessionId && method !== 'register') {
        params.session = sessionId;
      }
      ws.send(JSON.stringify({ jsonrpc:'2.0', id, method, params }));
    };

    const recv = (): Promise<any> => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    call(1, 'register', { worker_id:'it', authToken: TOKEN });
    let r = await recv();
    expect(r.result?.ok).toBe(true);
    sessionId = r.result?.session;

    call(2, 'upsert_task', { id:primaryId, title:'it test', text:'alpha beta gamma' });
    r = await recv();
    expect(r.result?.vclock).toBeGreaterThan(0);

    call(3, 'search', { q:'beta', highlight:true });
    r = await recv();
    expect(r.result?.hits?.some((hit: any) => hit.id === primaryId)).toBe(true);

    call(4, 'get_task', { id:primaryId });
    r = await recv();
    expect(r.result?.task?.id).toBe(primaryId);

    call(5, 'upsert_task', { id:metaId, title:'meta task', text:'payload', meta:{ tag:'keep' } });
    r = await recv();
    expect(r.result?.vclock).toBeGreaterThan(0);

    call(6, 'get_task', { id:metaId });
    r = await recv();
    expect(r.result?.task?.meta).toBe(JSON.stringify({ tag:'keep' }));

    call(7, 'upsert_task', { id:metaId, title:'meta task updated', text:'payload updated' });
    r = await recv();
    expect(r.result?.vclock).toBeGreaterThan(1);

    call(8, 'get_task', { id:metaId });
    r = await recv();
    expect(r.result?.task?.meta).toBe(JSON.stringify({ tag:'keep' }));

    call(9, 'archive_task', { id:primaryId, reason:'done' });
    r = await recv();
    expect(r.result?.ok).toBe(true);

    call(10, 'search', { q:'beta', highlight:false });
    r = await recv();
    expect(r.result?.hits?.some((hit: any) => hit.id === primaryId)).toBe(false);

    call(11, 'list_recent', {});
    r = await recv();
    expect(r.result?.items?.some((hit: any) => hit.id === primaryId)).toBe(false);

    const bytes = Buffer.from('blob-payload');
    const wrongSha = crypto.createHash('sha256').update('different').digest('hex');
    call(12, 'attach_blob', { id:metaId, bytes_base64: bytes.toString('base64'), sha256: wrongSha });
    r = await recv();
    expect(r.error?.code).toBe(400);

    ws.close();
  }, 20000);
});

