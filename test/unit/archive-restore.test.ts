import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';

describe('Archive/Restore Tests', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
    
    // Create test tasks
    const todoMd = `## [T-ARCHIVE-1] Task to Archive
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

## [T-ARCHIVE-2] Another Task
- State: DONE
- Created: 2025-01-16T10:00:00Z

## [T-ARCHIVE-3] Third Task
- State: IN_PROGRESS
- Created: 2025-01-16T11:00:00Z
`;
    db.importTodoMd(todoMd);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should archive a task', () => {
    const taskId = 'T-ARCHIVE-1';
    const reason = 'Completed and no longer needed';

    // Archive the task
    db.archiveTask(taskId, reason);

    // Check that task is archived
    const task = db.getTask(taskId);
    expect(task).toBeNull(); // Archived tasks should not be returned by getTask

    // Check archived tasks list
    const archived = db.listArchived();
    expect(archived.length).toBe(1);
    expect(archived[0].id).toBe(taskId);
    expect(archived[0].archived).toBe(1);
  });

  it('should archive a task without reason', () => {
    const taskId = 'T-ARCHIVE-1';

    db.archiveTask(taskId);

    const archived = db.listArchived();
    expect(archived.length).toBe(1);
    expect(archived[0].id).toBe(taskId);
  });

  it('should throw error when archiving non-existent task', () => {
    const taskId = 'T-NONEXISTENT';

    expect(() => {
      db.archiveTask(taskId);
    }).toThrow();
  });

  it('should restore an archived task', () => {
    const taskId = 'T-ARCHIVE-1';

    // First archive the task
    db.archiveTask(taskId, 'Test archive');
    
    // Verify it's archived
    let archived = db.listArchived();
    expect(archived.length).toBe(1);

    // Restore the task
    db.restoreTask(taskId);

    // Check that task is restored
    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.id).toBe(taskId);
    expect(task?.archived).toBe(0);

    // Check that it's no longer in archived list
    archived = db.listArchived();
    expect(archived.length).toBe(0);
  });

  it('should throw error when restoring non-existent task', () => {
    const taskId = 'T-NONEXISTENT';

    expect(() => {
      db.restoreTask(taskId);
    }).toThrow();
  });

  it('should throw error when restoring non-archived task', () => {
    const taskId = 'T-ARCHIVE-1';

    expect(() => {
      db.restoreTask(taskId);
    }).toThrow();
  });

  it('should list archived tasks with limit and offset', () => {
    // Archive multiple tasks
    db.archiveTask('T-ARCHIVE-1', 'Reason 1');
    db.archiveTask('T-ARCHIVE-2', 'Reason 2');
    db.archiveTask('T-ARCHIVE-3', 'Reason 3');

    // Test with limit
    const limited = db.listArchived(2);
    expect(limited.length).toBe(2);

    // Test with offset
    const offset = db.listArchived(2, 1);
    expect(offset.length).toBe(2);
    expect(offset[0].id).toBe('T-ARCHIVE-2'); // Should skip first archived task
  });

  it('should handle archive and restore cycle', () => {
    const taskId = 'T-ARCHIVE-1';

    // Archive
    db.archiveTask(taskId, 'First archive');
    expect(db.listArchived().length).toBe(1);

    // Restore
    db.restoreTask(taskId);
    expect(db.listArchived().length).toBe(0);
    expect(db.getTask(taskId)).toBeDefined();

    // Archive again
    db.archiveTask(taskId, 'Second archive');
    expect(db.listArchived().length).toBe(1);
    expect(db.getTask(taskId)).toBeNull();
  });

  it('should preserve task data when archiving', () => {
    const taskId = 'T-ARCHIVE-1';
    const originalTask = db.getTask(taskId);
    expect(originalTask).toBeDefined();

    db.archiveTask(taskId, 'Preserve data test');

    const archived = db.listArchived();
    expect(archived.length).toBe(1);
    
    const archivedTask = archived[0];
    expect(archivedTask.title).toBe(originalTask?.title);
    expect(archivedTask.text).toBe(originalTask?.text);
    expect(archivedTask.state).toBe(originalTask?.state);
  });

  it('should handle archiving task with special characters in reason', () => {
    const taskId = 'T-ARCHIVE-1';
    const reason = 'Special chars: <>&"\'日本語';

    db.archiveTask(taskId, reason);

    const archived = db.listArchived();
    expect(archived.length).toBe(1);
  });

  it('should handle multiple archive operations', () => {
    // Archive all tasks
    db.archiveTask('T-ARCHIVE-1', 'Reason 1');
    db.archiveTask('T-ARCHIVE-2', 'Reason 2');
    db.archiveTask('T-ARCHIVE-3', 'Reason 3');

    const archived = db.listArchived();
    expect(archived.length).toBe(3);

    // All tasks should be archived
    expect(db.getTask('T-ARCHIVE-1')).toBeNull();
    expect(db.getTask('T-ARCHIVE-2')).toBeNull();
    expect(db.getTask('T-ARCHIVE-3')).toBeNull();
  });

  it('should handle restore after multiple archives', () => {
    // Archive multiple tasks
    db.archiveTask('T-ARCHIVE-1', 'Reason 1');
    db.archiveTask('T-ARCHIVE-2', 'Reason 2');

    // Restore one
    db.restoreTask('T-ARCHIVE-1');

    // Check results
    expect(db.getTask('T-ARCHIVE-1')).toBeDefined();
    expect(db.getTask('T-ARCHIVE-2')).toBeNull();
    
    const archived = db.listArchived();
    expect(archived.length).toBe(1);
    expect(archived[0].id).toBe('T-ARCHIVE-2');
  });
});
