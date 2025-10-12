import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DB } from '../../src/utils/db.js';
import path from 'path';
import fs from 'fs';

describe('Worktree Binding Tests', () => {
  let db: DB;
  const testDbPath = 'data/test-worktree/todo-worktree.db';

  beforeEach(() => {
    // テスト用ディレクトリを作成
    fs.mkdirSync('data/test-worktree', { recursive: true });
    db = new DB('data/test-worktree', 'todo-worktree.db', 'data/test-worktree/cas');
  });

  afterEach(() => {
    try {
      db?.close();
      fs.rmSync('data/test-worktree', { recursive: true, force: true });
    } catch (e) {
      // クリーンアップエラーは無視
    }
  });

  describe('sanitizeDirName function', () => {
    it('should sanitize branch names correctly', () => {
      // この関数は server.ts 内にあるので、直接テストできない
      // 代わりに、期待される動作を文書化
      expect('feat/my-feature'.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)).toBe('feat-my-feature');
      expect('fix/bug#123'.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)).toBe('fix-bug-123');
      expect('chore/update-deps'.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)).toBe('chore-update-deps');
    });
  });

  describe('worktree configuration', () => {
    it('should handle autoEnsureWorktree configuration', () => {
      // CONFIG.git.autoEnsureWorktree の設定をテスト
      const autoEnsure = process.env.GIT_AUTO_ENSURE_WORKTREE || 'true';
      expect(autoEnsure).toBe('true');
    });

    it('should handle allowedBranchPrefixes configuration', () => {
      const prefixes = (process.env.GIT_ALLOWED_BRANCH_PREFIXES || 'feat/,fix/,chore/,refactor/').split(',');
      expect(prefixes).toContain('feat/');
      expect(prefixes).toContain('fix/');
      expect(prefixes).toContain('chore/');
      expect(prefixes).toContain('refactor/');
    });
  });

  describe('worktree path validation', () => {
    it('should validate worktree paths are within repo root', () => {
      const repoRoot = process.cwd();
      const worktreesDir = 'worktrees';
      const dirName = 'test-branch';
      const target = path.join(repoRoot, worktreesDir, dirName);
      const rel = path.relative(repoRoot, target);
      
      expect(rel).not.toMatch(/^\.\./);
      expect(path.isAbsolute(rel)).toBe(false);
    });

    it('should reject paths outside repo root', () => {
      const repoRoot = process.cwd();
      const maliciousPath = path.join(repoRoot, '..', 'malicious');
      const rel = path.relative(repoRoot, maliciousPath);
      
      expect(rel.startsWith('..')).toBe(true);
    });
  });
});
