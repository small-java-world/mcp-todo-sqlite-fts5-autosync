import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import WebSocket from 'ws';
import path from 'path';
import fs from 'fs';

describe('todo.watch Integration Tests', () => {
  let serverProc: any;
  let port: number;
  const testDbDir = path.join(process.cwd(), '.test-output', `watch-test-${Date.now()}`);
  const testDbPath = path.join(testDbDir, 'todo.db');

  beforeAll(async () => {
    // Create test database directory
    fs.mkdirSync(testDbDir, { recursive: true });

    // Find available port
    port = 19000 + Math.floor(Math.random() * 1000);

    // Start server
    serverProc = spawn('node', ['dist/server.js'], {
      env: {
        ...process.env,
        PORT: String(port),
        DB_FILE: 'todo.db',
        DATA_DIR: testDbDir,
        MCP_TOKEN: 'test-token',
        AUTO_EXPORT_ON_EXIT: '0'
      },
      stdio: 'pipe'
    });

    // Wait for server to start
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('open', () => {
          ws.close();
          clearInterval(checkInterval);
          resolve();
        });
        ws.on('error', () => {
          // Server not ready yet
        });
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10000);
    });
  }, 15000);

  afterAll(async () => {
    if (serverProc) {
      serverProc.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Cleanup test database
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  async function sendRequest(ws: WebSocket, method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = Date.now();
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params: { ...params, authToken: 'test-token' } });

      const handler = (data: Buffer) => {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          ws.removeListener('message', handler);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        }
      };

      ws.on('message', handler);
      ws.send(msg);

      setTimeout(() => {
        ws.removeListener('message', handler);
        reject(new Error('Request timeout'));
      }, 5000);
    });
  }

  it('should subscribe to watch and receive change events', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise((resolve) => ws.on('open', resolve));

    // Subscribe to watch
    const watchResult = await sendRequest(ws, 'todo.watch');
    expect(watchResult.ok).toBe(true);
    expect(watchResult.watching).toBe(true);

    // Collect change events
    const changeEvents: any[] = [];
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'todo.change') {
        changeEvents.push(msg.params);
      }
    });

    // Create a task
    await sendRequest(ws, 'upsert_task', {
      id: 'T-WATCH-001',
      title: 'Test Task',
      text: 'Test content'
    });

    // Wait for change event
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify change event was received
    expect(changeEvents.length).toBeGreaterThan(0);
    const taskChange = changeEvents.find(e => e.entity === 'task' && e.id === 'T-WATCH-001');
    expect(taskChange).toBeDefined();
    expect(taskChange.op).toBe('upsert');
    expect(taskChange.data).toBeDefined();
    expect(taskChange.data.title).toBe('Test Task');

    ws.close();
  }, 10000);

  it('should filter watch events by entity type', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise((resolve) => ws.on('open', resolve));

    // Subscribe to watch with filter for intents only
    const watchResult = await sendRequest(ws, 'todo.watch', {
      filters: { entity: 'intent' }
    });
    expect(watchResult.ok).toBe(true);

    // Collect change events
    const changeEvents: any[] = [];
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'todo.change') {
        changeEvents.push(msg.params);
      }
    });

    // Create a task (should not receive event)
    await sendRequest(ws, 'upsert_task', {
      id: 'T-WATCH-002',
      title: 'Test Task 2',
      text: 'Test content 2'
    });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should not receive task change event
    expect(changeEvents.length).toBe(0);

    ws.close();
  }, 10000);

  it('should unsubscribe from watch', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise((resolve) => ws.on('open', resolve));

    // Subscribe to watch
    await sendRequest(ws, 'todo.watch');

    // Unsubscribe
    const unwatchResult = await sendRequest(ws, 'todo.unwatch');
    expect(unwatchResult.ok).toBe(true);
    expect(unwatchResult.watching).toBe(false);

    // Collect change events
    const changeEvents: any[] = [];
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'todo.change') {
        changeEvents.push(msg.params);
      }
    });

    // Create a task (should not receive event after unsubscribe)
    await sendRequest(ws, 'upsert_task', {
      id: 'T-WATCH-003',
      title: 'Test Task 3',
      text: 'Test content 3'
    });

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should not receive change event
    expect(changeEvents.length).toBe(0);

    ws.close();
  }, 10000);

  it('should receive change events for multiple operations', async () => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise((resolve) => ws.on('open', resolve));

    // Subscribe to watch
    await sendRequest(ws, 'todo.watch');

    // Collect change events
    const changeEvents: any[] = [];
    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'todo.change') {
        changeEvents.push(msg.params);
      }
    });

    // Perform multiple operations
    await sendRequest(ws, 'upsert_task', {
      id: 'T-WATCH-004',
      title: 'Test Task 4',
      text: 'Test content 4'
    });

    await sendRequest(ws, 'mark_done', {
      id: 'T-WATCH-004',
      done: true
    });

    // Wait for change events
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify both change events were received
    expect(changeEvents.length).toBeGreaterThanOrEqual(2);

    const upsertEvent = changeEvents.find(e => e.op === 'upsert' && e.id === 'T-WATCH-004');
    expect(upsertEvent).toBeDefined();

    const markDoneEvent = changeEvents.find(e => e.op === 'mark_done' && e.id === 'T-WATCH-004');
    expect(markDoneEvent).toBeDefined();
    expect(markDoneEvent.data.done).toBe(1);

    ws.close();
  }, 10000);

  it('should handle multiple simultaneous watchers', async () => {
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);

    await Promise.all([
      new Promise((resolve) => ws1.on('open', resolve)),
      new Promise((resolve) => ws2.on('open', resolve))
    ]);

    // Subscribe both connections
    await sendRequest(ws1, 'todo.watch');
    await sendRequest(ws2, 'todo.watch');

    // Collect change events for both connections
    const events1: any[] = [];
    const events2: any[] = [];

    ws1.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'todo.change') {
        events1.push(msg.params);
      }
    });

    ws2.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'todo.change') {
        events2.push(msg.params);
      }
    });

    // Create a task from first connection
    await sendRequest(ws1, 'upsert_task', {
      id: 'T-WATCH-005',
      title: 'Test Task 5',
      text: 'Test content 5'
    });

    // Wait for change events
    await new Promise(resolve => setTimeout(resolve, 500));

    // Both connections should receive the change event
    expect(events1.length).toBeGreaterThan(0);
    expect(events2.length).toBeGreaterThan(0);

    const event1 = events1.find(e => e.id === 'T-WATCH-005');
    const event2 = events2.find(e => e.id === 'T-WATCH-005');

    expect(event1).toBeDefined();
    expect(event2).toBeDefined();

    ws1.close();
    ws2.close();
  }, 10000);
});
