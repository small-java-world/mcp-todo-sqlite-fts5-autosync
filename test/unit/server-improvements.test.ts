import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('Server Improvements', () => {
  let db: DB;
  const tmpDir = 'data/test-server';
  const dbFile = 'test-server.db';
  const casDir = path.join(tmpDir, 'cas');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(casDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
  });

  afterEach(() => {
    try {
      db.close();
    } catch (e) {
      // Ignore close errors
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Change Feed Integration', () => {
    it('should insert change when creating task', () => {
      const now = Date.now();
      const taskId = 'T-CHANGE-1';
      
      // タスクを作成
      db.upsertTask(taskId, 'Test Task', 'Test content', null, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });

      // 変更フィードを確認
      const changes = db.pollChanges(0, 10);
      expect(changes.length).toBeGreaterThan(0);
      
      const taskChange = changes.find(c => c.entity === 'task' && c.id === taskId);
      expect(taskChange).toBeDefined();
      expect(taskChange?.op).toBe('insert');
    });

    it('should insert change when updating task', () => {
      const now = Date.now();
      const taskId = 'T-CHANGE-2';
      
      // タスクを作成
      db.upsertTask(taskId, 'Test Task', 'Test content', null, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });

      // タスクを更新
      db.upsertTask(taskId, 'Updated Task', 'Updated content', null, 1, {
        parent_id: null,
        level: 2,
        state: 'IN_PROGRESS',
        assignee: null,
        due_at: null
      });

      // 変更フィードを確認
      const changes = db.pollChanges(0, 10);
      const taskChanges = changes.filter(c => c.entity === 'task' && c.id === taskId);
      expect(taskChanges.length).toBeGreaterThanOrEqual(2);
      
      const updateChange = taskChanges.find(c => c.op === 'update');
      expect(updateChange).toBeDefined();
    });

    it('should poll changes with since parameter', () => {
      const now = Date.now();
      const taskId = 'T-CHANGE-3';
      
      // タスクを作成
      db.upsertTask(taskId, 'Test Task', 'Test content', null, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });

      // 最初の変更を取得
      const initialChanges = db.pollChanges(0, 10);
      expect(initialChanges.length).toBeGreaterThan(0);
      
      const lastSeq = initialChanges[initialChanges.length - 1].seq;
      
      // 新しいタスクを作成
      db.upsertTask('T-CHANGE-4', 'Another Task', 'Another content', null, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });

      // sinceパラメータで新しい変更のみを取得
      const newChanges = db.pollChanges(lastSeq, 10);
      expect(newChanges.length).toBeGreaterThan(0);
      expect(newChanges.every(c => c.seq > lastSeq)).toBe(true);
    });
  });

  describe('Blob Management', () => {
    it('should store blob with SHA-256 hash', () => {
      const content = 'Hello, World!';
      const sha256 = 'a'.repeat(64); // テスト用のハッシュ
      const now = Date.now();
      
      // Blobを挿入
      db.db.prepare(`
        INSERT INTO blobs (sha256, bytes, created_at) 
        VALUES (?, ?, ?)
      `).run(sha256, content.length, now);

      // Blobを確認
      const blob = db.db.prepare('SELECT * FROM blobs WHERE sha256 = ?').get(sha256);
      expect(blob).toBeDefined();
      expect(blob.bytes).toBe(content.length);
    });

    it('should link blob to task', () => {
      const taskId = 'T-BLOB-1';
      const sha256 = 'a'.repeat(64);
      const now = Date.now();
      
      // タスクを作成
      db.upsertTask(taskId, 'Test Task', 'Test content', null, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });
      
      // Blobを作成
      db.db.prepare(`
        INSERT INTO blobs (sha256, bytes, created_at) 
        VALUES (?, ?, ?)
      `).run(sha256, 1024, now);
      
      // リンクを作成
      db.db.prepare(`
        INSERT INTO task_blobs (task_id, sha256) 
        VALUES (?, ?)
      `).run(taskId, sha256);

      // リンクを確認
      const link = db.db.prepare(`
        SELECT * FROM task_blobs 
        WHERE task_id = ? AND sha256 = ?
      `).get(taskId, sha256);
      
      expect(link).toBeDefined();
    });

    it('should handle blob conflicts gracefully', () => {
      const sha256 = 'a'.repeat(64);
      const now = Date.now();
      
      // 最初のBlobを挿入
      db.db.prepare(`
        INSERT INTO blobs (sha256, bytes, created_at) 
        VALUES (?, ?, ?)
      `).run(sha256, 1024, now);
      
      // 同じSHA256で再度挿入を試行（ON CONFLICT DO NOTHING）
      const result = db.db.prepare(`
        INSERT INTO blobs (sha256, bytes, created_at) 
        VALUES (?, ?, ?)
        ON CONFLICT(sha256) DO NOTHING
      `).run(sha256, 2048, now + 1000);
      
      // 変更されていないことを確認
      expect(result.changes).toBe(0);
    });
  });

  describe('FTS5 Integration', () => {
    it('should search tasks using FTS5', () => {
      const now = Date.now();
      
      // 複数のタスクを作成
      db.upsertTask('T-FTS-1', 'Database Performance', 'Optimize queries', null, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });
      
      db.upsertTask('T-FTS-2', 'API Documentation', 'Write API docs', null, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });

      // FTS5で検索
      const results = db.db.prepare(`
        SELECT t.*, bm25(tasks_fts) AS score
        FROM tasks_fts
        JOIN tasks t ON t.rowid = tasks_fts.rowid
        WHERE tasks_fts MATCH 'Database'
        ORDER BY score
      `).all();

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('Database');
    });

    it('should include meta in FTS search', () => {
      const now = Date.now();
      const meta = { tags: ['performance', 'database'], priority: 'high' };
      
      // メタデータ付きのタスクを作成
      db.upsertTask('T-FTS-META-1', 'Database Task', 'Optimize database', meta, null, {
        parent_id: null,
        level: 2,
        state: 'DRAFT',
        assignee: null,
        due_at: null
      });

      // メタデータで検索
      const results = db.db.prepare(`
        SELECT t.*, bm25(tasks_fts) AS score
        FROM tasks_fts
        JOIN tasks t ON t.rowid = tasks_fts.rowid
        WHERE tasks_fts MATCH 'performance'
        ORDER BY score
      `).all();

      expect(results.length).toBeGreaterThan(0);
    });
  });
});
