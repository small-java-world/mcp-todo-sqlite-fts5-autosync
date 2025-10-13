import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { CONFIG } from '../config.js';

export function sanitizeDirName(s: string): string {
  return s.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'wt';
}

export function ensureWorktreeLocally(branch: string, dirName: string, remote: string) {
  if (!CONFIG.git.allowedBranchPrefixes.some(p => branch.startsWith(p))) {
    const e: any = new Error(`branch not allowed by prefix policy: ${branch}`); e.code = 40301; throw e;
  }
  const repoRoot = CONFIG.git.repoRoot;
  const worktreesDir = path.join(repoRoot, CONFIG.git.worktreesDir);
  const target = path.join(worktreesDir, dirName);
  fs.mkdirSync(worktreesDir, { recursive: true });
  const rel = path.relative(repoRoot, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const e: any = new Error('invalid worktree target path'); e.code = 40011; throw e;
  }
  const hasGit = fs.existsSync(path.join(target, '.git'));
  if (!hasGit) {
    try {
      execSync(`git -C "${repoRoot}" worktree add "${target}" -B "${branch}" "${remote}/${branch}"`, { stdio: 'pipe' });
    } catch {
      execSync(`git -C "${repoRoot}" worktree add "${target}" -B "${branch}"`, { stdio: 'pipe' });
    }
  }
  return target;
}


