import { describe, it, expect } from 'vitest';
import { parseAttrs, isoToEpoch, parseSections } from '../../src/utils/markdown-importer.js';

describe('markdown-importer (unit)', () => {
  it('parseAttrs should parse simple key:value pairs', () => {
    const attrs = parseAttrs('state: IN_PROGRESS, assignee: ken, due: 2025-01-16');
    expect(attrs.state).toBe('IN_PROGRESS');
    expect(attrs.assignee).toBe('ken');
    expect(attrs.due).toBe('2025-01-16');
  });

  it('isoToEpoch should parse ISO string to epoch ms', () => {
    const iso = '2025-01-16T09:00:00Z';
    const t = isoToEpoch(iso);
    expect(typeof t).toBe('number');
    expect(t).toBe(Date.parse(iso));
  });

  it('parseSections should extract Timeline/Related/Notes/Meta blocks', () => {
    const md = `## [T-1] Title {state: DRAFT}

### Timeline:
- 2025-01-16T10:00:00Z by system: Created

### Related:
- [T-2] Depends on: https://example.com

### Notes:
Line1\n\nLine2

### Meta:
\`\`\`json
{"key":"value"}
\`\`\``;

    const result = parseSections(md.split(/\r?\n/));
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]).toEqual({ timestamp: '2025-01-16T10:00:00Z', actor: 'system', action: 'Created' });
    expect(result.related).toHaveLength(1);
    expect(result.related[0]).toEqual({ taskId: 'T-2', title: 'Depends on', url: 'https://example.com' });
    expect(result.notes).toBe('Line1\n\nLine2');
    expect(result.meta).toEqual({ key: 'value' });
  });
});


