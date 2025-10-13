/**
 * Server utility functions
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Sanitize directory name for worktree
 */
export function sanitizeDirName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Ensure git worktree exists locally
 */
export function ensureWorktreeLocally(branch: string, dirName: string, remote?: string): string {
  const worktreeDir = path.resolve('.worktrees', dirName);

  if (fs.existsSync(path.join(worktreeDir, '.git'))) {
    return worktreeDir;
  }

  fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });

  try {
    // Create worktree
    if (remote) {
      execSync(`git worktree add -b ${branch} ${worktreeDir} ${remote}/${branch}`, {
        stdio: 'inherit'
      });
    } else {
      execSync(`git worktree add ${worktreeDir} ${branch}`, {
        stdio: 'inherit'
      });
    }
  } catch (error) {
    throw new Error(`Failed to create worktree: ${(error as Error).message}`);
  }

  return worktreeDir;
}
