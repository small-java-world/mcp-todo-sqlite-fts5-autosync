import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import net from 'net';
import path from 'path';

const PORT = 9878;
const TOKEN = 'testtoken-errors';

function waitPort(port: number, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
        sock.end();
        resolve();
      });
      sock.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('port timeout'));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

describe('MCP Error Handling Integration Tests', () => {
  let child: ChildProcess;

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

  describe('speckit.run error handling', () => {
    it('should handle malformed params', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      // Missing cmd parameter
      call(1, 'speckit.run', {});
      let r = await recv();
      expect(r.error).toBeDefined();

      // Invalid cmd format
      call(2, 'speckit.run', { cmd: 'invalid' });
      r = await recv();
      expect(r.error).toBeDefined();

      // Null cmd
      call(3, 'speckit.run', { cmd: null });
      r = await recv();
      expect(r.error).toBeDefined();

      ws.close();
    }, 10000);

    it('should handle unknown speckit commands gracefully', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'speckit.run', { cmd: '/speckit.unknown' });
      const r = await recv();

      expect(r.result?.ok).toBe(false);
      expect(r.result?.note).toBe('not-implemented');

      ws.close();
    }, 10000);
  });

  describe('tdd.scaffold error handling', () => {
    it('should handle missing task_id parameter', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      // Should use default task_id
      call(1, 'tdd.scaffold', {});
      const r = await recv();

      expect(r.result?.ok).toBe(true);
      expect(r.result?.generated[0]).toContain('TASK-UNKNOWN');

      ws.close();
    }, 10000);

    it('should sanitize dangerous task_id characters', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      const dangerousIds = [
        '../../../etc/passwd',
        'task<script>alert(1)</script>',
        'task|rm -rf /',
        'task; DROP TABLE tasks;'
      ];

      for (let i = 0; i < dangerousIds.length; i++) {
        call(i + 1, 'tdd.scaffold', { task_id: dangerousIds[i] });
        const r = await recv();

        expect(r.result?.ok).toBe(true);
        // Should not contain dangerous characters
        expect(r.result?.generated[0]).not.toContain('/');
        expect(r.result?.generated[0]).not.toContain('<');
        expect(r.result?.generated[0]).not.toContain('>');
        expect(r.result?.generated[0]).not.toContain('|');
        expect(r.result?.generated[0]).not.toContain(';');
      }

      ws.close();
    }, 10000);
  });

  describe('tdd.phase.set error handling', () => {
    it('should reject invalid phase values', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      const invalidPhases = ['invalid', 'RED', 'Green', 'done', '', null, undefined, 123];

      for (let i = 0; i < invalidPhases.length; i++) {
        call(i + 1, 'tdd.phase.set', { phase: invalidPhases[i] });
        const r = await recv();
        expect(r.error).toBeDefined();
        expect(r.error.message).toContain('invalid phase');
      }

      ws.close();
    }, 10000);

    it('should only accept exact phase names', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      // Test case sensitivity
      const wrongCasePhases = ['Red', 'GREEN', 'Refactor', 'VERIFY'];

      for (let i = 0; i < wrongCasePhases.length; i++) {
        call(i + 1, 'tdd.phase.set', { phase: wrongCasePhases[i] });
        const r = await recv();
        expect(r.error).toBeDefined();
      }

      ws.close();
    }, 10000);
  });

  describe('todo.materialize error handling', () => {
    it('should reject missing tasklet_id', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'todo.materialize', {});
      const r = await recv();

      expect(r.error).toBeDefined();
      expect(r.error.message).toContain('tasklet_id required');

      ws.close();
    }, 10000);

    it('should reject empty tasklet_id', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'todo.materialize', { tasklet_id: '' });
      const r = await recv();

      expect(r.error).toBeDefined();
      expect(r.error.message).toContain('tasklet_id required');

      ws.close();
    }, 10000);

    it('should reject null tasklet_id', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'todo.materialize', { tasklet_id: null });
      const r = await recv();

      expect(r.error).toBeDefined();
      expect(r.error.message).toContain('tasklet_id required');

      ws.close();
    }, 10000);
  });

  describe('General error handling', () => {
    it('should return method_not_found for unknown methods', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'unknown.method', {});
      const r = await recv();

      expect(r.error).toBeDefined();
      expect(r.error.code).toBe(-32601);
      expect(r.error.message).toBe('method_not_found');

      ws.close();
    }, 10000);

    it('should handle malformed JSON-RPC messages', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      // Send invalid JSON
      ws.send('not valid json');
      const r1 = await recv();
      expect(r1.error?.code).toBe(-32700);

      // Send missing method
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1 }));
      const r2 = await recv();
      expect(r2.error?.code).toBe(-32600);

      ws.close();
    }, 10000);
  });
});
