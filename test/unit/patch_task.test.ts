import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-patch');
const dbFile = 'todo-patch.db';
const casDir = path.join(tmpDir, 'cas');

describe('Patch Task Tests', () => {
  let db: DB;
  
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
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

  it('should support set operation', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-1', 'Original Title', 'Original text', { priority: 'Low' });
    
    const originalTask = db.getTask('T-PATCH-1');
    const originalVclock = originalTask?.vclock || 0;
    
    // set操作でタイトルとテキストを更新
    const result = db.patchTask('T-PATCH-1', {
      set: {
        title: 'Updated Title',
        text: 'Updated text'
      }
    }, originalVclock);
    
    expect(result.ok).toBe(true);
    expect(result.vclock).toBe(originalVclock + 1);
    
    const updatedTask = db.getTask('T-PATCH-1');
    expect(updatedTask?.title).toBe('Updated Title');
    expect(updatedTask?.text).toBe('Updated text');
    expect(updatedTask?.meta).toBe('{"priority":"Low"}'); // metaは変更されていない
  });

  it('should support append operation', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-2', 'Append Test', 'Original text', {});
    
    const originalTask = db.getTask('T-PATCH-2');
    const originalVclock = originalTask?.vclock || 0;
    
    // append操作でテキストに追加
    const result = db.patchTask('T-PATCH-2', {
      append: {
        text: '\n\nAdditional information added.'
      }
    }, originalVclock);
    
    expect(result.ok).toBe(true);
    expect(result.vclock).toBe(originalVclock + 1);
    
    const updatedTask = db.getTask('T-PATCH-2');
    expect(updatedTask?.text).toBe('Original text\n\nAdditional information added.');
  });

  it('should support merge operation for meta', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-3', 'Merge Test', 'Test text', { priority: 'Low', tags: ['initial'] });
    
    const originalTask = db.getTask('T-PATCH-3');
    const originalVclock = originalTask?.vclock || 0;
    
    // merge操作でmetaをマージ
    const result = db.patchTask('T-PATCH-3', {
      merge: {
        meta: {
          priority: 'High',
          assignee: 'developer1',
          tags: ['updated', 'urgent']
        }
      }
    }, originalVclock);
    
    expect(result.ok).toBe(true);
    expect(result.vclock).toBe(originalVclock + 1);
    
    const updatedTask = db.getTask('T-PATCH-3');
    const meta = JSON.parse(updatedTask?.meta || '{}');
    expect(meta.priority).toBe('High'); // 更新された
    expect(meta.assignee).toBe('developer1'); // 新規追加
    expect(meta.tags).toEqual(['updated', 'urgent']); // 置換された
  });

  it('should support delete operation', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-4', 'Delete Test', 'Test text', { priority: 'Low', assignee: 'developer1' });
    
    const originalTask = db.getTask('T-PATCH-4');
    const originalVclock = originalTask?.vclock || 0;
    
    // delete操作でmetaの特定フィールドを削除
    const result = db.patchTask('T-PATCH-4', {
      delete: {
        meta: ['assignee']
      }
    }, originalVclock);
    
    expect(result.ok).toBe(true);
    expect(result.vclock).toBe(originalVclock + 1);
    
    const updatedTask = db.getTask('T-PATCH-4');
    const meta = JSON.parse(updatedTask?.meta || '{}');
    expect(meta.priority).toBe('Low'); // 残っている
    expect(meta.assignee).toBeUndefined(); // 削除された
  });

  it('should support replace operation', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-5', 'Replace Test', 'Original text', { priority: 'Low' });
    
    const originalTask = db.getTask('T-PATCH-5');
    const originalVclock = originalTask?.vclock || 0;
    
    // replace操作でmetaを完全置換
    const result = db.patchTask('T-PATCH-5', {
      replace: {
        meta: {
          priority: 'High',
          assignee: 'developer1',
          tags: ['new', 'replaced']
        }
      }
    }, originalVclock);
    
    expect(result.ok).toBe(true);
    expect(result.vclock).toBe(originalVclock + 1);
    
    const updatedTask = db.getTask('T-PATCH-5');
    const meta = JSON.parse(updatedTask?.meta || '{}');
    expect(meta.priority).toBe('High');
    expect(meta.assignee).toBe('developer1');
    expect(meta.tags).toEqual(['new', 'replaced']);
    expect(Object.keys(meta)).toHaveLength(3); // 元のpriority以外は削除された
  });

  it('should handle vclock conflicts', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-6', 'Conflict Test', 'Original text', {});
    
    const originalTask = db.getTask('T-PATCH-6');
    const originalVclock = originalTask?.vclock || 0;
    
    // 最初の更新
    const result1 = db.patchTask('T-PATCH-6', {
      set: { title: 'First Update' }
    }, originalVclock);
    
    expect(result1.ok).toBe(true);
    
    // 古いvclockで更新を試行（競合）
    const result2 = db.patchTask('T-PATCH-6', {
      set: { title: 'Second Update' }
    }, originalVclock); // 古いvclockを使用
    
    expect(result2.ok).toBe(false);
    expect(result2.error).toBe('vclock_conflict');
    expect(result2.details?.current_vclock).toBe(originalVclock + 1);
    
    // タスクは最初の更新のまま
    const task = db.getTask('T-PATCH-6');
    expect(task?.title).toBe('First Update');
  });

  it('should support multiple operations in one patch', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-7', 'Multi Op Test', 'Original text', { priority: 'Low' });
    
    const originalTask = db.getTask('T-PATCH-7');
    const originalVclock = originalTask?.vclock || 0;
    
    // 複数操作を同時実行
    const result = db.patchTask('T-PATCH-7', {
      set: { title: 'Updated Title' },
      append: { text: '\n\nAdditional text' },
      merge: { meta: { assignee: 'developer1' } }
    }, originalVclock);
    
    expect(result.ok).toBe(true);
    expect(result.vclock).toBe(originalVclock + 1);
    
    const updatedTask = db.getTask('T-PATCH-7');
    expect(updatedTask?.title).toBe('Updated Title');
    expect(updatedTask?.text).toBe('Original text\n\nAdditional text');
    
    const meta = JSON.parse(updatedTask?.meta || '{}');
    expect(meta.priority).toBe('Low'); // 保持された
    expect(meta.assignee).toBe('developer1'); // 追加された
  });

  it('should handle invalid operations gracefully', () => {
    // 初期タスクを作成
    db.upsertTask('T-PATCH-8', 'Invalid Op Test', 'Original text', {});
    
    const originalTask = db.getTask('T-PATCH-8');
    const originalVclock = originalTask?.vclock || 0;
    
    // 無効な操作
    const result = db.patchTask('T-PATCH-8', {
      invalid_operation: { title: 'Invalid' }
    }, originalVclock);
    
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_operation');
    
    // タスクは変更されていない
    const task = db.getTask('T-PATCH-8');
    expect(task?.title).toBe('Invalid Op Test');
    expect(task?.vclock).toBe(originalVclock);
  });
});
