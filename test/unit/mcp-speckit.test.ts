import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerSpeckitBridge } from '../../src/mcp/speckit.js';
import { DB } from '../../src/utils/db.js';
import fs from 'fs';
import path from 'path';

describe('registerSpeckitBridge', () => {
  let handlers: Map<string, (params: any, ctx?: any) => Promise<any>>;
  let db: DB;
  let testDir: string;

  beforeEach(() => {
    handlers = new Map();
    const register = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
      handlers.set(method, handler);
    };
    // minimal DB for speckit bridge (only used when todo_id is provided)
    db = new DB('.tmp-test', 'speckit.db', '.tmp-test/cas');
    registerSpeckitBridge(register, db);

    // Create temp directory for test output
    testDir = path.join(process.cwd(), '.test-output', `speckit-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Cleanup .specify directory if it exists
    const specifyDir = path.join(process.cwd(), '.specify');
    if (fs.existsSync(specifyDir)) {
      fs.rmSync(specifyDir, { recursive: true, force: true });
    }
    try { db.close(); } catch {}
    if (fs.existsSync('.tmp-test')) {
      fs.rmSync('.tmp-test', { recursive: true, force: true });
    }
  });

  it('should register speckit.run handler', () => {
    expect(handlers.has('speckit.run')).toBe(true);
  });

  it('should generate tasks.md for /speckit.tasks command', async () => {
    const handler = handlers.get('speckit.run')!;
    const result = await handler({ cmd: '/speckit.tasks' });

    expect(result.ok).toBe(true);
    expect(result.generated).toBeDefined();
    expect(result.generated).toContain('.specify');
    expect(result.generated).toContain('tasks.md');

    // Verify file was created
    expect(fs.existsSync(result.generated)).toBe(true);

    // Verify file content
    const content = fs.readFileSync(result.generated, 'utf8');
    expect(content).toContain('# Tasks (dummy)');
    expect(content).toContain('[AC-1]');
    expect(content).toContain('[AC-2]');
  });

  it('should reject commands not starting with /speckit.', async () => {
    const handler = handlers.get('speckit.run')!;

    await expect(handler({ cmd: '/invalid' })).rejects.toThrow(
      'speckit.run: cmd must start with /speckit.'
    );
  });

  it('should return not-implemented for unknown speckit commands', async () => {
    const handler = handlers.get('speckit.run')!;
    const result = await handler({ cmd: '/speckit.unknown' });

    expect(result.ok).toBe(false);
    expect(result.note).toBe('not-implemented');
  });

  it('should handle missing cmd parameter', async () => {
    const handler = handlers.get('speckit.run')!;

    await expect(handler({})).rejects.toThrow(
      'speckit.run: cmd must start with /speckit.'
    );
  });

  it('should create nested directories as needed', async () => {
    const handler = handlers.get('speckit.run')!;

    // Remove .specify directory if it exists
    const specifyDir = path.join(process.cwd(), '.specify');
    if (fs.existsSync(specifyDir)) {
      fs.rmSync(specifyDir, { recursive: true, force: true });
    }

    const result = await handler({ cmd: '/speckit.tasks' });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), '.specify', 'demo'))).toBe(true);
  });

  it('should index worktree-relative url when todo_id is provided', async () => {
    const handler = handlers.get('speckit.run')!;
    // ensure task exists so note.put can link to it
    db.upsertTask('T-REL-1', 'Rel Test', 'body', undefined, undefined);
    const result = await handler({ cmd: '/speckit.tasks', todo_id: 'T-REL-1', created_by: 'tester' });
    expect(result.ok).toBe(true);
    const notes = db.listNotes('T-REL-1', 'spec_tasks');
    expect(notes.length).toBeGreaterThan(0);
    const url = String(notes[0].url || '');
    // should not include drive letter absolute prefix; expect relative path
    expect(/^[A-Za-z]:[\/]/.test(url)).toBe(false);
  });
});
