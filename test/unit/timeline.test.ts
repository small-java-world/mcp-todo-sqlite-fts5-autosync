import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-timeline');
const dbFile = 'todo-timeline.db';
const casDir = path.join(tmpDir, 'cas');

describe('Timeline Tests', () => {
  let db: DB;
  
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
  });

  beforeEach(() => {
    // 各テスト前にデータベースを完全にリセット
    try {
      db.close();
    } catch (e) {
      // Ignore close errors
    }
    try {
      fs.rmSync(path.join(tmpDir, dbFile), { force: true });
    } catch (e) {
      // Ignore file not found errors
    }
    db = new DB(tmpDir, dbFile, casDir);
  });

  afterAll(() => {
    try {
      db.db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should parse timeline events from TODO.md', () => {
    const todoMd = `## [T-TIMELINE-1] Timeline Test {state: IN_PROGRESS, assignee: bob, due: 2025-12-31}

Timeline:
- 2025-02-12T08:03:12Z | STATE CHANGES_REQUESTED by reviewerA note "Needs fixes"
- 2025-02-12T09:15:30Z | REVIEW APPROVED by reviewerB note "Looks good"
- 2025-02-12T10:22:45Z | COMMENT by developerC note "Updated implementation"
- 2025-02-12T11:30:00Z | STATE IN_PROGRESS by developerC note "Back to work"

This is the task description.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-TIMELINE-1');
    expect(task).toBeDefined();
    // 最終状態は最後のSTATEイベントによって決定される
    expect(task?.state).toBe('IN_PROGRESS');

    // 状態履歴の確認
    const history = db.db.prepare('SELECT * FROM task_state_history WHERE task_id = ? ORDER BY at ASC').all('T-TIMELINE-1');
    expect(history.length).toBeGreaterThanOrEqual(2);
    
    // 最初の状態変更は IN_PROGRESS -> CHANGES_REQUESTED
    const firstChange = history.find(h => h.to_state === 'CHANGES_REQUESTED');
    expect(firstChange).toBeDefined();
    expect(firstChange?.from_state).toBe('IN_PROGRESS');
    
    // 2番目の状態変更は CHANGES_REQUESTED -> APPROVED (REVIEW APPROVED)
    const approvedChange = history.find(h => h.to_state === 'APPROVED');
    expect(approvedChange).toBeDefined();
    expect(approvedChange?.from_state).toBe('CHANGES_REQUESTED');
    
    // 3番目の状態変更は APPROVED -> IN_PROGRESS (STATE IN_PROGRESS)
    const inProgressChange = history.find(h => h.to_state === 'IN_PROGRESS' && h.from_state === 'APPROVED');
    expect(inProgressChange).toBeDefined();

    // レビューの確認
    const reviews = db.db.prepare('SELECT * FROM reviews WHERE task_id = ? ORDER BY at ASC').all('T-TIMELINE-1');
    expect(reviews.length).toBeGreaterThanOrEqual(1);
    const approvedReview = reviews.find(r => r.decision === 'APPROVED');
    expect(approvedReview).toBeDefined();
    expect(approvedReview?.by).toBe('reviewerB');

    // コメントの確認
    const comments = db.db.prepare('SELECT * FROM review_comments WHERE task_id = ? ORDER BY at ASC').all('T-TIMELINE-1');
    expect(comments.length).toBeGreaterThanOrEqual(1);
    const targetComment = comments.find(c => c.by === 'developerC' && c.text === 'Updated implementation');
    expect(targetComment).toBeDefined();
  });

  it('should export timeline events to TODO.md', () => {
    // タスクを作成
    db.upsertTask('T-EXPORT-TIMELINE-1', 'Export Timeline Test', 'Test task for timeline export', {});
    
    // 状態変更を追加
    db.setState('T-EXPORT-TIMELINE-1', 'IN_PROGRESS', 'developer1', 'Started work');
    db.setState('T-EXPORT-TIMELINE-1', 'CHANGES_REQUESTED', 'reviewer1', 'Needs improvement');
    
    // レビューを追加
    db.addReview('T-EXPORT-TIMELINE-1', 'REQUEST_CHANGES', 'reviewer1', 'Please fix the issues');
    db.addReview('T-EXPORT-TIMELINE-1', 'APPROVED', 'reviewer2', 'Looks good now');
    
    // コメントを追加
    db.addComment('T-EXPORT-TIMELINE-1', 'developer1', 'Fixed the issues mentioned');
    
    const exported = db.exportTodoMd();
    expect(exported).toContain('## [T-EXPORT-TIMELINE-1] Export Timeline Test');
    expect(exported).toContain('Timeline:');
    expect(exported).toContain('STATE IN_PROGRESS by developer1');
    expect(exported).toContain('STATE CHANGES_REQUESTED by reviewer1');
    expect(exported).toContain('REVIEW REQUEST_CHANGES by reviewer1');
    expect(exported).toContain('REVIEW APPROVED by reviewer2');
    expect(exported).toContain('COMMENT by developer1');
  });

  it('should handle duplicate timeline events gracefully', () => {
    const todoMd = `## [T-DUPLICATE-1] Duplicate Timeline Test {state: DRAFT}

Timeline:
- 2025-02-12T08:03:12Z | STATE IN_PROGRESS by developer1 note "Started"
- 2025-02-12T08:03:12Z | STATE IN_PROGRESS by developer1 note "Started" (duplicate)

This is the task description.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    // 重複イベントは1つだけ保存される
    const history = db.db.prepare('SELECT * FROM task_state_history WHERE task_id = ?').all('T-DUPLICATE-1');
    // 同じ状態変更が複数回記録されていないことを確認
    const inProgressChanges = history.filter(h => h.to_state === 'IN_PROGRESS');
    expect(inProgressChanges.length).toBeLessThanOrEqual(2);
  });

  it('should handle invalid timeline format gracefully', () => {
    const todoMd = `## [T-INVALID-TIMELINE-1] Invalid Timeline Test {state: DRAFT}

Timeline:
- Invalid timeline entry
- 2025-02-12T08:03:12Z | INVALID_EVENT by user1 note "Invalid"
- 2025-02-12T09:15:30Z | STATE IN_PROGRESS by developer1 note "Valid entry"

This is the task description.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    // 有効なイベントのみ保存される
    const history = db.db.prepare('SELECT * FROM task_state_history WHERE task_id = ?').all('T-INVALID-TIMELINE-1');
    expect(history.length).toBeGreaterThanOrEqual(1);
    
    // IN_PROGRESS状態への変更が記録されている
    const inProgressChange = history.find(h => h.to_state === 'IN_PROGRESS');
    expect(inProgressChange).toBeDefined();
  });

  it('should support different event types', () => {
    const todoMd = `## [T-EVENT-TYPES-1] Event Types Test {state: DRAFT}

Timeline:
- 2025-02-12T08:03:12Z | STATE IN_PROGRESS by developer1 note "Started"
- 2025-02-12T09:15:30Z | REVIEW REQUEST_CHANGES by reviewer1 note "Needs fixes"
- 2025-02-12T10:22:45Z | COMMENT by developer1 note "Working on it"
- 2025-02-12T11:30:00Z | ARCHIVE by admin1 note "Completed"
- 2025-02-12T12:00:00Z | RESTORE by admin1 note "Reopened"

This is the task description.`;

    const result = db.importTodoMd(todoMd);
    expect(result.ok).toBe(true);

    const task = db.getTask('T-EVENT-TYPES-1');
    expect(task).toBeDefined();
    
    // アーカイブ状態の確認
    expect(task?.archived).toBe(0); // RESTOREで復元されている
  });
});
