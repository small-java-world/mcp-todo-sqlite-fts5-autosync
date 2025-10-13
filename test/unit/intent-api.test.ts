import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerIntentHandlers } from '../../src/mcp/intent.js';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('Intent API', () => {
  let handlers: Map<string, (params: any, ctx?: any) => Promise<any>>;
  let db: DB;
  let dbPath: string;

  beforeEach(() => {
    handlers = new Map();
    const register = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
      handlers.set(method, handler);
    };

    // Create test database
    dbPath = path.join(process.cwd(), '.test-output', `intent-test-${Date.now()}.db`);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DB(path.dirname(dbPath), path.basename(dbPath));

    // Create a test task
    db.upsertTask('T-TEST-001', 'Test Task', 'Test task for intent API', null);

    registerIntentHandlers(register, db);
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

  describe('intent.create', () => {
    it('should create a new intent with elicitation type', async () => {
      const handler = handlers.get('intent.create')!;
      const result = await handler({
        intent_type: 'elicitation',
        todo_id: 'T-TEST-001',
        message: 'Extract requirements for this task',
        idempotency_key: 'idem-1'
      });

      expect(result.ok).toBe(true);
      expect(result.intent_id).toBeDefined();
      expect(typeof result.intent_id).toBe('string');
    });

    it('should create a new intent with tdd_cycle type', async () => {
      const handler = handlers.get('intent.create')!;
      const result = await handler({
        intent_type: 'tdd_cycle',
        todo_id: 'T-TEST-001',
        message: 'Run TDD cycle for this task',
        created_by: 'test-user',
        idempotency_key: 'idem-2'
      });

      expect(result.ok).toBe(true);
      expect(result.intent_id).toBeDefined();
    });

    it('should reject invalid intent_type', async () => {
      const handler = handlers.get('intent.create')!;
      const result = await handler({
        intent_type: 'invalid_type',
        todo_id: 'T-TEST-001',
        idempotency_key: 'idem-3'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('invalid intent_type');
    });

    it('should reject missing todo_id', async () => {
      const handler = handlers.get('intent.create')!;
      const result = await handler({
        intent_type: 'elicitation',
        idempotency_key: 'idem-4'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('todo_id is required');
    });

    it('should reject non-existent todo_id', async () => {
      const handler = handlers.get('intent.create')!;
      const result = await handler({
        intent_type: 'elicitation',
        todo_id: 'T-NONEXISTENT',
        idempotency_key: 'idem-5'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('todo_not_found');
    });

    it('should enforce idempotency', async () => {
      const handler = handlers.get('intent.create')!;

      const result1 = await handler({
        intent_type: 'elicitation',
        todo_id: 'T-TEST-001',
        idempotency_key: 'idem-same'
      });

      const result2 = await handler({
        intent_type: 'elicitation',
        todo_id: 'T-TEST-001',
        idempotency_key: 'idem-same'
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.intent_id).toBe(result2.intent_id);
    });
  });

  describe('intent.get', () => {
    it('should retrieve an existing intent', async () => {
      const createHandler = handlers.get('intent.create')!;
      const getHandler = handlers.get('intent.get')!;

      const createResult = await createHandler({
        intent_type: 'elicitation',
        todo_id: 'T-TEST-001',
        message: 'Test message',
        idempotency_key: 'idem-get-1'
      });

      const getResult = await getHandler({ id: createResult.intent_id });

      expect(getResult.ok).toBe(true);
      expect(getResult.intent).toBeDefined();
      expect(getResult.intent.id).toBe(createResult.intent_id);
      expect(getResult.intent.intent_type).toBe('elicitation');
      expect(getResult.intent.todo_id).toBe('T-TEST-001');
      expect(getResult.intent.status).toBe('pending');
    });

    it('should return error for non-existent intent', async () => {
      const handler = handlers.get('intent.get')!;
      const result = await handler({ id: 'INTENT-NONEXISTENT' });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('intent_not_found');
    });
  });

  describe('intent.list', () => {
    beforeEach(async () => {
      const handler = handlers.get('intent.create')!;

      await handler({
        intent_type: 'elicitation',
        todo_id: 'T-TEST-001',
        idempotency_key: 'idem-list-1'
      });

      await handler({
        intent_type: 'tdd_cycle',
        todo_id: 'T-TEST-001',
        idempotency_key: 'idem-list-2'
      });
    });

    it('should list all intents', async () => {
      const handler = handlers.get('intent.list')!;
      const result = await handler({});

      expect(result.ok).toBe(true);
      expect(result.intents).toBeDefined();
      expect(Array.isArray(result.intents)).toBe(true);
      expect(result.intents.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter intents by todo_id', async () => {
      const handler = handlers.get('intent.list')!;
      const result = await handler({ todo_id: 'T-TEST-001' });

      expect(result.ok).toBe(true);
      expect(result.intents.length).toBeGreaterThanOrEqual(2);
      expect(result.intents.every((i: any) => i.todo_id === 'T-TEST-001')).toBe(true);
    });

    it('should filter intents by status', async () => {
      const handler = handlers.get('intent.list')!;
      const result = await handler({ status: 'pending' });

      expect(result.ok).toBe(true);
      expect(result.intents.every((i: any) => i.status === 'pending')).toBe(true);
    });
  });

  describe('intent.complete', () => {
    it('should mark an intent as completed', async () => {
      const createHandler = handlers.get('intent.create')!;
      const completeHandler = handlers.get('intent.complete')!;
      const getHandler = handlers.get('intent.get')!;

      const createResult = await createHandler({
        intent_type: 'elicitation',
        todo_id: 'T-TEST-001',
        idempotency_key: 'idem-complete-1'
      });

      const completeResult = await completeHandler({ id: createResult.intent_id });
      expect(completeResult.ok).toBe(true);

      const getResult = await getHandler({ id: createResult.intent_id });
      expect(getResult.intent.status).toBe('completed');
      expect(getResult.intent.completed_at).toBeDefined();
    });

    it('should return error for non-existent intent', async () => {
      const handler = handlers.get('intent.complete')!;
      const result = await handler({ id: 'INTENT-NONEXISTENT' });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('intent_not_found');
    });
  });
});
