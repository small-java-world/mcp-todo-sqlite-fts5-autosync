import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { DB } from '../utils/db.js';

export type GitSyncOutcome = {
  ok: boolean;
  reason: string;
  projection?: {
    todo: string;
    requirements: string[];
    testcases: string[];
  };
  committed?: boolean;
  pushed?: boolean;
  commitMessage?: string;
  skippedReason?: string;
  error?: string;
};

type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

type GitSyncWorkerOptions = {
  db: DB;
  shadowPath: string;
  repoRoot: string;
  specifyDir: string;
  debounceMs: number;
  pollIntervalMs: number;
  commitOnWrite: boolean;
  autoPush: boolean;
  messageTemplate: string;
  signoff: boolean;
  remote?: string;
  branch?: string;
  logger?: Logger;
};

type TaskInfo = { id: string; title?: string };

type NormalizedProjection = {
  todo: string;
  requirements: string[];
  testcases: string[];
};

export class GitSyncWorker {
  private readonly options: GitSyncWorkerOptions;
  private readonly logger: Logger;
  private pollTimer?: NodeJS.Timeout;
  private debounceTimer?: NodeJS.Timeout;
  private lastShadowMtime = 0;
  private running = false;
  private currentRun: Promise<GitSyncOutcome> | null = null;
  private rescheduleReason: string | null = null;
  private cachedSignoff?: string;

  constructor(options: GitSyncWorkerOptions) {
    this.options = options;
    this.logger = options.logger ?? console;
    const stat = this.safeStat(options.shadowPath);
    this.lastShadowMtime = stat?.mtimeMs ?? 0;
  }

  start() {
    if (this.pollTimer) {
      return;
    }
    const interval = Number.isFinite(this.options.pollIntervalMs) && this.options.pollIntervalMs > 0
      ? Math.max(250, this.options.pollIntervalMs)
      : 2000;
    this.pollTimer = setInterval(() => this.pollShadow(), interval);
    // Kick an initial poll so we notice pre-existing changes
    this.pollShadow();
    this.logger.log(`[git-sync] worker started (interval=${interval}ms, debounce=${this.options.debounceMs}ms)`);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.logger.log('[git-sync] worker stopped');
  }

  async forceSync(reason = 'manual'): Promise<GitSyncOutcome> {
    if (this.currentRun) {
      await this.currentRun.catch(() => undefined);
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.rescheduleReason = null;
    return this.performSync(reason);
  }

  private pollShadow() {
    const stat = this.safeStat(this.options.shadowPath);
    const mtime = stat?.mtimeMs ?? 0;
    if (mtime > this.lastShadowMtime) {
      this.lastShadowMtime = mtime;
      this.scheduleSync(this.options.debounceMs, 'shadow-update');
    }
  }

  private scheduleSync(delayMs: number, reason: string) {
    if (this.running) {
      this.rescheduleReason = reason;
      return;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    const delay = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 0;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.performSync(reason);
    }, delay);
  }

  private async performSync(reason: string): Promise<GitSyncOutcome> {
    if (this.running) {
      return {
        ok: false,
        reason,
        error: 'sync_in_progress',
        skippedReason: 'another_sync_running'
      };
    }
    this.running = true;
    const runPromise = (async (): Promise<GitSyncOutcome> => {
      try {
        this.logger.log(`[git-sync] sync start (reason=${reason})`);
        fs.mkdirSync(this.options.specifyDir, { recursive: true });
        const projectionResult = this.options.db.projectAll(this.options.repoRoot, this.options.specifyDir);
        if (!projectionResult.ok) {
          const error = projectionResult.error ?? 'projection_failed';
          this.logger.error(`[git-sync] projection failed: ${error}`);
          return { ok: false, reason, error };
        }
        const normalized = this.normalizeProjection(projectionResult);
        const relative = this.collectRelativePaths(normalized);

        let committed = false;
        let pushed = false;
        let commitMessage: string | undefined;
        let skippedReason: string | undefined;

        if (this.options.commitOnWrite) {
          const commitOutcome = this.commitAndPush(normalized, relative);
          committed = commitOutcome.committed;
          pushed = commitOutcome.pushed;
          commitMessage = commitOutcome.commitMessage;
          skippedReason = commitOutcome.skippedReason;
        } else {
          skippedReason = 'commit_on_write_disabled';
          this.logger.log('[git-sync] commitOnWrite disabled; projection only');
        }

        const outcome: GitSyncOutcome = {
          ok: true,
          reason,
          projection: normalized,
          committed,
          pushed,
          commitMessage,
          skippedReason
        };
        this.logger.log(`[git-sync] sync complete (committed=${committed}, pushed=${pushed})`);
        return outcome;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`[git-sync] sync failed: ${message}`);
        return { ok: false, reason, error: message };
      } finally {
        this.running = false;
        this.currentRun = null;
        const pending = this.rescheduleReason;
        this.rescheduleReason = null;
        if (pending) {
          this.scheduleSync(this.options.debounceMs, pending);
        }
      }
    })();

    this.currentRun = runPromise;
    return runPromise;
  }

  private normalizeProjection(result: { todo_md?: string; requirements?: string[]; testcases?: string[] }): NormalizedProjection {
    const toAbsolute = (filePath?: string): string => {
      if (!filePath) {
        return '';
      }
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.options.repoRoot, filePath);
      return path.normalize(resolved);
    };

    const todo = toAbsolute(result.todo_md) || path.join(this.options.repoRoot, 'TODO.md');
    const requirements = (result.requirements ?? []).map((p) => toAbsolute(p)).filter((p) => !!p);
    const testcases = (result.testcases ?? []).map((p) => toAbsolute(p)).filter((p) => !!p);

    return { todo, requirements, testcases };
  }

  private collectRelativePaths(projection: NormalizedProjection): string[] {
    const paths = new Set<string>();
    const add = (file: string) => {
      if (!file) {
        return;
      }
      const rel = path.relative(this.options.repoRoot, file);
      if (!rel || rel.startsWith('..')) {
        return;
      }
      paths.add(rel.replace(/\\/g, '/'));
    };

    add(projection.todo);
    projection.requirements.forEach(add);
    projection.testcases.forEach(add);
    return Array.from(paths);
  }

  private commitAndPush(projection: NormalizedProjection, relativePaths: string[]): {
    committed: boolean;
    pushed: boolean;
    commitMessage?: string;
    skippedReason?: string;
  } {
    if (relativePaths.length === 0) {
      this.logger.log('[git-sync] no files to stage');
      return { committed: false, pushed: false, skippedReason: 'no_files' };
    }

    this.runGit(['add', '--', ...relativePaths]);
    const diffResult = this.runGit(['diff', '--cached', '--quiet'], { allowCodes: [0, 1] });
    if (diffResult.status === 0) {
      this.logger.log('[git-sync] no staged changes after add; skipping commit');
      return { committed: false, pushed: false, skippedReason: 'no_changes' };
    }

    const tasks = this.extractTasks(projection.todo);
    const taskIds = tasks.map((t) => t.id);
    const commitMessage = this.buildCommitMessage(tasks, taskIds);
    const [subject, ...rest] = commitMessage.split(/\r?\n/);
    const args = ['commit', '-m', subject];
    const body = rest.join('\n').trim();
    if (body) {
      args.push('-m', body);
    }
    this.runGit(args);

    let pushed = false;
    if (this.options.autoPush && this.options.remote && this.options.branch && this.options.branch !== 'unknown') {
      try {
        this.runGit(['push', this.options.remote, this.options.branch]);
        pushed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`[git-sync] git push failed: ${message}`);
      }
    }

    return { committed: true, pushed, commitMessage };
  }

  private buildCommitMessage(tasks: TaskInfo[], taskIds: string[]): string {
    const summary = this.buildSummary(tasks);
    const signoff = this.options.signoff ? this.getSignoffLine() : '';
    const replacements: Record<string, string> = {
      summary,
      taskIds: taskIds.length ? taskIds.join(', ') : 'N/A',
      signoff
    };

    let message = this.options.messageTemplate;
    for (const [key, value] of Object.entries(replacements)) {
      const pattern = new RegExp(this.escapeRegExp(`{${key}}`), 'g');
      message = message.replace(pattern, value);
    }

    const cleaned = message.replace(/\s+$/, '');
    return cleaned || 'chore(todos): sync TODO snapshot';
  }

  private buildSummary(tasks: TaskInfo[]): string {
    if (tasks.length === 0) {
      return 'sync TODO snapshot';
    }
    const [first, ...rest] = tasks;
    const head = `${first.id}${first.title ? ` ${first.title}` : ''}`.trim();
    if (rest.length === 0) {
      return `sync ${head}`;
    }
    const tailCount = rest.length;
    return `sync ${head} +${tailCount}`;
  }

  private extractTasks(todoPath: string): TaskInfo[] {
    try {
      const content = fs.readFileSync(todoPath, 'utf-8');
      const regex = /^## \[([^\]]+)\]\s+(.*)$/gm;
      const tasks: TaskInfo[] = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content))) {
        const id = match[1].trim();
        const rest = match[2] ?? '';
        const title = rest.replace(/\s*\{.*$/, '').trim();
        tasks.push({ id, title });
      }
      return tasks;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[git-sync] failed to parse ${todoPath}: ${message}`);
      return [];
    }
  }

  private getSignoffLine(): string {
    if (this.cachedSignoff) {
      return this.cachedSignoff;
    }
    const name = this.getGitConfig('user.name') || 'MCP Server';
    const email = this.getGitConfig('user.email') || 'mcp@example.com';
    this.cachedSignoff = `Signed-off-by: ${name} <${email}>`;
    return this.cachedSignoff;
  }

  private getGitConfig(key: string): string | null {
    try {
      const result = this.runGit(['config', '--get', key], { allowCodes: [0, 1] });
      if (result.status !== 0) {
        return null;
      }
      const value = result.stdout.trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private runGit(args: string[], options?: { allowCodes?: number[] }): { status: number; stdout: string; stderr: string } {
    const result = spawnSync('git', args, {
      cwd: this.options.repoRoot,
      encoding: 'utf-8'
    });
    if (result.error) {
      throw result.error;
    }
    const status = result.status ?? 0;
    const allowed = options?.allowCodes ?? [0];
    if (!allowed.includes(status)) {
      const stderr = (result.stderr ?? '').trim();
      const stdout = (result.stdout ?? '').trim();
      const details = stderr || stdout || `exit ${status}`;
      throw new Error(`git ${args.join(' ')} failed: ${details}`);
    }
    return {
      status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? ''
    };
  }

  private safeStat(filePath: string): fs.Stats | null {
    try {
      return fs.statSync(filePath);
    } catch {
      return null;
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
