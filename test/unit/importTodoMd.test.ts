import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-importTodoMd');
const dbFile = 'todo-importTodoMd.db';
const casDir = path.join(tmpDir, 'cas');

describe('importTodoMd Tests', () => {
  let db: DB;
  
  beforeAll(() => {
    // 初期セットアップはbeforeEachで行う
  });

  beforeEach(() => {
    // 各テスト前にデータベースを完全にリセット
    try {
      if (db) {
        db.close();
      }
    } catch (e) {
      // Ignore close errors
    }
    
    // データベースファイルとディレクトリを削除
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // 新しいディレクトリとデータベースを作成
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(casDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
  });

  afterAll(() => {
    try {
      if (db) {
        db.close();
      }
    } catch (e) {
      // Ignore close errors
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should import simple task without attributes', async () => {
    const todoMd = `# Tasks

## [T-SIMPLE-1] Simple Task

- [ ] Test task
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-SIMPLE-1');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Simple Task');
    expect(task?.state).toBe('IN_PROGRESS');
  });

  it('should import task with attributes', async () => {
    const todoMd = `# Tasks

## [T-ATTR-1] Task with Attributes {state: DRAFT, assignee: developer1}

- [ ] Test task with attributes
- State: DRAFT
- Created: 2025-01-16T09:00:00Z
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-ATTR-1');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Attributes');
    expect(task?.state).toBe('DRAFT');
    expect(task?.assignee).toBe('developer1');
  });

  it('should import task with issues', async () => {
    const todoMd = `# Tasks

## [T-ISSUES-1] Task with Issues

- [ ] Test task with issues
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Issues:

#### Issue 1: Test Issue
- **Status**: Open
- **Priority**: High
- **Category**: Bug
- **Severity**: High
- **Created**: 2025-01-16T09:00:00Z by reviewer1
- **Description**: Test issue for debugging
- **Tags**: test, debug

**Responses:**
- 2025-01-16T10:00:00Z by developer1: I'll fix this
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-ISSUES-1');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Issues');
  });

  it('should handle multiple tasks', async () => {
    const todoMd = `# Tasks

## [T-MULTI-1] First Task

- [ ] First task
- State: DRAFT

## [T-MULTI-2] Second Task

- [ ] Second task
- State: IN_PROGRESS
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task1 = db.getTask('T-MULTI-1');
    const task2 = db.getTask('T-MULTI-2');
    
    expect(task1).toBeDefined();
    expect(task1?.title).toBe('First Task');
    expect(task2).toBeDefined();
    expect(task2?.title).toBe('Second Task');
  });
});
