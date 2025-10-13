import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerNoteHandlers } from '../../src/mcp/note.js';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('Note API', () => {
  let handlers: Map<string, (params: any, ctx?: any) => Promise<any>>;
  let db: DB;
  let dbPath: string;

  beforeEach(() => {
    handlers = new Map();
    const register = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
      handlers.set(method, handler);
    };

    // Create test database
    dbPath = path.join(process.cwd(), '.test-output', `note-test-${Date.now()}.db`);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DB(path.dirname(dbPath), path.basename(dbPath));

    // Create a test task
    db.upsertTask('T-TEST-001', 'Test Task', 'Test task for Note API', null);

    registerNoteHandlers(register, db);
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

  describe('note.put', () => {
    it('should put a note with text', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        kind: 'tdd-summary',
        text: 'All tests passed successfully',
        idempotency_key: 'note-idem-1'
      });

      expect(result.ok).toBe(true);
      expect(result.note_id).toBeDefined();
      expect(typeof result.note_id).toBe('string');
    });

    it('should put a note with URL', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        kind: 'artifact',
        url: 'https://example.com/report.html',
        idempotency_key: 'note-idem-2'
      });

      expect(result.ok).toBe(true);
      expect(result.note_id).toBeDefined();
    });

    it('should put a note with both text and URL', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        kind: 'memo',
        text: 'Check this report',
        url: 'https://example.com/report.html',
        idempotency_key: 'note-idem-3'
      });

      expect(result.ok).toBe(true);
      expect(result.note_id).toBeDefined();
    });

    it('should reject missing todo_id', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        kind: 'memo',
        text: 'Test note',
        idempotency_key: 'note-idem-4'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('todo_id is required');
    });

    it('should reject missing kind', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        text: 'Test note',
        idempotency_key: 'note-idem-5'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('kind is required');
    });

    it('should reject missing both text and URL', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        kind: 'memo',
        idempotency_key: 'note-idem-6'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('text or url');
    });

    it('should reject missing idempotency_key', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        todo_id: 'T-TEST-001',
        kind: 'memo',
        text: 'Test note'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('idempotency_key is required');
    });

    it('should enforce idempotency', async () => {
      const handler = handlers.get('note.put')!;

      const result1 = await handler({
        todo_id: 'T-TEST-001',
        kind: 'memo',
        text: 'First version',
        idempotency_key: 'note-idem-same'
      });

      const result2 = await handler({
        todo_id: 'T-TEST-001',
        kind: 'memo',
        text: 'Second version',
        idempotency_key: 'note-idem-same'
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      expect(result1.note_id).toBe(result2.note_id);
    });

    it('should reject non-existent todo_id', async () => {
      const handler = handlers.get('note.put')!;
      const result = await handler({
        todo_id: 'T-NONEXISTENT',
        kind: 'memo',
        text: 'Test note',
        idempotency_key: 'note-idem-7'
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('todo_not_found');
    });
  });

  describe('note.get', () => {
    it('should retrieve a note by id', async () => {
      const putHandler = handlers.get('note.put')!;
      const getHandler = handlers.get('note.get')!;

      const putResult = await putHandler({
        todo_id: 'T-TEST-001',
        kind: 'tdd-summary',
        text: 'All tests passed',
        idempotency_key: 'note-get-1'
      });

      const getResult = await getHandler({ id: putResult.note_id });

      expect(getResult.ok).toBe(true);
      expect(getResult.note).toBeDefined();
      expect(getResult.note.id).toBe(putResult.note_id);
      expect(getResult.note.todo_id).toBe('T-TEST-001');
      expect(getResult.note.kind).toBe('tdd-summary');
      expect(getResult.note.text).toBe('All tests passed');
    });

    it('should return error for non-existent note', async () => {
      const handler = handlers.get('note.get')!;
      const result = await handler({ id: 'NOTE-NONEXISTENT' });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('note_not_found');
    });

    it('should reject missing id', async () => {
      const handler = handlers.get('note.get')!;
      const result = await handler({});

      expect(result.ok).toBe(false);
      expect(result.error).toBe('id is required');
    });
  });

  describe('note.list', () => {
    beforeEach(async () => {
      const handler = handlers.get('note.put')!;

      // Create multiple notes
      await handler({
        todo_id: 'T-TEST-001',
        kind: 'tdd-summary',
        text: 'Test summary 1',
        idempotency_key: 'note-list-1'
      });

      await handler({
        todo_id: 'T-TEST-001',
        kind: 'memo',
        text: 'Memo 1',
        idempotency_key: 'note-list-2'
      });

      await handler({
        todo_id: 'T-TEST-001',
        kind: 'tdd-summary',
        text: 'Test summary 2',
        idempotency_key: 'note-list-3'
      });
    });

    it('should list all notes', async () => {
      const handler = handlers.get('note.list')!;
      const result = await handler({});

      expect(result.ok).toBe(true);
      expect(result.notes).toBeDefined();
      expect(Array.isArray(result.notes)).toBe(true);
      expect(result.notes.length).toBe(3);
    });

    it('should list notes by todo_id', async () => {
      const handler = handlers.get('note.list')!;
      const result = await handler({ todo_id: 'T-TEST-001' });

      expect(result.ok).toBe(true);
      expect(result.notes.length).toBe(3);
      expect(result.notes.every((n: any) => n.todo_id === 'T-TEST-001')).toBe(true);
    });

    it('should list notes by kind', async () => {
      const handler = handlers.get('note.list')!;
      const result = await handler({ kind: 'tdd-summary' });

      expect(result.ok).toBe(true);
      expect(result.notes.length).toBe(2);
      expect(result.notes.every((n: any) => n.kind === 'tdd-summary')).toBe(true);
    });

    it('should list notes by both todo_id and kind', async () => {
      const handler = handlers.get('note.list')!;
      const result = await handler({ todo_id: 'T-TEST-001', kind: 'memo' });

      expect(result.ok).toBe(true);
      expect(result.notes.length).toBe(1);
      expect(result.notes[0].kind).toBe('memo');
      expect(result.notes[0].todo_id).toBe('T-TEST-001');
    });

    it('should return empty array when no notes match', async () => {
      const handler = handlers.get('note.list')!;
      const result = await handler({ kind: 'nonexistent-kind' });

      expect(result.ok).toBe(true);
      expect(result.notes.length).toBe(0);
    });
  });
});
