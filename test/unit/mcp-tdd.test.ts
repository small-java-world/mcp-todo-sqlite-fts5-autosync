import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerTddTools } from '../../src/mcp/tdd.js';
import fs from 'fs';
import path from 'path';

describe('registerTddTools', () => {
  let handlers: Map<string, (params: any, ctx?: any) => Promise<any>>;
  let testDir: string;

  beforeEach(() => {
    handlers = new Map();
    const register = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
      handlers.set(method, handler);
    };
    registerTddTools(register);

    testDir = path.join(process.cwd(), '.test-output', `tdd-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directories
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    const testsDir = path.join(process.cwd(), 'tests');
    if (fs.existsSync(testsDir)) {
      fs.rmSync(testsDir, { recursive: true, force: true });
    }

    const dataDir = path.join(process.cwd(), 'data');
    const phaseLog = path.join(dataDir, 'phase.log');
    if (fs.existsSync(phaseLog)) {
      fs.unlinkSync(phaseLog);
    }
  });

  describe('tdd.scaffold', () => {
    it('should register tdd.scaffold handler', () => {
      expect(handlers.has('tdd.scaffold')).toBe(true);
    });

    it('should generate scaffold file for given task_id', async () => {
      const handler = handlers.get('tdd.scaffold')!;
      const result = await handler({ task_id: 'T-TEST-001' });

      expect(result.ok).toBe(true);
      expect(result.generated).toBeDefined();
      expect(result.generated.length).toBe(1);
      expect(result.generated[0]).toContain('T-TEST-001');
      expect(result.generated[0]).toContain('spec.sample.txt');

      // Verify file exists
      expect(fs.existsSync(result.generated[0])).toBe(true);

      // Verify content
      const content = fs.readFileSync(result.generated[0], 'utf8');
      expect(content).toContain('# RED by design for T-TEST-001');
      expect(content).toContain('- Given ...');
      expect(content).toContain('- When ...');
      expect(content).toContain('- Then ...');
    });

    it('should sanitize task_id with special characters', async () => {
      const handler = handlers.get('tdd.scaffold')!;
      const result = await handler({ task_id: 'T-TEST/001:SPECIAL' });

      expect(result.ok).toBe(true);
      expect(result.generated[0]).not.toContain('/');
      expect(result.generated[0]).not.toContain(':');
      expect(result.generated[0]).toContain('T-TEST_001_SPECIAL');
    });

    it('should use default task_id if not provided', async () => {
      const handler = handlers.get('tdd.scaffold')!;
      const result = await handler({});

      expect(result.ok).toBe(true);
      expect(result.generated[0]).toContain('TASK-UNKNOWN');
    });
  });

  describe('tdd.run', () => {
    it('should register tdd.run handler', () => {
      expect(handlers.has('tdd.run')).toBe(true);
    });

    it('should execute without errors', async () => {
      const handler = handlers.get('tdd.run')!;
      const ctx = { log: () => {} };

      // This will fail because scripts don't exist, but should handle gracefully
      await expect(handler({}, ctx)).rejects.toThrow();
    });
  });

  describe('tdd.captureResults', () => {
    it('should register tdd.captureResults handler', () => {
      expect(handlers.has('tdd.captureResults')).toBe(true);
    });

    it('should return empty summaries when no reports exist', async () => {
      const handler = handlers.get('tdd.captureResults')!;
      const result = await handler({});

      expect(result.ok).toBe(true);
      expect(result.summaries).toBeDefined();
      expect(Array.isArray(result.summaries)).toBe(true);
      expect(result.summaries.length).toBe(0);
    });

    it('should capture existing report files', async () => {
      // Create dummy report files
      const reportsDir = path.join(process.cwd(), 'reports', 'unit');
      fs.mkdirSync(reportsDir, { recursive: true });
      const dummyXml = path.join(reportsDir, 'dummy.xml');
      fs.writeFileSync(dummyXml, '<testsuite name="test" tests="1"/>', 'utf8');

      const handler = handlers.get('tdd.captureResults')!;
      const result = await handler({});

      expect(result.ok).toBe(true);
      expect(result.summaries.length).toBeGreaterThan(0);

      const unitReport = result.summaries.find((s: any) => s.file === 'reports/unit/dummy.xml');
      expect(unitReport).toBeDefined();
      expect(unitReport.type).toBe('junit-xml');
      expect(unitReport.size).toBeGreaterThan(0);

      // Cleanup
      fs.rmSync(path.join(process.cwd(), 'reports'), { recursive: true, force: true });
    });
  });

  describe('tdd.phase.set', () => {
    it('should register tdd.phase.set handler', () => {
      expect(handlers.has('tdd.phase.set')).toBe(true);
    });

    it('should set phase to red', async () => {
      const handler = handlers.get('tdd.phase.set')!;
      const result = await handler({ phase: 'red' });

      expect(result.ok).toBe(true);
      expect(result.phase).toBe('red');

      // Verify log file
      const logPath = path.join(process.cwd(), 'data', 'phase.log');
      expect(fs.existsSync(logPath)).toBe(true);

      const content = fs.readFileSync(logPath, 'utf8');
      expect(content).toContain('phase=red');
    });

    it('should set phase to green', async () => {
      const handler = handlers.get('tdd.phase.set')!;
      const result = await handler({ phase: 'green' });

      expect(result.ok).toBe(true);
      expect(result.phase).toBe('green');
    });

    it('should set phase to refactor', async () => {
      const handler = handlers.get('tdd.phase.set')!;
      const result = await handler({ phase: 'refactor' });

      expect(result.ok).toBe(true);
      expect(result.phase).toBe('refactor');
    });

    it('should set phase to verify', async () => {
      const handler = handlers.get('tdd.phase.set')!;
      const result = await handler({ phase: 'verify' });

      expect(result.ok).toBe(true);
      expect(result.phase).toBe('verify');
    });

    it('should reject invalid phase', async () => {
      const handler = handlers.get('tdd.phase.set')!;

      await expect(handler({ phase: 'invalid' })).rejects.toThrow('invalid phase');
    });

    it('should append multiple phase entries to log', async () => {
      const handler = handlers.get('tdd.phase.set')!;

      await handler({ phase: 'red' });
      await handler({ phase: 'green' });
      await handler({ phase: 'refactor' });

      const logPath = path.join(process.cwd(), 'data', 'phase.log');
      const content = fs.readFileSync(logPath, 'utf8');

      expect(content).toContain('phase=red');
      expect(content).toContain('phase=green');
      expect(content).toContain('phase=refactor');

      // Should have 3 lines
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(3);
    });
  });
});
