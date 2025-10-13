import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-importTodoMd-refactored');
const dbFile = 'todo-importTodoMd-refactored.db';
const casDir = path.join(tmpDir, 'cas');

describe('importTodoMd Refactored Tests', () => {
  let db: DB;

  beforeAll(() => {
    // Initial setup is handled by beforeEach
  });

  beforeEach(() => {
    // Completely reset the database before each test
    try {
      if (db) {
        db.close();
      }
    } catch (e) {
      // Ignore close errors
    }

    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(casDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
  });

  afterAll(() => {
    try {
      db.db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should parse simple task without attributes', async () => {
    const todoMd = `## [T-SIMPLE-1] Simple Task
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

  it('should parse task with attributes', async () => {
    const todoMd = `## [T-ATTR-1] Task with Attributes {state: DRAFT, assignee: developer1}
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

  it('should parse task with issues', async () => {
    const todoMd = `## [T-ISSUES-1] Task with Issues
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Issues:

#### Issue 1: Database Performance
- **Status**: Open
- **Priority**: High
- **Category**: Performance
- **Severity**: High
- **Created**: 2025-01-16T09:00:00Z by reviewer1
- **Description**: Database queries are too slow
- **Tags**: performance, database

- Responses:
  - 2025-01-16T10:00:00Z by developer1 (comment): "I'll optimize the queries"
`;
    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-ISSUES-1');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Issues');

    const issues = db.issuesManager.getIssuesForTask('T-ISSUES-1');
    expect(issues.length).toBe(1);
    expect(issues[0].title).toBe('Database Performance');
    expect(issues[0].status).toBe('open');
    expect(issues[0].priority).toBe('high');
    expect(issues[0].category).toBe('performance');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].created_by).toBe('reviewer1');
    expect(issues[0].tags).toEqual(['performance', 'database']);

    const responses = db.issuesManager.getIssueResponses(issues[0].id, true);
    expect(responses.length).toBe(1);
    expect(responses[0].content).toBe("I'll optimize the queries");
    expect(responses[0].created_by).toBe('developer1');
  });

  it('should handle multiple tasks', async () => {
    const todoMd = `## [T-MULTI-1] First Task
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

## [T-MULTI-2] Second Task
- State: IN_PROGRESS
- Created: 2025-01-16T09:10:00Z
`;
    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task1 = db.getTask('T-MULTI-1');
    expect(task1).toBeDefined();
    expect(task1?.title).toBe('First Task');
    expect(task1?.state).toBe('DRAFT');

    const task2 = db.getTask('T-MULTI-2');
    expect(task2).toBeDefined();
    expect(task2?.title).toBe('Second Task');
    expect(task2?.state).toBe('IN_PROGRESS');
  });
});
