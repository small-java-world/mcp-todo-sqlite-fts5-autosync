import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '../../src/utils/db';

describe('importTodoMd Timeline Tests', () => {
  let db: DB;

  beforeEach(() => {
    // Use a temporary directory for testing
    const tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
  });

  it('should parse task with timeline', async () => {
    const todoMd = `## [T-TIMELINE-1] Task with Timeline
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Timeline:
- 2025-01-16T09:00:00Z by system: Task created
- 2025-01-16T10:00:00Z by developer1: Started implementation
- 2025-01-16T11:00:00Z by developer1: Completed feature A
- 2025-01-16T12:00:00Z by reviewer1: Code review completed
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-TIMELINE-1');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Timeline');

    // Timeline events should be stored in the task's meta field
    expect(task?.meta).toBeDefined();
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline.length).toBe(4);
    
    expect(meta.timeline[0]).toEqual({
      timestamp: '2025-01-16T09:00:00Z',
      actor: 'system',
      action: 'Task created'
    });
    
    expect(meta.timeline[1]).toEqual({
      timestamp: '2025-01-16T10:00:00Z',
      actor: 'developer1',
      action: 'Started implementation'
    });
    
    expect(meta.timeline[2]).toEqual({
      timestamp: '2025-01-16T11:00:00Z',
      actor: 'developer1',
      action: 'Completed feature A'
    });
    
    expect(meta.timeline[3]).toEqual({
      timestamp: '2025-01-16T12:00:00Z',
      actor: 'reviewer1',
      action: 'Code review completed'
    });
  });

  it('should parse task with timeline and other sections', async () => {
    const todoMd = `## [T-TIMELINE-2] Task with Timeline and Issues
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Timeline:
- 2025-01-16T09:00:00Z by system: Task created
- 2025-01-16T10:00:00Z by developer1: Started implementation

### Issues:

#### Issue 1: Performance Issue
- **Status**: Open
- **Priority**: High
- **Created**: 2025-01-16T10:30:00Z by reviewer1
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-TIMELINE-2');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Timeline and Issues');

    // Timeline should be preserved
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline.length).toBe(2);
    
    // Issues should also be preserved
    const issues = db.issuesManager.getIssuesForTask('T-TIMELINE-2');
    expect(issues.length).toBe(1);
    expect(issues[0].title).toBe('Performance Issue');
  });
});
