import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';
import { ReviewIssuesManager } from '../../src/utils/review-issues.js';

const tmpDir = path.join('data', 'test-issues');
const dbFile = 'todo-issues.db';
const casDir = path.join(tmpDir, 'cas');

describe('Review Issues Tests', () => {
  let db: DB;
  let issuesManager: ReviewIssuesManager;
  
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
    issuesManager = new ReviewIssuesManager(db.db);
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
      issuesManager = new ReviewIssuesManager(db.db);
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

  describe('Issue Creation', () => {
    it('should create a new issue', () => {
      // タスクを作成
      db.upsertTask('T-ISSUE-1', 'Test Task', 'Test task for issues', {});
      
      const issue = {
        task_id: 'T-ISSUE-1',
        title: 'Security vulnerability found',
        description: 'SQL injection vulnerability in login query',
        priority: 'critical' as const,
        category: 'security',
        severity: 'critical' as const,
        created_by: 'reviewer1',
        tags: ['security', 'sql-injection']
      };

      const result = issuesManager.createIssue(issue);
      
      expect(result.id).toBeGreaterThan(0);
      expect(result.created_at).toBeGreaterThan(0);
      
      const createdIssue = issuesManager.getIssue(result.id);
      expect(createdIssue).toBeDefined();
      expect(createdIssue?.title).toBe('Security vulnerability found');
      expect(createdIssue?.status).toBe('open');
      expect(createdIssue?.priority).toBe('critical');
      expect(createdIssue?.tags).toEqual(['security', 'sql-injection']);
    });

    it('should create issue with review_id', () => {
      // タスクとレビューを作成
      db.upsertTask('T-ISSUE-2', 'Test Task', 'Test task for issues', {});
      db.addReview('T-ISSUE-2', 'REQUEST_CHANGES', 'reviewer1', 'Security issues found');
      
      const reviews = db.db.prepare('SELECT id FROM reviews WHERE task_id = ?').all('T-ISSUE-2');
      const reviewId = reviews[0].id;

      const issue = {
        task_id: 'T-ISSUE-2',
        review_id: reviewId,
        title: 'Authentication issue',
        description: 'Weak password hashing',
        priority: 'high' as const,
        created_by: 'reviewer1'
      };

      const result = issuesManager.createIssue(issue);
      const createdIssue = issuesManager.getIssue(result.id);
      
      expect(createdIssue?.review_id).toBe(reviewId);
    });
  });

  describe('Issue Updates', () => {
    it('should update issue fields', () => {
      // タスクと指摘を作成
      db.upsertTask('T-ISSUE-3', 'Test Task', 'Test task for issues', {});
      
      const issue = {
        task_id: 'T-ISSUE-3',
        title: 'Original title',
        description: 'Original description',
        priority: 'medium' as const,
        created_by: 'reviewer1'
      };

      const result = issuesManager.createIssue(issue);
      const issueId = result.id;

      // 指摘を更新
      const updateResult = issuesManager.updateIssue(issueId, {
        title: 'Updated title',
        priority: 'high',
        description: 'Updated description'
      });

      expect(updateResult.ok).toBe(true);

      const updatedIssue = issuesManager.getIssue(issueId);
      expect(updatedIssue?.title).toBe('Updated title');
      expect(updatedIssue?.priority).toBe('high');
      expect(updatedIssue?.description).toBe('Updated description');
    });

    it('should update issue status', () => {
      // タスクと指摘を作成
      db.upsertTask('T-ISSUE-4', 'Test Task', 'Test task for issues', {});
      
      const issue = {
        task_id: 'T-ISSUE-4',
        title: 'Test issue',
        priority: 'medium' as const,
        created_by: 'reviewer1'
      };

      const result = issuesManager.createIssue(issue);
      const issueId = result.id;

      // 指摘を解決
      const resolveResult = issuesManager.resolveIssue(issueId, 'developer1', 'Fixed the issue');
      expect(resolveResult.ok).toBe(true);

      const resolvedIssue = issuesManager.getIssue(issueId);
      expect(resolvedIssue?.status).toBe('resolved');
      expect(resolvedIssue?.resolved_by).toBe('developer1');
      expect(resolvedIssue?.resolved_at).toBeGreaterThan(0);
    });

    it('should close issue', () => {
      // タスクと指摘を作成
      db.upsertTask('T-ISSUE-5', 'Test Task', 'Test task for issues', {});
      
      const issue = {
        task_id: 'T-ISSUE-5',
        title: 'Test issue',
        priority: 'medium' as const,
        created_by: 'reviewer1'
      };

      const result = issuesManager.createIssue(issue);
      const issueId = result.id;

      // 指摘をクローズ
      const closeResult = issuesManager.closeIssue(issueId, 'reviewer1', 'Issue verified and closed');
      expect(closeResult.ok).toBe(true);

      const closedIssue = issuesManager.getIssue(issueId);
      expect(closedIssue?.status).toBe('closed');
      expect(closedIssue?.closed_by).toBe('reviewer1');
      expect(closedIssue?.closed_at).toBeGreaterThan(0);
    });
  });

  describe('Issue Responses', () => {
    it('should add response to issue', () => {
      // タスクと指摘を作成
      db.upsertTask('T-ISSUE-6', 'Test Task', 'Test task for issues', {});
      
      const issue = {
        task_id: 'T-ISSUE-6',
        title: 'Test issue',
        priority: 'medium' as const,
        created_by: 'reviewer1'
      };

      const result = issuesManager.createIssue(issue);
      const issueId = result.id;

      // 対応を追加
      const responseResult = issuesManager.addResponse({
        issue_id: issueId,
        response_type: 'fix',
        content: 'Implemented the fix',
        created_by: 'developer1',
        is_internal: false
      });

      expect(responseResult.id).toBeGreaterThan(0);
      expect(responseResult.created_at).toBeGreaterThan(0);

      const responses = issuesManager.getIssueResponses(issueId);
      expect(responses).toHaveLength(1);
      expect(responses[0].response_type).toBe('fix');
      expect(responses[0].content).toBe('Implemented the fix');
      expect(responses[0].created_by).toBe('developer1');
    });

    it('should add multiple responses', () => {
      // タスクと指摘を作成
      db.upsertTask('T-ISSUE-7', 'Test Task', 'Test task for issues', {});
      
      const issue = {
        task_id: 'T-ISSUE-7',
        title: 'Test issue',
        priority: 'medium' as const,
        created_by: 'reviewer1'
      };

      const result = issuesManager.createIssue(issue);
      const issueId = result.id;

      // 複数の対応を追加
      issuesManager.addResponse({
        issue_id: issueId,
        response_type: 'comment',
        content: 'Working on this issue',
        created_by: 'developer1',
        is_internal: false
      });

      issuesManager.addResponse({
        issue_id: issueId,
        response_type: 'fix',
        content: 'Fixed the issue',
        created_by: 'developer1',
        is_internal: false
      });

      issuesManager.addResponse({
        issue_id: issueId,
        response_type: 'comment',
        content: 'Internal note',
        created_by: 'developer1',
        is_internal: true
      });

      const responses = issuesManager.getIssueResponses(issueId, true);
      expect(responses).toHaveLength(3);

      const publicResponses = issuesManager.getIssueResponses(issueId, false);
      expect(publicResponses).toHaveLength(2);
    });
  });

  describe('Issue Queries', () => {
    it('should get issues by task', () => {
      // タスクを作成
      db.upsertTask('T-ISSUE-8', 'Test Task', 'Test task for issues', {});
      
      // 複数の指摘を作成
      const issues = [
        {
          task_id: 'T-ISSUE-8',
          title: 'Issue 1',
          priority: 'high' as const,
          created_by: 'reviewer1'
        },
        {
          task_id: 'T-ISSUE-8',
          title: 'Issue 2',
          priority: 'medium' as const,
          created_by: 'reviewer2'
        },
        {
          task_id: 'T-ISSUE-8',
          title: 'Issue 3',
          priority: 'low' as const,
          created_by: 'reviewer1'
        }
      ];

      issues.forEach(issue => issuesManager.createIssue(issue));

      const taskIssues = issuesManager.getIssuesByTask('T-ISSUE-8');
      expect(taskIssues).toHaveLength(3);

      const highPriorityIssues = issuesManager.getIssuesByTask('T-ISSUE-8', {
        priority: ['high']
      });
      expect(highPriorityIssues).toHaveLength(1);
      expect(highPriorityIssues[0].title).toBe('Issue 1');

      const reviewer1Issues = issuesManager.getIssuesByTask('T-ISSUE-8', {
        created_by: 'reviewer1'
      });
      expect(reviewer1Issues).toHaveLength(2);
    });

    it('should search issues', () => {
      // タスクを作成
      db.upsertTask('T-ISSUE-9', 'Test Task', 'Test task for issues', {});
      
      // 複数の指摘を作成
      const issues = [
        {
          task_id: 'T-ISSUE-9',
          title: 'Security vulnerability in authentication',
          description: 'SQL injection found in login query',
          priority: 'critical' as const,
          category: 'security',
          created_by: 'reviewer1'
        },
        {
          task_id: 'T-ISSUE-9',
          title: 'Performance issue in database',
          description: 'Slow query execution',
          priority: 'medium' as const,
          category: 'performance',
          created_by: 'reviewer2'
        }
      ];

      issues.forEach(issue => issuesManager.createIssue(issue));

      const securityIssues = issuesManager.searchIssues('security', {
        category: 'security'
      });
      expect(securityIssues).toHaveLength(1);
      expect(securityIssues[0].title).toContain('Security');

      const performanceIssues = issuesManager.searchIssues('database', {
        category: 'performance'
      });
      expect(performanceIssues).toHaveLength(1);
      expect(performanceIssues[0].title).toContain('Performance');
    });
  });

  describe('Issue Status Transitions', () => {
    it('should handle complete issue lifecycle', () => {
      // タスクと指摘を作成
      db.upsertTask('T-ISSUE-10', 'Test Task', 'Test task for issues', {});
      
      const issue = {
        task_id: 'T-ISSUE-10',
        title: 'Complete lifecycle test',
        priority: 'high' as const,
        created_by: 'reviewer1'
      };

      const result = issuesManager.createIssue(issue);
      const issueId = result.id;

      // 初期状態: Open
      let currentIssue = issuesManager.getIssue(issueId);
      expect(currentIssue?.status).toBe('open');

      // 対応を追加
      issuesManager.addResponse({
        issue_id: issueId,
        response_type: 'comment',
        content: 'Working on this issue',
        created_by: 'developer1',
        is_internal: false
      });

      // 解決
      issuesManager.resolveIssue(issueId, 'developer1', 'Fixed the issue');
      currentIssue = issuesManager.getIssue(issueId);
      expect(currentIssue?.status).toBe('resolved');
      expect(currentIssue?.resolved_by).toBe('developer1');

      // クローズ
      issuesManager.closeIssue(issueId, 'reviewer1', 'Verified fix');
      currentIssue = issuesManager.getIssue(issueId);
      expect(currentIssue?.status).toBe('closed');
      expect(currentIssue?.closed_by).toBe('reviewer1');

      // 対応履歴の確認
      const responses = issuesManager.getIssueResponses(issueId);
      expect(responses).toHaveLength(3); // コメント + 解決時の自動対応 + クローズ時の自動対応
    });
  });
});
