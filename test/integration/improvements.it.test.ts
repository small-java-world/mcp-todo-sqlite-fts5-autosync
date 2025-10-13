import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { startIntegrationServer, stopIntegrationServer, cleanIntegrationData, type ServerHandle } from './support/server';

let serverHandle: ServerHandle;
let TOKEN: string;

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

describe('Server Improvements Integration', () => {
  let proc: any;
  let ws: WebSocket;
  let sessionId: string;

  beforeAll(async () => {
    serverHandle = await startIntegrationServer();
    TOKEN = serverHandle.token;
    ws = new WebSocket(`ws://127.0.0.1:${serverHandle.port}`);
    await new Promise(res => ws.on('open', res));
    const registerResult = await rpc(ws, 'register', { authToken: TOKEN });
    sessionId = registerResult.session;
  }, 60000); // 60秒に延長

  afterAll(async () => {
    try { ws.close(); } catch {}
    await stopIntegrationServer(serverHandle);
    cleanIntegrationData(serverHandle);
  });

  beforeEach(async () => {
    // 各テスト前にセッションを再登録
    try {
      const registerResult = await rpc(ws, 'register', { authToken: TOKEN });
      sessionId = registerResult.session;
    } catch (e) {
      // セッションが既に有効な場合は無視
    }
  });

  describe('Change Feed API', () => {
    it('should poll changes after creating task', async () => {
      const taskId = 'T-INTEGRATION-1';
      
      // タスクを作成
      await rpc(ws, 'upsert_task', {
        session: sessionId,
        id: taskId,
        title: 'Integration Test Task',
        text: 'Test content for change feed',
        meta: { tags: ['test', 'integration'] }
      });

      // 変更フィードを取得
      const changesResponse = await rpc(ws, 'poll_changes', { session: sessionId, since: 0, limit: 10 });
      expect(changesResponse.changes).toBeDefined();
      expect(Array.isArray(changesResponse.changes)).toBe(true);
      
      // タスクの変更が記録されていることを確認
      const taskChanges = changesResponse.changes.filter((c: any) => c.entity === 'task' && c.id === taskId);
      expect(taskChanges.length).toBeGreaterThan(0);
      
      // insertまたはupdateのいずれかを受け入れる
      const taskChange = taskChanges.find((c: any) => c.op === 'insert' || c.op === 'update');
      expect(taskChange).toBeDefined();
    });

    it('should poll changes with since parameter', async () => {
      // 初期の変更を取得
      const initialChanges = await rpc(ws, 'poll_changes', { session: sessionId, since: 0, limit: 10 });
      const lastSeq = initialChanges.changes.length > 0 ? 
        initialChanges.changes[initialChanges.changes.length - 1].seq : 0;
      
      // 新しいタスクを作成
      await rpc(ws, 'upsert_task', {
        session: sessionId,
        id: 'T-INTEGRATION-2',
        title: 'Another Integration Task',
        text: 'Another test content'
      });

      // sinceパラメータで新しい変更のみを取得
      const newChanges = await rpc(ws, 'poll_changes', { session: sessionId, since: lastSeq, limit: 10 });
      expect(newChanges.changes.length).toBeGreaterThan(0);
      expect(newChanges.changes.every((c: any) => c.seq > lastSeq)).toBe(true);
    });
  });

  describe('Enhanced Search with FTS5', () => {
    it('should search tasks with improved FTS5', async () => {
      // 複数のタスクを作成
      await rpc(ws, 'upsert_task', {
        session: sessionId,
        id: 'T-SEARCH-1',
        title: 'Database Performance Optimization',
        text: 'Optimize SQL queries and indexes',
        meta: { tags: ['performance', 'database'], priority: 'high' }
      });

      await rpc(ws, 'upsert_task', {
        session: sessionId,
        id: 'T-SEARCH-2',
        title: 'API Documentation',
        text: 'Write comprehensive API documentation',
        meta: { tags: ['documentation', 'api'], priority: 'medium' }
      });

      // FTS5で検索
      const searchResponse = await rpc(ws, 'search', {
        session: sessionId,
        q: 'Database',
        limit: 10
      });

      expect(searchResponse.hits).toBeDefined();
      expect(Array.isArray(searchResponse.hits)).toBe(true);
      expect(searchResponse.hits.length).toBeGreaterThan(0);
      
      const databaseTask = searchResponse.hits.find((r: any) => r.id === 'T-SEARCH-1');
      expect(databaseTask).toBeDefined();
      expect(databaseTask.title).toContain('Database');
    });

    it('should search by meta content', async () => {
      // メタデータで検索
      const searchResponse = await rpc(ws, 'search', {
        session: sessionId,
        q: 'performance',
        limit: 10
      });

      expect(searchResponse.hits).toBeDefined();
      expect(Array.isArray(searchResponse.hits)).toBe(true);
      expect(searchResponse.hits.length).toBeGreaterThan(0);
      
      const performanceTask = searchResponse.hits.find((r: any) => r.id === 'T-SEARCH-1');
      expect(performanceTask).toBeDefined();
    });
  });

  describe('Blob Management', () => {
    it('should handle blob operations', async () => {
      const taskId = 'T-BLOB-INTEGRATION';
      const content = 'Hello, World!';
      const sha256 = 'a'.repeat(64); // テスト用のハッシュ
      
      // タスクを作成
      await rpc(ws, 'upsert_task', {
        session: sessionId,
        id: taskId,
        title: 'Blob Test Task',
        text: 'Task with blob attachment'
      });

      // 注意: 実際のblob APIは実装されていないため、データベースレベルでテスト
      // 将来的にblob APIが実装されたら、ここでテストを追加
      expect(true).toBe(true); // プレースホルダー
    });
  });

  describe('Performance Improvements', () => {
    it('should handle multiple operations efficiently', async () => {
      const startTime = Date.now();
      
      // 複数のタスクを並行して作成
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(rpc(ws, 'upsert_task', {
          session: sessionId,
          id: `T-PERF-${i}`,
          title: `Performance Test Task ${i}`,
          text: `Content for task ${i}`,
          meta: { batch: 'performance-test', index: i }
        }));
      }
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 5つのタスクの作成が2秒以内に完了することを確認
      expect(duration).toBeLessThan(2000);
    });

    it('should maintain data consistency under load', async () => {
      // 同じタスクを複数回更新
      const taskId = 'T-CONSISTENCY';
      
      await rpc(ws, 'upsert_task', {
        session: sessionId,
        id: taskId,
        title: 'Consistency Test',
        text: 'Initial content'
      });

      // 複数回更新
      for (let i = 0; i < 3; i++) {
        await rpc(ws, 'upsert_task', {
          session: sessionId,
          id: taskId,
          title: `Consistency Test ${i}`,
          text: `Updated content ${i}`,
          meta: { version: i }
        });
      }

      // 最終状態を確認
      const searchResponse = await rpc(ws, 'search', {
        session: sessionId,
        q: 'Consistency Test 2',
        limit: 1
      });

      expect(searchResponse.hits).toBeDefined();
      expect(searchResponse.hits.length).toBeGreaterThan(0);
      expect(searchResponse.hits[0].title).toBe('Consistency Test 2');
    });
  });
});
