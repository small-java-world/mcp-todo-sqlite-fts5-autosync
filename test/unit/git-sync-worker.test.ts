import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { DB } from '../../src/utils/db.js';
import { GitSyncWorker } from '../../src/server/git-sync-worker.js';

const TEST_ROOT = path.resolve('.test-output', `git-sync-worker-${Date.now()}`);
let suiteCounter = 0;

const silentLogger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

describe('GitSyncWorker', () => {
  let baseDir: string;
  let repoDir: string;
  let dataDir: string;
  let db: DB;
  let worker: GitSyncWorker | null;

  const runGit = (args: string[], cwd: string): string => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf-8',
    });
    if (result.error) {
      throw result.error;
    }
    if ((result.status ?? 0) !== 0) {
      const stderr = (result.stderr ?? '').trim();
      const stdout = (result.stdout ?? '').trim();
      throw new Error(`git ${args.join(' ')} failed: ${stderr || stdout}`);
    }
    return (result.stdout ?? '').trim();
  };

  const createWorker = (overrides: Partial<ConstructorParameters<typeof GitSyncWorker>[0]> = {}): GitSyncWorker => {
    const instance = new GitSyncWorker({
      db,
      shadowPath: path.join(dataDir, 'shadow', 'TODO.shadow.md'),
      repoRoot: repoDir,
      specifyDir: path.join(repoDir, '.specify'),
      debounceMs: 10,
      pollIntervalMs: 20,
      commitOnWrite: false,
      autoPush: false,
      messageTemplate: 'chore(todos): {summary}\n\nRefs: {taskIds}\n\n{signoff}',
      signoff: true,
      remote: 'origin',
      branch: 'main',
      logger: silentLogger,
      ...overrides,
    });
    worker = instance;
    return instance;
  };

  beforeEach(() => {
    suiteCounter += 1;
    baseDir = path.join(TEST_ROOT, `case-${suiteCounter}`);
    repoDir = path.join(baseDir, 'repo');
    dataDir = path.join(baseDir, 'data');

    fs.mkdirSync(repoDir, { recursive: true });
    runGit(['init'], repoDir);
    runGit(['checkout', '-b', 'main'], repoDir);
    runGit(['config', 'user.name', 'Sync Bot'], repoDir);
    runGit(['config', 'user.email', 'sync@example.com'], repoDir);

    fs.mkdirSync(dataDir, { recursive: true });
    db = new DB(dataDir, 'todo.db', path.join(dataDir, 'cas'));
    worker = null;
  });

  afterEach(() => {
    try {
      worker?.stop();
    } catch (e) {
      // ignore
    }
    try {
      db?.close();
    } catch (e) {
      // ignore
    }
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('projects files without committing when commitOnWrite=false', async () => {
    db.upsertTask('T-100', 'Sample Task', 'Body');
    const syncWorker = createWorker({ commitOnWrite: false });

    const outcome = await syncWorker.forceSync('test');

    expect(outcome.ok).toBe(true);
    expect(outcome.committed).toBe(false);
    expect(outcome.skippedReason).toBe('commit_on_write_disabled');
    expect(fs.existsSync(path.join(repoDir, 'TODO.md'))).toBe(true);
  });

  it('creates a commit with task references when commitOnWrite=true', async () => {
    db.upsertTask('T-101', 'Commit Task', 'Ensure commit happens');
    const syncWorker = createWorker({ commitOnWrite: true });

    const outcome = await syncWorker.forceSync('commit');

    expect(outcome.ok).toBe(true);
    expect(outcome.committed).toBe(true);
    expect(outcome.commitMessage).toBeDefined();
    const status = runGit(['status', '--porcelain'], repoDir);
    expect(status).toBe('');
    const log = runGit(['log', '-1', '--pretty=%B'], repoDir);
    expect(log).toContain('T-101');
    expect(log).toContain('Signed-off-by:');
  });

  it('skips commit when there are no new changes', async () => {
    db.upsertTask('T-102', 'Idempotent Task', 'Initial content');
    const syncWorker = createWorker({ commitOnWrite: true });

    const first = await syncWorker.forceSync('initial');
    expect(first.committed).toBe(true);

    const second = await syncWorker.forceSync('noop');
    expect(second.committed).toBe(false);
    expect(second.skippedReason).toBe('no_changes');

    const commitCount = runGit(['rev-list', '--count', 'HEAD'], repoDir);
    expect(commitCount).toBe('1');
  });

  it('continues successfully even if git push fails', async () => {
    db.upsertTask('T-103', 'Push Task', 'Trigger push attempt');
    const syncWorker = createWorker({ commitOnWrite: true, autoPush: true, remote: 'origin', branch: 'main' });

    const outcome = await syncWorker.forceSync('push');

    expect(outcome.ok).toBe(true);
    expect(outcome.committed).toBe(true);
    expect(outcome.pushed).toBe(false);
  });
});
