import { TaskRow } from './db.js';
import { TaskNotFoundError, TaskArchivedError, VersionConflictError } from './db-errors.js';

/**
 * タスクの存在チェック
 */
export function validateTaskExists(task: TaskRow | null, taskId: string): asserts task is TaskRow {
  if (!task) {
    throw new TaskNotFoundError(taskId);
  }
}

/**
 * タスクがアーカイブされていないことをチェック
 */
export function validateTaskNotArchived(task: TaskRow): void {
  if (task.archived === 1) {
    throw new TaskArchivedError(task.id);
  }
}

/**
 * バージョン競合チェック
 */
export function validateVersion(task: TaskRow, if_vclock?: number): void {
  if (if_vclock != null && if_vclock !== task.vclock) {
    throw new VersionConflictError(task.id, if_vclock, task.vclock);
  }
}

/**
 * タスクIDの形式チェック
 */
export function validateTaskId(taskId: string): void {
  if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
    throw new Error('Invalid task ID: must be a non-empty string');
  }
}

/**
 * 数値パラメータのバリデーション
 */
export function validatePositiveNumber(value: number, name: string): void {
  if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
    throw new Error(`Invalid ${name}: must be a non-negative integer`);
  }
}

/**
 * 文字列パラメータのバリデーション
 */
export function validateString(value: string | null | undefined, name: string, maxLength?: number): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${name}: must be a string`);
  }
  
  if (maxLength && value.length > maxLength) {
    throw new Error(`Invalid ${name}: must be ${maxLength} characters or less`);
  }
  
  return value;
}
