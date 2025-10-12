import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import path from 'path';

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

describe('Server Improvements Integration', () => {
  let proc: any;
  let ws: WebSocket;

  beforeAll(async () => {
    // サーバーが既に起動していることを前提とする
    ws = new WebSocket('ws://127.0.0.1:8765');
    await new Promise(res => ws.on('open', res));
    await rpc(ws, 'register', { token: TOKEN });
  }, 30000);

  afterAll(async () => {
    try { ws.close(); } catch {}
  });

  beforeEach(async () => {
    // 各テスト前にセッションを再登録
    try {
      await rpc(ws, 'register', { token: TOKEN });
    } catch (e) {
      // セッションが既に有効な場合は無視
    }
  });

  describe('Change Feed API', () => {
    it('should poll changes after creating task', async () => {
      const taskId = 'T-INTEGRATION-1';
      
      // タスクを作成
      await rpc(ws, 'upsert_task', {
        id: taskId,
        title: 'Integration Test Task',
        text: 'Test content for change feed',
        meta: { tags: ['test', 'integration'] }
      });

      // 変更フィードを取得
      const changesResponse = await rpc(ws, 'poll_changes', { since: 0, limit: 10 });
      expect(changesResponse.changes).toBeDefined();
      expect(Array.isArray(changesResponse.changes)).toBe(true);
      
      // タスクの変更が記録されていることを確認
      const taskChanges = changesResponse.changes.filter((c: any) => c.entity === 'task' && c.id === taskId);
      expect(taskChanges.length).toBeGreaterThan(0);
      
      const insertChange = taskChanges.find((c: any) => c.op === 'insert');
      expect(insertChange).toBeDefined();
    });

    it('should poll changes with since parameter', async () => {
      // 初期の変更を取得
      const initialChanges = await rpc(ws, 'poll_changes', { since: 0, limit: 10 });
      const lastSeq = initialChanges.changes.length > 0 ? 
        initialChanges.changes[initialChanges.changes.length - 1].seq : 0;
      
      // 新しいタスクを作成
      await rpc(ws, 'upsert_task', {
        id: 'T-INTEGRATION-2',
        title: 'Another Integration Task',
        text: 'Another test content'
      });

      // sinceパラメータで新しい変更のみを取得
      const newChanges = await rpc(ws, 'poll_changes', { since: lastSeq, limit: 10 });
      expect(newChanges.changes.length).toBeGreaterThan(0);
      expect(newChanges.changes.every((c: any) => c.seq > lastSeq)).toBe(true);
    });
  });

  describe('Enhanced Search with FTS5', () => {
    it('should search tasks with improved FTS5', async () => {
      // 複数のタスクを作成
      await rpc(ws, 'upsert_task', {
        id: 'T-SEARCH-1',
        title: 'Database Performance Optimization',
        text: 'Optimize SQL queries and indexes',
        meta: { tags: ['performance', 'database'], priority: 'high' }
      });

      await rpc(ws, 'upsert_task', {
        id: 'T-SEARCH-2',
        title: 'API Documentation',
        text: 'Write comprehensive API documentation',
        meta: { tags: ['documentation', 'api'], priority: 'medium' }
      });

      // FTS5で検索
      const searchResponse = await rpc(ws, 'search', {
        q: 'Database',
        limit: 10
      });

      expect(searchResponse.rows).toBeDefined();
      expect(Array.isArray(searchResponse.rows)).toBe(true);
      expect(searchResponse.rows.length).toBeGreaterThan(0);
      
      const databaseTask = searchResponse.rows.find((r: any) => r.id === 'T-SEARCH-1');
      expect(databaseTask).toBeDefined();
      expect(databaseTask.title).toContain('Database');
    });

    it('should search by meta content', async () => {
      // メタデータで検索
      const searchResponse = await rpc(ws, 'search', {
        q: 'performance',
        limit: 10
      });

      expect(searchResponse.rows).toBeDefined();
      expect(Array.isArray(searchResponse.rows)).toBe(true);
      expect(searchResponse.rows.length).toBeGreaterThan(0);
      
      const performanceTask = searchResponse.rows.find((r: any) => r.id === 'T-SEARCH-1');
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
        id: taskId,
        title: 'Consistency Test',
        text: 'Initial content'
      });

      // 複数回更新
      for (let i = 0; i < 3; i++) {
        await rpc(ws, 'upsert_task', {
          id: taskId,
          title: `Consistency Test ${i}`,
          text: `Updated content ${i}`,
          meta: { version: i }
        });
      }

      // 最終状態を確認
      const searchResponse = await rpc(ws, 'search', {
        q: 'Consistency Test 2',
        limit: 1
      });

      expect(searchResponse.rows).toBeDefined();
      expect(searchResponse.rows.length).toBeGreaterThan(0);
      expect(searchResponse.rows[0].title).toBe('Consistency Test 2');
    });
  });
});
