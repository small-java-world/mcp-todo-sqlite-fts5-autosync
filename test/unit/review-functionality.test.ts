import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';

describe('Review Functionality Tests', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
    
    // Create a test task
    const todoMd = `## [T-REVIEW-1] Test Task for Review
- State: DRAFT
- Created: 2025-01-16T09:00:00Z
`;
    db.importTodoMd(todoMd);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should add review with APPROVE decision', () => {
    const taskId = 'T-REVIEW-1';
    const decision = 'APPROVE';
    const by = 'reviewer1';
    const note = 'Looks good to me';
    const at = Date.now();

    db.addReview(taskId, decision, by, note, at);

    // Check that task state was updated
    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe('APPROVED');
  });

  it('should add review with REQUEST_CHANGES decision', () => {
    const taskId = 'T-REVIEW-1';
    const decision = 'REQUEST_CHANGES';
    const by = 'reviewer1';
    const note = 'Please fix the formatting';
    const at = Date.now();

    db.addReview(taskId, decision, by, note, at);

    // Check that task state was updated
    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe('CHANGES_REQUESTED');
  });

  it('should add review without note', () => {
    const taskId = 'T-REVIEW-1';
    const decision = 'APPROVE';
    const by = 'reviewer1';

    db.addReview(taskId, decision, by);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe('APPROVED');
  });

  it('should add review without timestamp', () => {
    const taskId = 'T-REVIEW-1';
    const decision = 'APPROVE';
    const by = 'reviewer1';
    const note = 'Approved';

    db.addReview(taskId, decision, by, note);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe('APPROVED');
  });

  it('should throw error for non-existent task', () => {
    const taskId = 'T-NONEXISTENT';
    const decision = 'APPROVE';
    const by = 'reviewer1';

    expect(() => {
      db.addReview(taskId, decision, by);
    }).toThrow();
  });

  it('should add comment to task', () => {
    const taskId = 'T-REVIEW-1';
    const by = 'reviewer1';
    const text = 'This is a comment';
    const at = Date.now();

    db.addComment(taskId, by, text, at);

    // Check that comment was added (we can't directly verify the comment
    // without accessing the database directly, but we can check that no error was thrown)
    const task = db.getTask(taskId);
    expect(task).toBeDefined();
  });

  it('should add comment without timestamp', () => {
    const taskId = 'T-REVIEW-1';
    const by = 'reviewer1';
    const text = 'This is a comment without timestamp';

    db.addComment(taskId, by, text);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
  });

  it('should throw error for comment on non-existent task', () => {
    const taskId = 'T-NONEXISTENT';
    const by = 'reviewer1';
    const text = 'This should fail';

    expect(() => {
      db.addComment(taskId, by, text);
    }).toThrow();
  });

  it('should handle multiple reviews on same task', () => {
    const taskId = 'T-REVIEW-1';
    
    // First review - request changes
    db.addReview(taskId, 'REQUEST_CHANGES', 'reviewer1', 'Please fix this');
    
    let task = db.getTask(taskId);
    expect(task?.state).toBe('CHANGES_REQUESTED');

    // Second review - approve
    db.addReview(taskId, 'APPROVE', 'reviewer2', 'Now it looks good');
    
    task = db.getTask(taskId);
    expect(task?.state).toBe('APPROVED');
  });

  it('should handle multiple comments on same task', () => {
    const taskId = 'T-REVIEW-1';
    
    // Add multiple comments
    db.addComment(taskId, 'user1', 'First comment');
    db.addComment(taskId, 'user2', 'Second comment');
    db.addComment(taskId, 'user1', 'Third comment');

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
  });

  it('should handle review with special characters in note', () => {
    const taskId = 'T-REVIEW-1';
    const decision = 'APPROVE';
    const by = 'reviewer1';
    const note = 'Special chars: <>&"\'日本語';
    const at = Date.now();

    db.addReview(taskId, decision, by, note, at);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
    expect(task?.state).toBe('APPROVED');
  });

  it('should handle comment with special characters', () => {
    const taskId = 'T-REVIEW-1';
    const by = 'reviewer1';
    const text = 'Comment with special chars: <>&"\'日本語';

    db.addComment(taskId, by, text);

    const task = db.getTask(taskId);
    expect(task).toBeDefined();
  });
});
