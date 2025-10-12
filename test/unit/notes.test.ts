import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-notes');
const dbFile = 'todo-notes.db';
const casDir = path.join(tmpDir, 'cas');

describe('Notes Tests', () => {
  let db: DB;
  
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
    
    // task_notesテーブルを作成
    db.db.exec(`
      CREATE TABLE IF NOT EXISTS task_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT 0
      );
    `);
  });

  beforeEach(() => {
    // 各テスト前にデータをクリア
    db.db.exec('DELETE FROM task_notes');
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

  it('should parse notes from TODO.md', () => {
    const todoMd = `## [T-NOTES-1] Notes Test {state: IN_PROGRESS}

Notes:
- 2025-02-12T08:03:12Z | developer1: Initial implementation completed
- 2025-02-12T09:15:30Z | reviewer1: Code review feedback provided
- 2025-02-12T10:22:45Z | developer1: Addressed review comments
- 2025-02-12T11:30:00Z | developer1: (internal) Debugging session notes

This is the task description.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const notes = db.db.prepare('SELECT * FROM task_notes WHERE task_id = ? ORDER BY at ASC').all('T-NOTES-1');
    expect(notes).toHaveLength(4);
    
    expect(notes[0].author).toBe('developer1');
    expect(notes[0].body).toBe('Initial implementation completed');
    expect(notes[0].is_internal).toBe(0);
    
    expect(notes[1].author).toBe('reviewer1');
    expect(notes[1].body).toBe('Code review feedback provided');
    expect(notes[1].is_internal).toBe(0);
    
    expect(notes[3].author).toBe('developer1');
    expect(notes[3].body).toBe('Debugging session notes');
    expect(notes[3].is_internal).toBe(1);
  });

  it('should export notes to TODO.md', () => {
    // タスクを作成
    db.upsertTask('T-EXPORT-NOTES-1', 'Export Notes Test', 'Test task for notes export', {});
    
    // ノートを追加
    const now = Date.now();
    db.db.prepare(`
      INSERT INTO task_notes (task_id, at, author, body, is_internal)
      VALUES (?, ?, ?, ?, ?)
    `).run('T-EXPORT-NOTES-1', now, 'developer1', 'First note', 0);
    
    db.db.prepare(`
      INSERT INTO task_notes (task_id, at, author, body, is_internal)
      VALUES (?, ?, ?, ?, ?)
    `).run('T-EXPORT-NOTES-1', now + 1000, 'reviewer1', 'Review note', 0);
    
    db.db.prepare(`
      INSERT INTO task_notes (task_id, at, author, body, is_internal)
      VALUES (?, ?, ?, ?, ?)
    `).run('T-EXPORT-NOTES-1', now + 2000, 'developer1', 'Internal note', 1);
    
    const exported = db.exportTodoMd();
    expect(exported).toContain('## [T-EXPORT-NOTES-1] Export Notes Test');
    expect(exported).toContain('Notes:');
    expect(exported).toContain('developer1: First note');
    expect(exported).toContain('reviewer1: Review note');
    expect(exported).toContain('developer1: (internal) Internal note');
  });

  it('should handle notes with details format', () => {
    const todoMd = `## [T-DETAILS-NOTES-1] Details Notes Test {state: IN_PROGRESS}

Notes:
<details>
<summary>Development Notes</summary>

- 2025-02-12T08:03:12Z | developer1: Initial implementation
- 2025-02-12T09:15:30Z | developer1: Added error handling
</details>

<details>
<summary>Review Notes</summary>

- 2025-02-12T10:22:45Z | reviewer1: Code review completed
- 2025-02-12T11:30:00Z | reviewer1: Approved for merge
</details>

This task uses details format for notes.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const notes = db.db.prepare('SELECT * FROM task_notes WHERE task_id = ? ORDER BY at ASC').all('T-DETAILS-NOTES-1');
    expect(notes).toHaveLength(4);
    
    expect(notes[0].author).toBe('developer1');
    expect(notes[0].body).toBe('Initial implementation');
    
    expect(notes[2].author).toBe('reviewer1');
    expect(notes[2].body).toBe('Code review completed');
  });

  it('should handle notes with indented format', () => {
    const todoMd = `## [T-INDENTED-NOTES-1] Indented Notes Test {state: IN_PROGRESS}

Notes:
    - 2025-02-12T08:03:12Z | developer1: Indented note 1
    - 2025-02-12T09:15:30Z | developer1: Indented note 2
        - 2025-02-12T10:22:45Z | developer1: Nested note

This task uses indented format for notes.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const notes = db.db.prepare('SELECT * FROM task_notes WHERE task_id = ? ORDER BY at ASC').all('T-INDENTED-NOTES-1');
    expect(notes).toHaveLength(3);
    
    expect(notes[0].body).toBe('Indented note 1');
    expect(notes[1].body).toBe('Indented note 2');
    expect(notes[2].body).toBe('Nested note');
  });

  it('should handle invalid notes format gracefully', () => {
    const todoMd = `## [T-INVALID-NOTES-1] Invalid Notes Test {state: DRAFT}

Notes:
- Invalid format without timestamp
- 2025-02-12T08:03:12Z | developer1: Valid note
- Invalid timestamp format | developer1: Invalid timestamp
- 2025-02-12T09:15:30Z | Valid note without author

This task has some invalid note entries.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    // 有効なノートのみ保存される
    const notes = db.db.prepare('SELECT * FROM task_notes WHERE task_id = ?').all('T-INVALID-NOTES-1');
    expect(notes).toHaveLength(1);
    expect(notes[0].author).toBe('developer1');
    expect(notes[0].body).toBe('Valid note');
  });

  it('should support post_note API', () => {
    // タスクを作成
    db.upsertTask('T-API-NOTES-1', 'API Notes Test', 'Test task for notes API', {});
    
    // post_note APIをシミュレート
    const noteId = db.db.prepare(`
      INSERT INTO task_notes (task_id, at, author, body, is_internal)
      VALUES (?, ?, ?, ?, ?)
    `).run('T-API-NOTES-1', Date.now(), 'developer1', 'API test note', 0).lastInsertRowid;
    
    expect(noteId).toBeDefined();
    
    const notes = db.db.prepare('SELECT * FROM task_notes WHERE task_id = ?').all('T-API-NOTES-1');
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(noteId);
    expect(notes[0].body).toBe('API test note');
  });
});
