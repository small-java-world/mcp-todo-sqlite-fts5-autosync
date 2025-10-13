import Database from 'better-sqlite3';
import { TaskRow } from './db.js';
import { handleDatabaseError } from './db-errors.js';

/**
 * データベース操作のヘルパー関数
 */
export class DatabaseHelpers {
  constructor(private db: Database.Database) {}

  /**
   * 安全なトランザクション実行
   */
  async executeTransaction<T>(operation: () => T, context: string): Promise<T> {
    try {
      const tx = this.db.transaction(operation);
      return tx();
    } catch (error) {
      handleDatabaseError(error, context);
    }
  }

  /**
   * 安全なクエリ実行
   */
  safeQuery<T>(query: string, params: any[], context: string): T[] {
    try {
      return this.db.prepare(query).all(...params) as T[];
    } catch (error) {
      handleDatabaseError(error, context);
    }
  }

  /**
   * 安全な単一行クエリ実行
   */
  safeGet<T>(query: string, params: any[], context: string): T | null {
    try {
      return this.db.prepare(query).get(...params) as T | null;
    } catch (error) {
      handleDatabaseError(error, context);
    }
  }

  /**
   * 安全な実行クエリ
   */
  safeRun(query: string, params: any[], context: string): Database.RunResult {
    try {
      return this.db.prepare(query).run(...params);
    } catch (error) {
      handleDatabaseError(error, context);
    }
  }

  /**
   * タスクの存在チェック
   */
  taskExists(taskId: string): boolean {
    const result = this.safeGet<{ count: number }>(
      'SELECT COUNT(*) as count FROM tasks WHERE id = ?',
      [taskId],
      'check task existence'
    );
    return (result?.count ?? 0) > 0;
  }

  /**
   * タスクの取得（アーカイブ状態を考慮）
   */
  getTaskById(taskId: string, includeArchived = false): TaskRow | null {
    const query = includeArchived 
      ? 'SELECT * FROM tasks WHERE id = ?'
      : 'SELECT * FROM tasks WHERE id = ? AND archived = 0';
    
    return this.safeGet<TaskRow>(
      query,
      [taskId],
      'get task by id'
    );
  }

  /**
   * バージョンクロックの更新
   */
  updateVclock(taskId: string): number {
    const now = Date.now();
    this.safeRun(
      'UPDATE tasks SET vclock = vclock + 1, updated_at = ? WHERE id = ?',
      [now, taskId],
      'update vclock'
    );
    return now;
  }

  /**
   * アーカイブ状態の更新
   */
  updateArchiveStatus(taskId: string, archived: boolean, reason?: string): void {
    const now = Date.now();
    
    if (archived) {
      // アーカイブ時はarchived_tasksテーブルに保存
      this.safeRun(
        `INSERT OR REPLACE INTO archived_tasks (id, title, text, done, meta, vclock, due_at, archived_at, reason)
         SELECT id, title, text, done, meta, vclock, due_at, ?, ? FROM tasks WHERE id = ?`,
        [now, reason || null, taskId],
        'archive task'
      );
    } else {
      // 復元時はarchived_tasksテーブルから削除
      this.safeRun(
        'DELETE FROM archived_tasks WHERE id = ?',
        [taskId],
        'restore task'
      );
    }
    
    this.safeRun(
      'UPDATE tasks SET archived = ?, updated_at = ? WHERE id = ?',
      [archived ? 1 : 0, now, taskId],
      'update archive status'
    );
  }

  /**
   * FTSインデックスの更新
   */
  updateFTSIndex(taskId: string, title: string, text: string): void {
    const rowid = this.safeGet<{ rowid: number }>(
      'SELECT rowid FROM tasks WHERE id = ?',
      [taskId],
      'get task rowid for FTS'
    );

    if (rowid) {
      // FTSテーブルを更新
      this.safeRun(
        'INSERT OR REPLACE INTO tasks_fts(rowid, id, title, text) VALUES (?, ?, ?, ?)',
        [rowid.rowid, taskId, title, text],
        'update FTS index'
      );
    }
  }
}
