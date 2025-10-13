import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerTodoSplitter } from '../../src/mcp/todo_splitter.js';
import fs from 'fs';
import path from 'path';

describe('registerTodoSplitter', () => {
  let handlers: Map<string, (params: any, ctx?: any) => Promise<any>>;
  let testDir: string;

  beforeEach(() => {
    handlers = new Map();
    const register = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
      handlers.set(method, handler);
    };
    registerTodoSplitter(register);

    testDir = path.join(process.cwd(), '.test-output', `splitter-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    const taskletsDir = path.join(process.cwd(), 'tasklets');
    if (fs.existsSync(taskletsDir)) {
      fs.rmSync(taskletsDir, { recursive: true, force: true });
    }

    const dataDir = path.join(process.cwd(), 'data');
    const materializedLog = path.join(dataDir, 'materialized.log');
    if (fs.existsSync(materializedLog)) {
      fs.unlinkSync(materializedLog);
    }
  });

  describe('todo.decompose', () => {
    it('should register todo.decompose handler', () => {
      expect(handlers.has('todo.decompose')).toBe(true);
    });

    it('should decompose TODO.md into tasklets', async () => {
      // Create a sample TODO.md
      const todoPath = path.join(process.cwd(), 'TODO-test.md');
      const todoContent = `# TODO

- First task
- Second task
- Third task
`;
      fs.writeFileSync(todoPath, todoContent, 'utf8');

      const handler = handlers.get('todo.decompose')!;
      const result = await handler({ from: 'TODO-test.md' });

      expect(result.ok).toBe(true);
      expect(result.emits).toBeDefined();
      expect(result.emits.length).toBe(3);

      // Verify tasklet files were created
      for (const file of result.emits) {
        expect(fs.existsSync(file)).toBe(true);

        const content = JSON.parse(fs.readFileSync(file, 'utf8'));
        expect(content.id).toMatch(/^TL-\d{3}$/);
        expect(content.title).toBeDefined();
        expect(content.conflictScore).toBeGreaterThan(0);
      }

      // Cleanup
      fs.unlinkSync(todoPath);
    });

    it('should handle empty TODO file', async () => {
      const todoPath = path.join(process.cwd(), 'TODO-empty.md');
      fs.writeFileSync(todoPath, '# Empty TODO\n\n', 'utf8');

      const handler = handlers.get('todo.decompose')!;
      const result = await handler({ from: 'TODO-empty.md' });

      expect(result.ok).toBe(true);
      expect(result.emits.length).toBe(0);

      fs.unlinkSync(todoPath);
    });

    it('should handle non-existent file', async () => {
      const handler = handlers.get('todo.decompose')!;
      const result = await handler({ from: 'non-existent.md' });

      expect(result.ok).toBe(true);
      expect(result.emits.length).toBe(0);
    });

    it('should use default TODO.md if from is not specified', async () => {
      const handler = handlers.get('todo.decompose')!;
      const result = await handler({});

      expect(result.ok).toBe(true);
      // Will be empty if TODO.md doesn't exist
      expect(Array.isArray(result.emits)).toBe(true);
    });

    it('should generate sequential tasklet IDs', async () => {
      const todoPath = path.join(process.cwd(), 'TODO-seq.md');
      const todoContent = `# TODO
- Task A
- Task B
- Task C
- Task D
- Task E
`;
      fs.writeFileSync(todoPath, todoContent, 'utf8');

      const handler = handlers.get('todo.decompose')!;
      const result = await handler({ from: 'TODO-seq.md' });

      expect(result.emits.length).toBe(5);

      // Check IDs are sequential
      const ids = result.emits.map((file: string) => {
        const content = JSON.parse(fs.readFileSync(file, 'utf8'));
        return content.id;
      });

      expect(ids).toEqual(['TL-001', 'TL-002', 'TL-003', 'TL-004', 'TL-005']);

      fs.unlinkSync(todoPath);
    });

    it('should strip leading dash and whitespace from titles', async () => {
      const todoPath = path.join(process.cwd(), 'TODO-strip.md');
      const todoContent = `# TODO
-    Task with spaces
- Task without spaces
`;
      fs.writeFileSync(todoPath, todoContent, 'utf8');

      const handler = handlers.get('todo.decompose')!;
      const result = await handler({ from: 'TODO-strip.md' });

      const tasklet1 = JSON.parse(fs.readFileSync(result.emits[0], 'utf8'));
      const tasklet2 = JSON.parse(fs.readFileSync(result.emits[1], 'utf8'));

      expect(tasklet1.title).toBe('Task with spaces');
      expect(tasklet2.title).toBe('Task without spaces');

      fs.unlinkSync(todoPath);
    });
  });

  describe('todo.materialize', () => {
    it('should register todo.materialize handler', () => {
      expect(handlers.has('todo.materialize')).toBe(true);
    });

    it('should materialize a tasklet', async () => {
      const handler = handlers.get('todo.materialize')!;
      const result = await handler({ tasklet_id: 'TL-001' });

      expect(result.ok).toBe(true);
      expect(result.branch).toBe('feature/TL-001');

      // Verify log entry was created
      const logPath = path.join(process.cwd(), 'data', 'materialized.log');
      expect(fs.existsSync(logPath)).toBe(true);

      const content = fs.readFileSync(logPath, 'utf8');
      expect(content).toContain('TL-001');
      expect(content).toContain('feature/TL-001');
    });

    it('should generate branch name from tasklet_id', async () => {
      const handler = handlers.get('todo.materialize')!;
      const result = await handler({ tasklet_id: 'TL-999' });

      expect(result.ok).toBe(true);
      expect(result.branch).toBe('feature/TL-999');
    });

    it('should throw error if tasklet_id is missing', async () => {
      const handler = handlers.get('todo.materialize')!;

      await expect(handler({})).rejects.toThrow('tasklet_id required');
    });

    it('should append multiple entries to materialized log', async () => {
      const handler = handlers.get('todo.materialize')!;

      await handler({ tasklet_id: 'TL-001' });
      await handler({ tasklet_id: 'TL-002' });
      await handler({ tasklet_id: 'TL-003' });

      const logPath = path.join(process.cwd(), 'data', 'materialized.log');
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('TL-001');
      expect(content).toContain('TL-002');
      expect(content).toContain('TL-003');

      const lines = content.trim().split('\n');
      expect(lines.length).toBe(3);
    });

    it('should handle empty tasklet_id', async () => {
      const handler = handlers.get('todo.materialize')!;

      await expect(handler({ tasklet_id: '' })).rejects.toThrow('tasklet_id required');
    });
  });
});
