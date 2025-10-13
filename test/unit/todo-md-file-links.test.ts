import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('TODO.md File Links', () => {
  let db: DB;
  let dbPath: string;
  let testOutputDir: string;

  beforeEach(() => {
    testOutputDir = path.join(process.cwd(), '.test-output', `todo-md-links-${Date.now()}`);
    fs.mkdirSync(testOutputDir, { recursive: true });
    dbPath = path.join(testOutputDir, 'test.db');
    db = new DB(testOutputDir, 'test.db');

    // Create test tasks
    db.upsertTask('T-LINK-001', 'Task with Requirements', 'This task has requirements', null);
    db.upsertTask('T-LINK-002', 'Task with TestCases', 'This task has testcases', null);
    db.upsertTask('T-LINK-003', 'Task with Both', 'This task has both requirements and testcases', null);
    db.upsertTask('T-LINK-004', 'Task without Spec', 'This task has no spec files', null);

    // Add requirements to T-LINK-001 and T-LINK-003
    db.submitRequirements({
      id: 'REQ-LINK-001',
      todo_id: 'T-LINK-001',
      raw_markdown: '# Requirements for Task 001\n\n- Must work correctly',
      idempotency_key: 'req-link-001'
    });

    db.submitRequirements({
      id: 'REQ-LINK-003',
      todo_id: 'T-LINK-003',
      raw_markdown: '# Requirements for Task 003\n\n- Must be complete',
      idempotency_key: 'req-link-003'
    });

    // Add requirements for T-LINK-002 (needed for testcases)
    db.submitRequirements({
      id: 'REQ-LINK-002',
      todo_id: 'T-LINK-002',
      raw_markdown: '# Requirements for Task 002\n\n- Must have testcases',
      idempotency_key: 'req-link-002'
    });

    // Add testcases to T-LINK-002 and T-LINK-003
    db.submitTestCases({
      id: 'TC-LINK-002',
      requirements_id: 'REQ-LINK-002',
      todo_id: 'T-LINK-002',
      raw_markdown: '# Test Cases for Task 002\n\n## TC-1: Test Case 1\n- Given: ...\n- When: ...\n- Then: ...',
      idempotency_key: 'tc-link-002'
    });

    db.submitTestCases({
      id: 'TC-LINK-003',
      requirements_id: 'REQ-LINK-003',
      todo_id: 'T-LINK-003',
      raw_markdown: '# Test Cases for Task 003\n\n## TC-1: Test Case 1\n- Given: ...\n- When: ...\n- Then: ...',
      idempotency_key: 'tc-link-003'
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }

    // Cleanup
    if (fs.existsSync(testOutputDir)) {
      try {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors on Windows
      }
    }
  });

  it('should include requirements link in TODO.md', () => {
    const todoMd = db.exportTodoMd();

    // Check that T-LINK-001 has requirements link
    expect(todoMd).toContain('T-LINK-001');
    expect(todoMd).toContain('[Requirements](.specify/requirements/T-LINK-001.md)');
  });

  it('should include testcases link in TODO.md', () => {
    const todoMd = db.exportTodoMd();

    // Check that T-LINK-002 has both links (since we added requirements for testcases)
    expect(todoMd).toContain('T-LINK-002');
    expect(todoMd).toContain('[Requirements](.specify/requirements/T-LINK-002.md)');
    expect(todoMd).toContain('[TestCases](.specify/testcases/T-LINK-002.md)');
  });

  it('should include both requirements and testcases links in TODO.md', () => {
    const todoMd = db.exportTodoMd();

    // Check that T-LINK-003 has both links
    expect(todoMd).toContain('T-LINK-003');
    expect(todoMd).toContain('[Requirements](.specify/requirements/T-LINK-003.md)');
    expect(todoMd).toContain('[TestCases](.specify/testcases/T-LINK-003.md)');
  });

  it('should not include spec links for tasks without requirements or testcases', () => {
    const todoMd = db.exportTodoMd();

    // Find T-LINK-004 section
    const taskIndex = todoMd.indexOf('T-LINK-004');
    expect(taskIndex).toBeGreaterThan(-1);

    // Get the next task section (or end of file)
    const nextTaskIndex = todoMd.indexOf('## [T-', taskIndex + 1);
    const taskSection = nextTaskIndex > -1
      ? todoMd.substring(taskIndex, nextTaskIndex)
      : todoMd.substring(taskIndex);

    // Should not contain Related section with spec links
    expect(taskSection).not.toContain('[Requirements](.specify/requirements/T-LINK-004.md)');
    expect(taskSection).not.toContain('[TestCases](.specify/testcases/T-LINK-004.md)');
  });

  it('should include spec links in Related section', () => {
    const todoMd = db.exportTodoMd();

    // Find T-LINK-003 section which has both
    const taskIndex = todoMd.indexOf('T-LINK-003');
    expect(taskIndex).toBeGreaterThan(-1);

    // Get the next task section (or end of file)
    const nextTaskIndex = todoMd.indexOf('## [T-', taskIndex + 1);
    const taskSection = nextTaskIndex > -1
      ? todoMd.substring(taskIndex, nextTaskIndex)
      : todoMd.substring(taskIndex);

    // Should have Related section
    expect(taskSection).toContain('Related:');
    expect(taskSection).toContain('[Requirements](.specify/requirements/T-LINK-003.md)');
    expect(taskSection).toContain('[TestCases](.specify/testcases/T-LINK-003.md)');
  });

  it('should create spec files that match the links', () => {
    // Project all files
    const specifyDir = path.join(testOutputDir, '.specify');
    const result = db.projectAll(testOutputDir, specifyDir);

    expect(result.ok).toBe(true);
    expect(result.todo_md).toBeDefined();

    // Verify that spec files exist for the links
    const req001Path = path.join(specifyDir, 'requirements', 'T-LINK-001.md');
    const req002Path = path.join(specifyDir, 'requirements', 'T-LINK-002.md');
    const tc002Path = path.join(specifyDir, 'testcases', 'T-LINK-002.md');
    const req003Path = path.join(specifyDir, 'requirements', 'T-LINK-003.md');
    const tc003Path = path.join(specifyDir, 'testcases', 'T-LINK-003.md');

    expect(fs.existsSync(req001Path)).toBe(true);
    expect(fs.existsSync(req002Path)).toBe(true);
    expect(fs.existsSync(tc002Path)).toBe(true);
    expect(fs.existsSync(req003Path)).toBe(true);
    expect(fs.existsSync(tc003Path)).toBe(true);

    // Read TODO.md and verify links
    const todoMd = fs.readFileSync(result.todo_md!, 'utf-8');
    expect(todoMd).toContain('[Requirements](.specify/requirements/T-LINK-001.md)');
    expect(todoMd).toContain('[Requirements](.specify/requirements/T-LINK-002.md)');
    expect(todoMd).toContain('[TestCases](.specify/testcases/T-LINK-002.md)');
    expect(todoMd).toContain('[Requirements](.specify/requirements/T-LINK-003.md)');
    expect(todoMd).toContain('[TestCases](.specify/testcases/T-LINK-003.md)');
  });
});
