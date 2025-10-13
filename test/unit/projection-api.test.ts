import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerProjectionHandlers } from '../../src/mcp/projection.js';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('Projection API', () => {
  let handlers: Map<string, (params: any, ctx?: any) => Promise<any>>;
  let db: DB;
  let dbPath: string;
  let testOutputDir: string;

  beforeEach(() => {
    handlers = new Map();
    const register = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
      handlers.set(method, handler);
    };

    // Create test database
    const testDir = path.join(process.cwd(), '.test-output', `projection-test-${Date.now()}`);
    testOutputDir = testDir;
    dbPath = path.join(testDir, 'test.db');
    fs.mkdirSync(testDir, { recursive: true });
    db = new DB(testDir, 'test.db');

    // Create test data
    db.upsertTask('T-TEST-001', 'Test Task 1', 'Test task for projection', null);
    db.upsertTask('T-TEST-002', 'Test Task 2', 'Another test task', null);

    // Create requirements
    db.submitRequirements({
      id: 'REQ-001',
      todo_id: 'T-TEST-001',
      raw_markdown: '# Requirements\n\n- Requirement 1\n- Requirement 2',
      idempotency_key: 'req-proj-1'
    });

    // Create testcases
    db.submitTestCases({
      id: 'TC-001',
      requirements_id: 'REQ-001',
      todo_id: 'T-TEST-001',
      raw_markdown: '# Test Cases\n\n## TC-1: Test Case 1\n- Given: ...\n- When: ...\n- Then: ...',
      idempotency_key: 'tc-proj-1'
    });

    registerProjectionHandlers(register, db);
  });

  afterEach(() => {
    // Close database
    if (db) {
      db.close();
    }

    // Cleanup test directory
    if (fs.existsSync(testOutputDir)) {
      try {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors on Windows
      }
    }
  });

  describe('projection.requirements', () => {
    it('should project requirements to .specify/requirements/{todo_id}.md', async () => {
      const handler = handlers.get('projection.requirements')!;
      const specifyDir = path.join(testOutputDir, '.specify');

      const result = await handler({
        todo_id: 'T-TEST-001',
        specify_dir: specifyDir
      });

      expect(result.ok).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file).toContain('T-TEST-001.md');

      // Verify file was created
      const expectedFile = path.join(specifyDir, 'requirements', 'T-TEST-001.md');
      expect(fs.existsSync(expectedFile)).toBe(true);

      // Verify file content
      const content = fs.readFileSync(expectedFile, 'utf-8');
      expect(content).toContain('# Requirements');
      expect(content).toContain('Requirement 1');
      expect(content).toContain('Requirement 2');
    });

    it('should reject missing todo_id', async () => {
      const handler = handlers.get('projection.requirements')!;
      const result = await handler({});

      expect(result.ok).toBe(false);
      expect(result.error).toBe('todo_id is required');
    });

    it('should return error for non-existent requirements', async () => {
      const handler = handlers.get('projection.requirements')!;
      const specifyDir = path.join(testOutputDir, '.specify');

      const result = await handler({
        todo_id: 'T-NONEXISTENT',
        specify_dir: specifyDir
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('requirements_not_found');
    });

    it('should use default .specify directory if not specified', async () => {
      const handler = handlers.get('projection.requirements')!;

      const result = await handler({
        todo_id: 'T-TEST-001'
      });

      expect(result.ok).toBe(true);
      expect(result.file).toContain('.specify');
    });
  });

  describe('projection.testcases', () => {
    it('should project testcases to .specify/testcases/{todo_id}.md', async () => {
      const handler = handlers.get('projection.testcases')!;
      const specifyDir = path.join(testOutputDir, '.specify');

      const result = await handler({
        todo_id: 'T-TEST-001',
        specify_dir: specifyDir
      });

      expect(result.ok).toBe(true);
      expect(result.file).toBeDefined();
      expect(result.file).toContain('T-TEST-001.md');

      // Verify file was created
      const expectedFile = path.join(specifyDir, 'testcases', 'T-TEST-001.md');
      expect(fs.existsSync(expectedFile)).toBe(true);

      // Verify file content
      const content = fs.readFileSync(expectedFile, 'utf-8');
      expect(content).toContain('# Test Cases');
      expect(content).toContain('TC-1');
    });

    it('should reject missing todo_id', async () => {
      const handler = handlers.get('projection.testcases')!;
      const result = await handler({});

      expect(result.ok).toBe(false);
      expect(result.error).toBe('todo_id is required');
    });

    it('should return error for non-existent testcases', async () => {
      const handler = handlers.get('projection.testcases')!;
      const specifyDir = path.join(testOutputDir, '.specify');

      const result = await handler({
        todo_id: 'T-TEST-002',
        specify_dir: specifyDir
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('testcases_not_found');
    });
  });

  describe('projection.all', () => {
    it('should project all data (TODO.md + .specify/**)', async () => {
      const handler = handlers.get('projection.all')!;
      const outputDir = testOutputDir;
      const specifyDir = path.join(testOutputDir, '.specify');

      const result = await handler({
        output_dir: outputDir,
        specify_dir: specifyDir
      });

      expect(result.ok).toBe(true);
      expect(result.todo_md).toBeDefined();
      expect(result.requirements).toBeDefined();
      expect(result.testcases).toBeDefined();

      // Verify TODO.md was created
      const todoMdPath = path.join(outputDir, 'TODO.md');
      expect(fs.existsSync(todoMdPath)).toBe(true);

      const todoMdContent = fs.readFileSync(todoMdPath, 'utf-8');
      expect(todoMdContent).toContain('# Tasks');
      expect(todoMdContent).toContain('T-TEST-001');
      expect(todoMdContent).toContain('Test Task 1');

      // Verify requirements were projected
      expect(result.requirements.length).toBe(1);
      const reqFile = path.join(specifyDir, 'requirements', 'T-TEST-001.md');
      expect(fs.existsSync(reqFile)).toBe(true);

      // Verify testcases were projected
      expect(result.testcases.length).toBe(1);
      const tcFile = path.join(specifyDir, 'testcases', 'T-TEST-001.md');
      expect(fs.existsSync(tcFile)).toBe(true);
    });

    it('should use default directories if not specified', async () => {
      const handler = handlers.get('projection.all')!;

      const result = await handler({});

      expect(result.ok).toBe(true);
      expect(result.todo_md).toContain('TODO.md');
    });

    it('should handle empty requirements and testcases', async () => {
      const handler = handlers.get('projection.all')!;

      // Create a new database with no requirements/testcases
      const emptyTestDir = path.join(process.cwd(), '.test-output', `empty-${Date.now()}`);
      fs.mkdirSync(emptyTestDir, { recursive: true });
      const emptyDb = new DB(emptyTestDir, 'empty.db');
      emptyDb.upsertTask('T-EMPTY', 'Empty Task', 'Task without requirements', null);

      const emptyHandlers = new Map();
      const emptyRegister = (method: string, handler: (params: any) => Promise<any>) => {
        emptyHandlers.set(method, handler);
      };
      registerProjectionHandlers(emptyRegister, emptyDb);

      const emptyHandler = emptyHandlers.get('projection.all')!;
      const result = await emptyHandler({
        output_dir: emptyTestDir,
        specify_dir: path.join(emptyTestDir, '.specify')
      });

      expect(result.ok).toBe(true);
      expect(result.todo_md).toBeDefined();
      expect(result.requirements.length).toBe(0);
      expect(result.testcases.length).toBe(0);

      // Cleanup
      emptyDb.close();
      fs.rmSync(emptyTestDir, { recursive: true, force: true });
    });
  });
});
