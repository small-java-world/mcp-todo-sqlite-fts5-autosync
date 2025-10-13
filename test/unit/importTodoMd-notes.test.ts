import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '../../src/utils/db';

describe('importTodoMd Notes Tests', () => {
  let db: DB;

  beforeEach(() => {
    // Use a temporary directory for testing
    const tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
  });

  it('should parse task with notes', async () => {
    const todoMd = `## [T-NOTES-1] Task with Notes
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Notes:
This is a note about the task.
It can span multiple lines.

Another note with more details.
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-NOTES-1');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Notes');

    // Notes should be stored in the task's meta field
    expect(task?.meta).toBeDefined();
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.notes).toBeDefined();
    expect(meta.notes).toBe(`This is a note about the task.
It can span multiple lines.

Another note with more details.`);
  });

  it('should parse task with notes and other sections', async () => {
    const todoMd = `## [T-NOTES-2] Task with Notes and Timeline
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Notes:
This task requires careful attention to detail.

### Timeline:
- 2025-01-16T09:00:00Z by system: Task created
- 2025-01-16T10:00:00Z by developer1: Started implementation
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-NOTES-2');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Notes and Timeline');

    // Both notes and timeline should be preserved
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.notes).toBeDefined();
    expect(meta.notes).toBe('This task requires careful attention to detail.');
    
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline.length).toBe(2);
  });

  it('should parse task with empty notes section', async () => {
    const todoMd = `## [T-NOTES-3] Task with Empty Notes
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Notes:

### Timeline:
- 2025-01-16T09:00:00Z by system: Task created
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-NOTES-3');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Empty Notes');

    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.notes).toBeDefined();
    expect(meta.notes).toBe('');
    
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline.length).toBe(1);
  });
});
