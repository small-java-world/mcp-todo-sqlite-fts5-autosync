import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-issues-import-export');
const dbFile = 'todo-issues-ie.db';
const casDir = path.join(tmpDir, 'cas');

describe('Issues Import/Export Tests', () => {
  let db: DB;
  
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
  });

  beforeEach(() => {
    // 各テスト前にデータをクリア
    try {
      db.db.exec('DELETE FROM issue_responses');
      db.db.exec('DELETE FROM issue_relations');
      db.db.exec('DELETE FROM review_issues');
      db.db.exec('DELETE FROM task_state_history');
      db.db.exec('DELETE FROM reviews');
      db.db.exec('DELETE FROM review_comments');
      db.db.exec('DELETE FROM tasks');
    } catch (e) {
      // データベースが破損している場合は再作成
      db.close();
      fs.rmSync(path.join(tmpDir, dbFile), { force: true });
      db = new DB(tmpDir, dbFile, casDir);
    }
  });

  afterAll(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Issues Import', () => {
    it('should import issues from TODO.md', () => {
      const todoMd = `# Tasks

## [T-ISSUE-1] Test Task {state: IN_PROGRESS}

Issues:
- **Critical**: Security vulnerability in authentication
  - Status: Open
  - Priority: Critical
  - Category: Security
  - Severity: Critical
  - Created: 2025-01-16T09:00:00Z by reviewer1
  - Due: 2025-01-20T00:00:00Z
  - Tags: [security, sql-injection, authentication]
  - Responses:
    - 2025-01-16T14:30:00Z by developer1 (fix): "Implemented parameterized queries"
    - 2025-01-16T15:00:00Z by reviewer1 (comment): "Verified fix, looks good"
    - 2025-01-16T15:05:00Z by reviewer1 (resolution): "Issue resolved"

- **High**: Password hashing using weak algorithm
  - Status: Resolved
  - Priority: High
  - Category: Security
  - Severity: High
  - Created: 2025-01-16T09:02:00Z by reviewer1
  - Resolved: 2025-01-16T16:00:00Z by developer1
  - Tags: [security, password, hashing]
  - Responses:
    - 2025-01-16T16:00:00Z by developer1 (fix): "Upgraded to bcrypt with salt rounds=12"
    - 2025-01-16T16:30:00Z by reviewer1 (resolution): "Confirmed fix, security improved"
`;

      db.importTodoMd(todoMd);

      // タスクが作成されていることを確認
      const task = db.getTask('T-ISSUE-1');
      expect(task).toBeDefined();
      expect(task?.title).toBe('Test Task');

      // 指摘が作成されていることを確認
      const issues = db.db.prepare('SELECT * FROM review_issues WHERE task_id = ?').all('T-ISSUE-1');
      expect(issues).toHaveLength(2);

      // 最初の指摘の詳細確認
      const issue1 = issues.find(i => i.title === 'Security vulnerability in authentication');
      expect(issue1).toBeDefined();
      expect(issue1.status).toBe('open');
      expect(issue1.priority).toBe('critical');
      expect(issue1.category).toBe('security');
      expect(issue1.severity).toBe('critical');
      expect(issue1.created_by).toBe('reviewer1');

      // 2番目の指摘の詳細確認
      const issue2 = issues.find(i => i.title === 'Password hashing using weak algorithm');
      expect(issue2).toBeDefined();
      expect(issue2.status).toBe('resolved');
      expect(issue2.priority).toBe('high');
      expect(issue2.resolved_by).toBe('developer1');

      // 対応が作成されていることを確認
      const responses1 = db.db.prepare('SELECT * FROM issue_responses WHERE issue_id = ?').all(issue1.id);
      expect(responses1).toHaveLength(3);

      const responses2 = db.db.prepare('SELECT * FROM issue_responses WHERE issue_id = ?').all(issue2.id);
      expect(responses2).toHaveLength(2);
    });

    it('should handle issues without responses', () => {
      const todoMd = `# Tasks

## [T-ISSUE-2] Simple Task {state: DRAFT}

Issues:
- **Medium**: Code style issue
  - Status: Open
  - Priority: Medium
  - Category: Style
  - Created: 2025-01-16T10:00:00Z by reviewer1
`;

      db.importTodoMd(todoMd);

      const issues = db.db.prepare('SELECT * FROM review_issues WHERE task_id = ?').all('T-ISSUE-2');
      expect(issues).toHaveLength(1);

      const issue = issues[0];
      expect(issue.title).toBe('Code style issue');
      expect(issue.status).toBe('open');
      expect(issue.priority).toBe('medium');
      expect(issue.category).toBe('style');

      // 対応がないことを確認
      const responses = db.db.prepare('SELECT * FROM issue_responses WHERE issue_id = ?').all(issue.id);
      expect(responses).toHaveLength(0);
    });

    it('should handle issues with internal responses', () => {
      const todoMd = `# Tasks

## [T-ISSUE-3] Internal Task {state: IN_PROGRESS}

Issues:
- **Low**: Minor documentation issue
  - Status: Open
  - Priority: Low
  - Category: Documentation
  - Created: 2025-01-16T11:00:00Z by reviewer1
  - Responses:
    - 2025-01-16T12:00:00Z by developer1 (comment): "Working on this"
    - 2025-01-16T12:30:00Z by developer1 (comment): "Internal note" (internal)
`;

      db.importTodoMd(todoMd);

      const issues = db.db.prepare('SELECT * FROM review_issues WHERE task_id = ?').all('T-ISSUE-3');
      expect(issues).toHaveLength(1);

      const responses = db.db.prepare('SELECT * FROM issue_responses WHERE issue_id = ?').all(issues[0].id);
      expect(responses).toHaveLength(2);

      const publicResponses = responses.filter(r => r.is_internal === 0);
      const internalResponses = responses.filter(r => r.is_internal === 1);

      expect(publicResponses).toHaveLength(1);
      expect(internalResponses).toHaveLength(1);
      expect(internalResponses[0].content).toBe('Internal note');
    });
  });

  describe('Issues Export', () => {
    it('should export issues to TODO.md', () => {
      // タスクと指摘を作成
      db.upsertTask('T-EXPORT-1', 'Export Test Task', 'Test task for export', {});
      
      // 指摘を作成
      const issue1 = db.db.prepare(`
        INSERT INTO review_issues (
          task_id, title, description, status, priority, category, severity,
          created_at, created_by, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'T-EXPORT-1',
        'Export test issue 1',
        'First test issue for export',
        'open',
        'high',
        'bug',
        'medium',
        Date.now(),
        'reviewer1',
        JSON.stringify(['test', 'export'])
      );

      const issue2 = db.db.prepare(`
        INSERT INTO review_issues (
          task_id, title, description, status, priority, category, severity,
          created_at, created_by, resolved_at, resolved_by, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'T-EXPORT-1',
        'Export test issue 2',
        'Second test issue for export',
        'resolved',
        'medium',
        'style',
        'low',
        Date.now(),
        'reviewer1',
        Date.now(),
        'developer1',
        JSON.stringify(['test', 'style'])
      );

      // 対応を追加
      db.db.prepare(`
        INSERT INTO issue_responses (
          issue_id, response_type, content, created_at, created_by, is_internal
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        issue1.lastInsertRowid,
        'comment',
        'Working on this issue',
        Date.now(),
        'developer1',
        0
      );

      db.db.prepare(`
        INSERT INTO issue_responses (
          issue_id, response_type, content, created_at, created_by, is_internal
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        issue2.lastInsertRowid,
        'fix',
        'Fixed the issue',
        Date.now(),
        'developer1',
        0
      );

      // エクスポート
      const exported = db.exportTodoMd();

      // Issues ブロックが含まれていることを確認
      expect(exported).toContain('Issues:');
      expect(exported).toContain('Export test issue 1');
      expect(exported).toContain('Export test issue 2');
      expect(exported).toContain('Status: Open');
      expect(exported).toContain('Status: Resolved');
      expect(exported).toContain('Priority: High');
      expect(exported).toContain('Priority: Medium');
      expect(exported).toContain('Category: Bug');
      expect(exported).toContain('Category: Style');
      expect(exported).toContain('Working on this issue');
      expect(exported).toContain('Fixed the issue');
    });

    it('should export issues with proper formatting', () => {
      // タスクと指摘を作成
      db.upsertTask('T-FORMAT-1', 'Format Test Task', 'Test task for formatting', {});
      
      const issue = db.db.prepare(`
        INSERT INTO review_issues (
          task_id, title, description, status, priority, category, severity,
          created_at, created_by, due_date, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'T-FORMAT-1',
        'Format test issue',
        'Test issue for formatting',
        'open',
        'critical',
        'security',
        'high',
        Date.now(),
        'reviewer1',
        Date.now() + 86400000, // 1 day from now
        JSON.stringify(['security', 'critical'])
      );

      const exported = db.exportTodoMd();

      // 適切なフォーマットで出力されていることを確認
      expect(exported).toContain('**Critical**: Format test issue');
      expect(exported).toContain('- Status: Open');
      expect(exported).toContain('- Priority: Critical');
      expect(exported).toContain('- Category: Security');
      expect(exported).toContain('- Severity: High');
      expect(exported).toContain('- Created:');
      expect(exported).toContain('- Due:');
      expect(exported).toContain('- Tags: [security, critical]');
    });
  });
});
