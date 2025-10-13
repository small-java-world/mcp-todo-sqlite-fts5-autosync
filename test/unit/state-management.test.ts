import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';

describe('State Management Tests', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
    
    // Create a test task
    const todoMd = `## [T-STATE-1] Test Task for State Management
- State: DRAFT
- Created: 2025-01-16T09:00:00Z
`;
    db.importTodoMd(todoMd);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    // Wait a bit for file handles to be released
    await new Promise(resolve => setTimeout(resolve, 100));
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error);
      }
    }
  });

  it('should set state to IN_PROGRESS', () => {
    const taskId = 'T-STATE-1';
    const newState = 'IN_PROGRESS';
    const by = 'developer1';
    const note = 'Starting work on this task';
    const at = Date.now();

    db.setState(taskId, newState, by, note, at);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should set state to DONE', () => {
    const taskId = 'T-STATE-1';
    const newState = 'DONE';
    const by = 'developer1';
    const note = 'Task completed successfully';

    db.setState(taskId, newState, by, note);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should set state without note', () => {
    const taskId = 'T-STATE-1';
    const newState = 'IN_PROGRESS';
    const by = 'developer1';

    db.setState(taskId, newState, by);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should set state without by parameter', () => {
    const taskId = 'T-STATE-1';
    const newState = 'IN_PROGRESS';
    const note = 'State change without by parameter';

    db.setState(taskId, newState, undefined, note);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should set state without timestamp', () => {
    const taskId = 'T-STATE-1';
    const newState = 'DONE';
    const by = 'developer1';
    const note = 'State change without timestamp';

    db.setState(taskId, newState, by, note);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should throw error for non-existent task', () => {
    const taskId = 'T-NONEXISTENT';
    const newState = 'IN_PROGRESS';
    const by = 'developer1';

    expect(() => {
      db.setState(taskId, newState, by);
    }).toThrow();
  });

  it('should throw error for archived task', () => {
    const taskId = 'T-STATE-1';
    
    // First archive the task
    db.archiveTask(taskId, 'Test archive');

    // Try to set state on archived task
    expect(() => {
      db.setState(taskId, 'IN_PROGRESS', 'developer1');
    }).toThrow();
  });

  it('should handle multiple state changes', () => {
    const taskId = 'T-STATE-1';
    
    // First state change
    db.setState(taskId, 'IN_PROGRESS', 'developer1', 'Starting work');
    let task = db.getTask(taskId);
    expect(task?.state).toBe('IN_PROGRESS');

    // Second state change
    db.setState(taskId, 'DONE', 'developer1', 'Work completed');
    task = db.getTask(taskId);
    expect(task?.state).toBe('DONE');
  });

  it('should handle state change with special characters in note', () => {
    const taskId = 'T-STATE-1';
    const newState = 'IN_PROGRESS';
    const by = 'developer1';
    const note = 'Special chars: <>&"\'日本語';
    const at = Date.now();

    db.setState(taskId, newState, by, note, at);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should handle state change with special characters in by parameter', () => {
    const taskId = 'T-STATE-1';
    const newState = 'IN_PROGRESS';
    const by = 'developer<>&"\'日本語';
    const note = 'State change with special chars in by';

    db.setState(taskId, newState, by, note);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should handle all valid state transitions', () => {
    const taskId = 'T-STATE-1';
    const states = ['DRAFT', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
    
    for (let i = 0; i < states.length; i++) {
      const state = states[i];
      db.setState(taskId, state, 'developer1', `Changed to ${state}`);
      
      const task = db.getTask(taskId);
      expect(task?.state).toBe(state);
    }
  });

  it('should handle state change with empty note', () => {
    const taskId = 'T-STATE-1';
    const newState = 'IN_PROGRESS';
    const by = 'developer1';
    const note = '';

    db.setState(taskId, newState, by, note);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should handle state change with null note', () => {
    const taskId = 'T-STATE-1';
    const newState = 'DONE';
    const by = 'developer1';

    db.setState(taskId, newState, by, null);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe(newState);
  });

  it('should handle rapid state changes', () => {
    const taskId = 'T-STATE-1';
    
    // Rapid state changes
    db.setState(taskId, 'IN_PROGRESS', 'developer1', 'Start');
    db.setState(taskId, 'DONE', 'developer1', 'Complete');
    db.setState(taskId, 'CANCELLED', 'developer1', 'Cancel');

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe('CANCELLED');
  });
});
