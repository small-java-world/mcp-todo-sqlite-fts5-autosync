/**
 * データベース操作のカスタムエラークラス
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class TaskNotFoundError extends DatabaseError {
  constructor(taskId: string) {
    super(`Task ${taskId} not found`, 'TASK_NOT_FOUND', 404);
  }
}

export class TaskArchivedError extends DatabaseError {
  constructor(taskId: string) {
    super(`Task ${taskId} is archived`, 'TASK_ARCHIVED', 409);
  }
}

export class VersionConflictError extends DatabaseError {
  constructor(taskId: string, expected: number, actual: number) {
    super(
      `Version conflict for task ${taskId}: expected ${expected}, got ${actual}`,
      'VERSION_CONFLICT',
      409
    );
  }
}

export class DatabaseCorruptionError extends DatabaseError {
  constructor(message: string) {
    super(`Database corruption: ${message}`, 'DATABASE_CORRUPTION', 500);
  }
}

/**
 * エラーハンドリングのヘルパー関数
 */
export function handleDatabaseError(error: any, context: string): never {
  if (error instanceof DatabaseError) {
    throw error;
  }

  if (error.message?.includes('database disk image is malformed')) {
    throw new DatabaseCorruptionError(error.message);
  }

  if (error.code === 'SQLITE_CONSTRAINT') {
    throw new DatabaseError(
      `Database constraint violation in ${context}: ${error.message}`,
      'CONSTRAINT_VIOLATION',
      400
    );
  }

  throw new DatabaseError(
    `Unexpected error in ${context}: ${error.message}`,
    'UNEXPECTED_ERROR',
    500
  );
}
