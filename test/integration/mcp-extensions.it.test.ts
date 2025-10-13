import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import WebSocket from 'ws';
import net from 'net';
import path from 'path';
import fs from 'fs';

const PORT = 9877;
const TOKEN = 'testtoken-mcp-ext';

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

describe('MCP Extensions Integration Tests', () => {
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

    // Cleanup test artifacts
    const cleanupDirs = [
      '.specify',
      'tests/unit',
      'data',
      'tasklets',
      'reports'
    ];
    for (const dir of cleanupDirs) {
      const fullPath = path.join(process.cwd(), dir);
      if (fs.existsSync(fullPath)) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    }
  });

  describe('speckit.run endpoint', () => {
    it('should generate tasks.md file via /speckit.tasks', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'speckit.run', { cmd: '/speckit.tasks' });
      const r = await recv();

      expect(r.result?.ok).toBe(true);
      expect(r.result?.generated).toBeDefined();
      expect(r.result?.generated).toContain('.specify');
      expect(r.result?.generated).toContain('tasks.md');

      // Verify file exists
      expect(fs.existsSync(r.result.generated)).toBe(true);

      ws.close();
    }, 10000);

    it('should reject invalid command format', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'speckit.run', { cmd: '/invalid' });
      const r = await recv();

      expect(r.error).toBeDefined();
      expect(r.error.message).toContain('speckit.');

      ws.close();
    }, 10000);
  });

  describe('tdd.scaffold endpoint', () => {
    it('should generate scaffold file for task', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      const taskId = `T-IT-${Date.now()}`;
      call(1, 'tdd.scaffold', { task_id: taskId });
      const r = await recv();

      expect(r.result?.ok).toBe(true);
      expect(r.result?.generated).toBeDefined();
      expect(r.result.generated.length).toBeGreaterThan(0);
      expect(r.result.generated[0]).toContain(taskId.replace(/[^A-Za-z0-9_-]/g, '_'));

      ws.close();
    }, 10000);
  });

  describe('tdd.phase.set endpoint', () => {
    it('should set TDD phase to red', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'tdd.phase.set', { phase: 'red' });
      const r = await recv();

      expect(r.result?.ok).toBe(true);
      expect(r.result?.phase).toBe('red');

      ws.close();
    }, 10000);

    it('should reject invalid phase', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'tdd.phase.set', { phase: 'invalid' });
      const r = await recv();

      expect(r.error).toBeDefined();
      expect(r.error.message).toContain('invalid phase');

      ws.close();
    }, 10000);

    it('should cycle through all valid phases', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      const phases = ['red', 'green', 'refactor', 'verify'];
      for (let i = 0; i < phases.length; i++) {
        call(i + 1, 'tdd.phase.set', { phase: phases[i] });
        const r = await recv();
        expect(r.result?.phase).toBe(phases[i]);
      }

      ws.close();
    }, 10000);
  });

  describe('tdd.captureResults endpoint', () => {
    it('should capture test results from reports', async () => {
      // Create some dummy reports
      const reportsDir = path.join(process.cwd(), 'reports', 'unit');
      fs.mkdirSync(reportsDir, { recursive: true });
      fs.writeFileSync(
        path.join(reportsDir, 'dummy.xml'),
        '<testsuite name="test" tests="1"/>',
        'utf8'
      );

      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'tdd.captureResults', {});
      const r = await recv();

      expect(r.result?.ok).toBe(true);
      expect(r.result?.summaries).toBeDefined();
      expect(Array.isArray(r.result.summaries)).toBe(true);

      ws.close();
    }, 10000);
  });

  describe('todo.decompose endpoint', () => {
    it('should decompose TODO file into tasklets', async () => {
      // Create a test TODO file
      const todoPath = path.join(process.cwd(), 'TODO-it-test.md');
      fs.writeFileSync(
        todoPath,
        `# TODO\n- Test task 1\n- Test task 2\n- Test task 3\n`,
        'utf8'
      );

      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'todo.decompose', { from: 'TODO-it-test.md' });
      const r = await recv();

      expect(r.result?.ok).toBe(true);
      expect(r.result?.emits).toBeDefined();
      expect(r.result.emits.length).toBe(3);

      // Cleanup
      fs.unlinkSync(todoPath);
      ws.close();
    }, 10000);
  });

  describe('todo.materialize endpoint', () => {
    it('should materialize tasklet to branch', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      await new Promise<void>((resolve) => ws.on('open', () => resolve()));

      const call = (id: number, method: string, params: any = {}) => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      };

      const recv = (): Promise<any> =>
        new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

      call(1, 'todo.materialize', { tasklet_id: 'TL-IT-001' });
      const r = await recv();

      expect(r.result?.ok).toBe(true);
      expect(r.result?.branch).toBe('feature/TL-IT-001');

      ws.close();
    }, 10000);

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
  });
});
