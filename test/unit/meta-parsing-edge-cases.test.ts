import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';

describe('Meta Parsing Edge Cases Tests', () => {
  let db: DB;
  let tempDir: string;

  beforeEach(() => {
    tempDir = `temp_test_${Date.now()}`;
    db = new DB(tempDir, 'test.db');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle empty timeline section', () => {
    const todoMd = `## [T-EDGE-1] Task with Empty Timeline
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Timeline:
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-1');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline).toEqual([]);
  });

  it('should handle empty related section', () => {
    const todoMd = `## [T-EDGE-2] Task with Empty Related
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Related:
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-2');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.related).toBeDefined();
    expect(meta.related).toEqual([]);
  });

  it('should handle empty notes section', () => {
    const todoMd = `## [T-EDGE-3] Task with Empty Notes
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Notes:
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-3');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.notes).toBeDefined();
    expect(meta.notes).toBe('');
  });

  it('should handle empty meta section', () => {
    const todoMd = `## [T-EDGE-4] Task with Empty Meta
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Meta:
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-4');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta).toBeDefined();
  });

  it('should handle malformed JSON in meta section', () => {
    const todoMd = `## [T-EDGE-5] Task with Malformed JSON
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Meta:
\`\`\`json
{
  "invalid": json
}
\`\`\`
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-5');
    expect(task).toBeDefined();
    // Should handle malformed JSON gracefully
  });

  it('should handle timeline with invalid date format', () => {
    const todoMd = `## [T-EDGE-6] Task with Invalid Timeline Date
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Timeline:
- 2025-01-16T10:00:00Z by developer1: Valid event
- invalid-date by developer2: Invalid date event
- 2025-01-16T11:00:00Z by developer3: Another valid event
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-6');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline.length).toBeGreaterThan(0);
  });

  it('should handle related links with special characters', () => {
    const todoMd = `## [T-EDGE-7] Task with Special Character Links
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Related:
- https://example.com/path?param=value&other=<>&"'
- Description with special chars: <>&"'日本語
- Simple link
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-7');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.related).toBeDefined();
    expect(meta.related.length).toBe(3);
  });

  it('should handle notes with multiple empty lines', () => {
    const todoMd = `## [T-EDGE-8] Task with Multiple Empty Lines in Notes
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Notes:
First line of notes


Second line after empty lines

Third line
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-8');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.notes).toBeDefined();
    expect(meta.notes).toContain('First line of notes');
    expect(meta.notes).toContain('Second line after empty lines');
    expect(meta.notes).toContain('Third line');
  });

  it('should handle mixed case section headers', () => {
    const todoMd = `## [T-EDGE-9] Task with Mixed Case Headers
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### TIMELINE:
- 2025-01-16T10:00:00Z by developer1: Event 1

### RELATED:
- https://example.com

### NOTES:
Some notes here

### META:
\`\`\`json
{"key": "value"}
\`\`\`
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-9');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.timeline).toBeDefined();
    expect(meta.related).toBeDefined();
    expect(meta.notes).toBeDefined();
    expect(meta.key).toBe('value');
  });

  it('should handle nested sections', () => {
    const todoMd = `## [T-EDGE-10] Task with Nested Sections
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Timeline:
- 2025-01-16T10:00:00Z by developer1: Event 1
  - Sub event (should be ignored)
  - Another sub event

### Related:
- https://example.com
  - Sub link (should be ignored)
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-10');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.timeline).toBeDefined();
    expect(meta.timeline.length).toBe(1);
    expect(meta.related).toBeDefined();
    expect(meta.related.length).toBe(1);
  });

  it('should handle very long content in sections', () => {
    const longContent = 'A'.repeat(10000);
    const todoMd = `## [T-EDGE-11] Task with Long Content
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Notes:
${longContent}

### Meta:
\`\`\`json
{"longContent": "${longContent}"}
\`\`\`
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-11');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.notes).toBeDefined();
    expect(meta.notes.length).toBe(10000);
    expect(meta.longContent).toBeDefined();
    expect(meta.longContent.length).toBe(10000);
  });

  it('should handle sections with only whitespace', () => {
    const todoMd = `## [T-EDGE-12] Task with Whitespace Sections
- State: DRAFT
- Created: 2025-01-16T09:00:00Z

### Timeline:
   

### Related:
   

### Notes:
   

### Meta:
   
`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EDGE-12');
    expect(task).toBeDefined();
    expect(task?.meta).toBeDefined();
    
    const meta = JSON.parse(task?.meta || '{}');
    expect(meta.timeline).toBeDefined();
    expect(meta.related).toBeDefined();
    expect(meta.notes).toBeDefined();
  });
});
