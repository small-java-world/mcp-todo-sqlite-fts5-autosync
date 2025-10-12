import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('Schema Improvements', () => {
  let db: DB;
  const tmpDir = 'data/test-schema';
  const dbFile = 'test-schema.db';
  const casDir = path.join(tmpDir, 'cas');

  beforeEach(() => {
    // テスト用ディレクトリを作成
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

  describe('Changes Table', () => {
    it('should create changes table for change feed', () => {
      // 変更フィードテーブルが存在することを確認
      const tables = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='changes'
      `).all();
      
      expect(tables).toHaveLength(1);
    });

    it('should insert change records', () => {
      const now = Date.now();
      const result = db.db.prepare(`
        INSERT INTO changes (ts, entity, id, op, vclock) 
        VALUES (?, ?, ?, ?, ?)
      `).run(now, 'task', 'T-1', 'insert', 1);

      expect(result.changes).toBe(1);
    });

    it('should query changes in order', () => {
      const now = Date.now();
      
      // 複数の変更を挿入
      db.db.prepare(`
        INSERT INTO changes (ts, entity, id, op, vclock) 
        VALUES (?, ?, ?, ?, ?)
      `).run(now, 'task', 'T-1', 'insert', 1);
      
      db.db.prepare(`
        INSERT INTO changes (ts, entity, id, op, vclock) 
        VALUES (?, ?, ?, ?, ?)
      `).run(now + 1000, 'task', 'T-1', 'update', 2);

      const changes = db.db.prepare(`
        SELECT * FROM changes ORDER BY seq ASC
      `).all();

      expect(changes).toHaveLength(2);
      expect(changes[0].op).toBe('insert');
      expect(changes[1].op).toBe('update');
    });
  });

  describe('Blobs Table', () => {
    it('should create blobs table for CAS', () => {
      const tables = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='blobs'
      `).all();
      
      expect(tables).toHaveLength(1);
    });

    it('should create task_blobs table for relationships', () => {
      const tables = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='task_blobs'
      `).all();
      
      expect(tables).toHaveLength(1);
    });

    it('should insert blob records', () => {
      const now = Date.now();
      const sha256 = 'a'.repeat(64);
      
      const result = db.db.prepare(`
        INSERT INTO blobs (sha256, bytes, created_at) 
        VALUES (?, ?, ?)
      `).run(sha256, 1024, now);

      expect(result.changes).toBe(1);
    });

    it('should link blobs to tasks', () => {
      const now = Date.now();
      const sha256 = 'a'.repeat(64);
      
      // タスクを作成
      db.db.prepare(`
        INSERT INTO tasks (id, title, text, created_at, updated_at, vclock) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('T-1', 'Test Task', 'Test content', now, now, 1);
      
      // Blobを作成
      db.db.prepare(`
        INSERT INTO blobs (sha256, bytes, created_at) 
        VALUES (?, ?, ?)
      `).run(sha256, 1024, now);
      
      // リンクを作成
      const result = db.db.prepare(`
        INSERT INTO task_blobs (task_id, sha256) 
        VALUES (?, ?)
      `).run('T-1', sha256);

      expect(result.changes).toBe(1);
    });
  });

  describe('FTS5 External Content', () => {
    it('should create tasks_fts virtual table', () => {
      const tables = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='tasks_fts'
      `).all();
      
      expect(tables).toHaveLength(1);
    });

    it('should create FTS sync triggers', () => {
      const triggers = db.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='trigger' AND name LIKE 'tasks_%'
      `).all();
      
      expect(triggers.length).toBeGreaterThanOrEqual(3);
      expect(triggers.some(t => t.name === 'tasks_ai')).toBe(true);
      expect(triggers.some(t => t.name === 'tasks_au')).toBe(true);
      expect(triggers.some(t => t.name === 'tasks_ad')).toBe(true);
    });

    it('should sync task changes to FTS', () => {
      const now = Date.now();
      
      // タスクを挿入
      db.db.prepare(`
        INSERT INTO tasks (id, title, text, created_at, updated_at, vclock) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('T-1', 'Test Task', 'Test content', now, now, 1);

      // FTSで検索
      const results = db.db.prepare(`
        SELECT * FROM tasks_fts WHERE tasks_fts MATCH 'Test'
      `).all();

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('T-1');
    });
  });

  describe('PRAGMA Settings', () => {
    it('should set journal_mode to WAL', () => {
      const result = db.db.prepare('PRAGMA journal_mode').get() as any;
      expect(result.journal_mode).toBe('wal');
    });

    it('should set synchronous to NORMAL', () => {
      const result = db.db.prepare('PRAGMA synchronous').get() as any;
      expect(result.synchronous).toBe(1); // NORMAL = 1
    });

    it('should enable foreign keys', () => {
      const result = db.db.prepare('PRAGMA foreign_keys').get() as any;
      expect(result.foreign_keys).toBe(1);
    });
  });
});
