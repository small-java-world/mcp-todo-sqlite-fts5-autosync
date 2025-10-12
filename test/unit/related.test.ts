import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-related');
const dbFile = 'todo-related.db';
const casDir = path.join(tmpDir, 'cas');

describe('Related Tests', () => {
  let db: DB;
  
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
    
    // task_linksテーブルを作成
    db.db.exec(`
      CREATE TABLE IF NOT EXISTS task_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        note TEXT,
        UNIQUE(task_id, target_id, relation)
      );
    `);
  });

  beforeEach(() => {
    // 各テスト前にデータをクリア
    db.db.exec('DELETE FROM task_links');
    db.db.exec('DELETE FROM tasks');
  });

  afterAll(() => {
    try {
      db.db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should parse related tasks from TODO.md', () => {
    const todoMd = `## [T-RELATED-1] Main Task {state: IN_PROGRESS}

Related:
- [T-RELATED-2] (blocks)
- [T-RELATED-3] (depends on)
- [T-RELATED-4] (related to)

This is the main task description.

## [T-RELATED-2] Blocked Task {state: DRAFT}

This task is blocked by T-RELATED-1.

## [T-RELATED-3] Dependency Task {state: DONE}

This task is a dependency for T-RELATED-1.

## [T-RELATED-4] Related Task {state: IN_PROGRESS}

This task is related to T-RELATED-1.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    // 関連タスクの確認
    const links = db.db.prepare('SELECT * FROM task_links WHERE task_id = ? ORDER BY relation').all('T-RELATED-1');
    expect(links).toHaveLength(3);
    
    expect(links[0].target_id).toBe('T-RELATED-2');
    expect(links[0].relation).toBe('blocks');
    
    expect(links[1].target_id).toBe('T-RELATED-3');
    expect(links[1].relation).toBe('depends on');
    
    expect(links[2].target_id).toBe('T-RELATED-4');
    expect(links[2].relation).toBe('related to');
  });

  it('should export related tasks to TODO.md', () => {
    // タスクを作成
    db.upsertTask('T-EXPORT-RELATED-1', 'Export Related Test', 'Main task', {});
    db.upsertTask('T-EXPORT-RELATED-2', 'Blocked Task', 'Blocked by main', {});
    db.upsertTask('T-EXPORT-RELATED-3', 'Dependency Task', 'Dependency for main', {});
    
    // 関連を追加
    const now = Date.now();
    db.db.prepare(`
      INSERT INTO task_links (task_id, target_id, relation, created_at, note)
      VALUES (?, ?, ?, ?, ?)
    `).run('T-EXPORT-RELATED-1', 'T-EXPORT-RELATED-2', 'blocks', now, 'Main task blocks this');
    
    db.db.prepare(`
      INSERT INTO task_links (task_id, target_id, relation, created_at, note)
      VALUES (?, ?, ?, ?, ?)
    `).run('T-EXPORT-RELATED-1', 'T-EXPORT-RELATED-3', 'depends on', now, 'Main task depends on this');
    
    const exported = db.exportTodoMd();
    expect(exported).toContain('## [T-EXPORT-RELATED-1] Export Related Test');
    expect(exported).toContain('Related:');
    expect(exported).toContain('[T-EXPORT-RELATED-2] (blocks)');
    expect(exported).toContain('[T-EXPORT-RELATED-3] (depends on)');
  });

  it('should handle bidirectional links', () => {
    const todoMd = `## [T-BIDIR-1] Task A {state: IN_PROGRESS}

Related:
- [T-BIDIR-2] (blocks)

## [T-BIDIR-2] Task B {state: DRAFT}

Related:
- [T-BIDIR-1] (blocked by)`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    // 双方向の関連を確認
    const links1 = db.db.prepare('SELECT * FROM task_links WHERE task_id = ?').all('T-BIDIR-1');
    const links2 = db.db.prepare('SELECT * FROM task_links WHERE task_id = ?').all('T-BIDIR-2');
    
    expect(links1).toHaveLength(1);
    expect(links1[0].target_id).toBe('T-BIDIR-2');
    expect(links1[0].relation).toBe('blocks');
    
    expect(links2).toHaveLength(1);
    expect(links2[0].target_id).toBe('T-BIDIR-1');
    expect(links2[0].relation).toBe('blocked by');
  });

  it('should handle single line related format', () => {
    const todoMd = `## [T-SINGLE-RELATED-1] Single Line Related {state: IN_PROGRESS}

Related: [T-SINGLE-RELATED-2] [T-SINGLE-RELATED-3] [T-SINGLE-RELATED-4]

This task has single line related tasks.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const links = db.db.prepare('SELECT * FROM task_links WHERE task_id = ?').all('T-SINGLE-RELATED-1');
    expect(links).toHaveLength(3);
    
    const targetIds = links.map(link => link.target_id).sort();
    expect(targetIds).toEqual(['T-SINGLE-RELATED-2', 'T-SINGLE-RELATED-3', 'T-SINGLE-RELATED-4']);
    
    // デフォルトの関係は "related to"
    links.forEach(link => {
      expect(link.relation).toBe('related to');
    });
  });

  it('should handle invalid related format gracefully', () => {
    const todoMd = `## [T-INVALID-RELATED-1] Invalid Related {state: DRAFT}

Related:
- Invalid format
- [T-INVALID-RELATED-2] (valid relation)
- [T-INVALID-RELATED-3] (invalid relation type)

This task has some invalid related entries.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    // 有効な関連のみ保存される
    const links = db.db.prepare('SELECT * FROM task_links WHERE task_id = ?').all('T-INVALID-RELATED-1');
    expect(links).toHaveLength(2);
    const targetIds = links.map(link => link.target_id).sort();
    expect(targetIds).toEqual(['T-INVALID-RELATED-2', 'T-INVALID-RELATED-3']);
  });
});
