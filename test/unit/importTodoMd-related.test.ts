import { describe, it, expect, beforeEach } from 'vitest';
import { DB } from '../../src/utils/db';

describe('importTodoMd Related Tests', () => {
  let db: DB;

  beforeEach(() => {
    // Use a temporary directory for testing
    const tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
  });

  it('should parse task with related links', async () => {
    const todoMd = `## [T-RELATED-1] Task with Related Links
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Related:
- [T-RELATED-2] Related Task 1
- [T-RELATED-3] Related Task 2
- [T-RELATED-4] Related Task 3
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-RELATED-1');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Related Links');

    // Related links should be stored in the task's meta field
    expect(task?.meta).toBeDefined();
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.related).toBeDefined();
    expect(meta.related.length).toBe(3);
    
    expect(meta.related[0]).toEqual({
      taskId: 'T-RELATED-2',
      title: 'Related Task 1'
    });
    
    expect(meta.related[1]).toEqual({
      taskId: 'T-RELATED-3',
      title: 'Related Task 2'
    });
    
    expect(meta.related[2]).toEqual({
      taskId: 'T-RELATED-4',
      title: 'Related Task 3'
    });
  });

  it('should parse task with related links and other sections', async () => {
    const todoMd = `## [T-RELATED-2] Task with Related and Timeline
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Related:
- [T-RELATED-1] Previous Task
- [T-RELATED-3] Next Task

### Timeline:
- 2025-01-16T09:00:00Z by system: Task created
- 2025-01-16T10:00:00Z by developer1: Started implementation
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-RELATED-2');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Related and Timeline');

    // Both related and timeline should be preserved
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.related).toBeDefined();
    expect(meta.related.length).toBe(2);
    
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline.length).toBe(2);
  });

  it('should parse task with related links in different formats', async () => {
    const todoMd = `## [T-RELATED-3] Task with Various Related Formats
- State: IN_PROGRESS
- Created: 2025-01-16T09:00:00Z

### Related:
- [T-RELATED-1] Simple Task
- [T-RELATED-2] Task with Description: This is a related task with description
- [T-RELATED-4] External Link: https://example.com/issue/123
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-RELATED-3');
    expect(task).toBeDefined();
    expect(task?.title).toBe('Task with Various Related Formats');

    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.related).toBeDefined();
    expect(meta.related.length).toBe(3);
    
    expect(meta.related[0]).toEqual({
      taskId: 'T-RELATED-1',
      title: 'Simple Task'
    });
    
    expect(meta.related[1]).toEqual({
      taskId: 'T-RELATED-2',
      title: 'Task with Description',
      description: 'This is a related task with description'
    });
    
    expect(meta.related[2]).toEqual({
      taskId: 'T-RELATED-4',
      title: 'External Link',
      url: 'https://example.com/issue/123'
    });
  });
});
