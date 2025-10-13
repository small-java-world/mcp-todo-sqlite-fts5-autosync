import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerUtHandlers } from '../../src/mcp/ut.js';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('UT Requirements/TestCases API', () => {
  let handlers: Map<string, (params: any, ctx?: any) => Promise<any>>;
  let db: DB;
  let dbPath: string;

  beforeEach(() => {
    handlers = new Map();
    const register = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
      handlers.set(method, handler);
    };

    // Create test database
    dbPath = path.join(process.cwd(), '.test-output', `ut-test-${Date.now()}.db`);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DB(path.dirname(dbPath), path.basename(dbPath));

    // Create a test task
    db.upsertTask('T-TEST-001', 'Test Task', 'Test task for UT API', null);

    registerUtHandlers(register, db);
  });

  afterEach(() => {
    // Close database
    if (db) {
      db.close();
    }

    // Cleanup database file (best effort on Windows)
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (e) {
        // Ignore EPERM errors on Windows
      }
    }
  });

  describe('ut.requirements.submit', () => {
    it('should submit requirements with markdown', async () => {
      const handler = handlers.get('ut.requirements.submit')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements\n\n- User must be authenticated\n- Data must be validated',
        idempotency_key: 'req-idem-1'
      });

      expect(result.ok).toBe(true);
      expect(result.requirements_id).toBeDefined();
      expect(typeof result.requirements_id).toBe('string');
    });

    it('should submit requirements with JSON', async () => {
      const handler = handlers.get('ut.requirements.submit')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        raw_json: JSON.stringify({
          assumptions: ['User is authenticated'],
          invariants: ['Data is valid']
        }),
        idempotency_key: 'req-idem-2'
      });

      expect(result.ok).toBe(true);
      expect(result.requirements_id).toBeDefined();
    });

    it('should reject missing todo_id', async () => {
      const handler = handlers.get('ut.requirements.submit')!;
      const result = await handler({
        raw_markdown: '# Requirements',
        idempotency_key: 'req-idem-3'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('todo_id is required');
    });

    it('should reject missing both raw_markdown and raw_json', async () => {
      const handler = handlers.get('ut.requirements.submit')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        idempotency_key: 'req-idem-4'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('raw_markdown or raw_json');
    });

    it('should enforce idempotency', async () => {
      const handler = handlers.get('ut.requirements.submit')!;

      const result1 = await handler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements v1',
        idempotency_key: 'req-idem-same'
      });

      const result2 = await handler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements v2',
        idempotency_key: 'req-idem-same'
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.requirements_id).toBe(result2.requirements_id);
    });

    it('should update existing requirements for the same todo_id', async () => {
      const handler = handlers.get('ut.requirements.submit')!;
      const getHandler = handlers.get('ut.requirements.get')!;

      const result1 = await handler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements v1',
        idempotency_key: 'req-idem-5'
      });

      const result2 = await handler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements v2 - Updated',
        idempotency_key: 'req-idem-6'
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.requirements_id).toBe(result2.requirements_id);

      const getResult = await getHandler({ id: result2.requirements_id });
      expect(getResult.requirements.raw_markdown).toContain('Updated');
    });
  });

  describe('ut.requirements.get', () => {
    it('should retrieve requirements by id', async () => {
      const submitHandler = handlers.get('ut.requirements.submit')!;
      const getHandler = handlers.get('ut.requirements.get')!;

      const submitResult = await submitHandler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements\n\n- Requirement 1',
        idempotency_key: 'req-get-1'
      });

      const getResult = await getHandler({ id: submitResult.requirements_id });

      expect(getResult.ok).toBe(true);
      expect(getResult.requirements).toBeDefined();
      expect(getResult.requirements.id).toBe(submitResult.requirements_id);
      expect(getResult.requirements.todo_id).toBe('T-TEST-001');
      expect(getResult.requirements.raw_markdown).toContain('Requirement 1');
    });

    it('should retrieve requirements by todo_id', async () => {
      const submitHandler = handlers.get('ut.requirements.submit')!;
      const getHandler = handlers.get('ut.requirements.get')!;

      await submitHandler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements',
        idempotency_key: 'req-get-2'
      });

      const getResult = await getHandler({ todo_id: 'T-TEST-001' });

      expect(getResult.ok).toBe(true);
      expect(getResult.requirements).toBeDefined();
      expect(getResult.requirements.todo_id).toBe('T-TEST-001');
    });
  });

  describe('ut.testcases.submit', () => {
    let requirementsId: string;

    beforeEach(async () => {
      // Create requirements first
      const reqHandler = handlers.get('ut.requirements.submit')!;
      const reqResult = await reqHandler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements',
        idempotency_key: `req-for-tc-${Date.now()}`
      });
      requirementsId = reqResult.requirements_id!;
    });

    it('should submit testcases with markdown', async () => {
      const handler = handlers.get('ut.testcases.submit')!;
      const result = await handler({
        requirements_id: requirementsId,
        todo_id: 'T-TEST-001',
        raw_markdown: '# Test Cases\n\n## TC-1: Login Test\n- Given: User on login page\n- When: Enter valid credentials\n- Then: User is authenticated',
        idempotency_key: 'tc-idem-1'
      });

      expect(result.ok).toBe(true);
      expect(result.testcases_id).toBeDefined();
    });

    it('should submit testcases with JSON', async () => {
      const handler = handlers.get('ut.testcases.submit')!;
      const result = await handler({
        requirements_id: requirementsId,
        raw_json: JSON.stringify({
          cases: [
            { id: 'TC-1', inputs: { user: 'admin' }, expected: 'success' }
          ]
        }),
        idempotency_key: 'tc-idem-2'
      });

      expect(result.ok).toBe(true);
      expect(result.testcases_id).toBeDefined();
    });

    it('should infer todo_id from requirements if not provided', async () => {
      const handler = handlers.get('ut.testcases.submit')!;
      const result = await handler({
        requirements_id: requirementsId,
        // No todo_id provided
        raw_markdown: '# Test Cases',
        idempotency_key: 'tc-idem-3'
      });

      expect(result.ok).toBe(true);
      expect(result.testcases_id).toBeDefined();
    });

    it('should reject non-existent requirements_id', async () => {
      const handler = handlers.get('ut.testcases.submit')!;
      const result = await handler({
        requirements_id: 'REQ-NONEXISTENT',
        raw_markdown: '# Test Cases',
        idempotency_key: 'tc-idem-4'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('requirements_not_found');
    });

    it('should enforce idempotency', async () => {
      const handler = handlers.get('ut.testcases.submit')!;

      const result1 = await handler({
        requirements_id: requirementsId,
        raw_markdown: '# Test Cases v1',
        idempotency_key: 'tc-idem-same'
      });

      const result2 = await handler({
        requirements_id: requirementsId,
        raw_markdown: '# Test Cases v2',
        idempotency_key: 'tc-idem-same'
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.testcases_id).toBe(result2.testcases_id);
    });
  });

  describe('ut.testcases.get', () => {
    let requirementsId: string;
    let testcasesId: string;

    beforeEach(async () => {
      // Create requirements and testcases
      const reqHandler = handlers.get('ut.requirements.submit')!;
      const reqResult = await reqHandler({
        todo_id: 'T-TEST-001',
        raw_markdown: '# Requirements',
        idempotency_key: `req-for-tc-get-${Date.now()}`
      });
      requirementsId = reqResult.requirements_id!;

      const tcHandler = handlers.get('ut.testcases.submit')!;
      const tcResult = await tcHandler({
        requirements_id: requirementsId,
        raw_markdown: '# Test Cases',
        idempotency_key: `tc-for-get-${Date.now()}`
      });
      testcasesId = tcResult.testcases_id!;
    });

    it('should retrieve testcases by id', async () => {
      const handler = handlers.get('ut.testcases.get')!;
      const result = await handler({ id: testcasesId });

      expect(result.ok).toBe(true);
      expect(result.testcases).toBeDefined();
      expect(result.testcases.id).toBe(testcasesId);
      expect(result.testcases.requirements_id).toBe(requirementsId);
    });

    it('should retrieve testcases by requirements_id', async () => {
      const handler = handlers.get('ut.testcases.get')!;
      const result = await handler({ requirements_id: requirementsId });

      expect(result.ok).toBe(true);
      expect(result.testcases).toBeDefined();
      expect(result.testcases.requirements_id).toBe(requirementsId);
    });

    it('should retrieve testcases by todo_id', async () => {
      const handler = handlers.get('ut.testcases.get')!;
      const result = await handler({ todo_id: 'T-TEST-001' });

      expect(result.ok).toBe(true);
      expect(result.testcases).toBeDefined();
      expect(Array.isArray(result.testcases)).toBe(true);
    });
  });
});
