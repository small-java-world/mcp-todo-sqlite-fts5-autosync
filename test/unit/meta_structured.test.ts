import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-meta');
const dbFile = 'todo-meta.db';
const casDir = path.join(tmpDir, 'cas');

describe('Meta Structured Tests', () => {
  let db: DB;
  
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
  });

  beforeEach(() => {
    // 各テスト前にデータをクリア
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

  it('should parse structured meta from TODO.md', () => {
    const todoMd = `## [T-META-1] Test Task {state: IN_PROGRESS, assignee: alice, due: 2025-12-31}

Meta:
\`\`\`json
{
  "priority": "High",
  "tags": ["release", "urgent"],
  "subtasks": [
    { "id": "T-META-1-a", "title": "Design review", "done": false },
    { "id": "T-META-1-b", "title": "QA confirmation", "done": false }
  ]
}
\`\`\`

This is the task description.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-META-1');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.priority).toBe('High');
    expect(meta.tags).toEqual(['release', 'urgent']);
    expect(meta.subtasks).toHaveLength(2);
    expect(meta.subtasks[0].title).toBe('Design review');
  });

  it('should export structured meta to TODO.md', () => {
    // 構造化メタデータでタスクを作成
    const meta = {
      priority: 'Medium',
      tags: ['feature', 'backend'],
      subtasks: [
        { id: 'T-EXPORT-1-a', title: 'Code review', done: true },
        { id: 'T-EXPORT-1-b', title: 'Testing', done: false }
      ]
    };

    db.upsertTask('T-EXPORT-1', 'Export Test', 'Test task for export', meta);
    
    const exported = db.exportTodoMd();
    expect(exported).toContain('## [T-EXPORT-1] Export Test');
    expect(exported).toContain('Meta:');
    expect(exported).toContain('"priority": "Medium"');
    expect(exported).toContain('"tags": [');
    expect(exported).toContain('"feature"');
    expect(exported).toContain('"backend"');
    expect(exported).toContain('"subtasks"');
  });

  it('should handle invalid JSON in meta gracefully', () => {
    const todoMd = `## [T-INVALID-1] Invalid Meta {state: DRAFT}

Meta:
\`\`\`json
{
  "priority": "High",
  "tags": ["release", "urgent"],
  "subtasks": [
    { "id": "T-INVALID-1-a", "title": "Design review", "done": false
  ]
}
\`\`\`

This task has invalid JSON.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-INVALID-1');
    expect(task).toBeDefined();
    // 無効なJSONの場合は警告ログを出力し、タスクは作成される
    expect(task?.title).toBe('Invalid Meta');
  });

  it('should handle null/undefined meta values', () => {
    // null meta
    db.upsertTask('T-NULL-1', 'Null Meta Task', 'Task with null meta', null);
    let task = db.getTask('T-NULL-1');
    expect(task?.meta).toBeNull();

    // undefined meta
    db.upsertTask('T-UNDEFINED-1', 'Undefined Meta Task', 'Task with undefined meta', undefined);
    task = db.getTask('T-UNDEFINED-1');
    expect(task?.meta).toBeNull();

    // 空のオブジェクト
    db.upsertTask('T-EMPTY-1', 'Empty Meta Task', 'Task with empty meta', {});
    task = db.getTask('T-EMPTY-1');
    expect(task?.meta).toBe('{}');
  });

  it('should validate meta structure and log warnings', () => {
    const invalidMeta = {
      priority: 123, // should be string
      tags: 'not-an-array', // should be array
      subtasks: 'not-an-array' // should be array
    };

    db.upsertTask('T-VALIDATE-1', 'Validation Test', 'Task for validation', invalidMeta);
    
    const task = db.getTask('T-VALIDATE-1');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.priority).toBe(123); // バリデーション警告は出るが保存はされる
    expect(meta.tags).toBe('not-an-array');
  });
});
