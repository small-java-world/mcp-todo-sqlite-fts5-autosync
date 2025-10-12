const { DB } = require('./dist/utils/db.js');
const fs = require('fs');
const path = require('path');

// データディレクトリをクリーンアップ
try {
  fs.rmSync('data', { recursive: true, force: true });
} catch (e) {
  // Ignore cleanup errors
}

const db = new DB('data', 'todo.db', path.join('data','cas'));

const simpleTodoMd = `# Tasks

## [T-DEBUG-1] Debug Test

- [ ] Test task
- State: IN_PROGRESS

### Issues:

#### Issue 1: Test Issue
- **Status**: Open
- **Priority**: High
- **Category**: Bug
- **Description**: Test description
`;

console.log('Importing TODO.md...');
const result = db.importTodoMd(simpleTodoMd);
console.log('Import result:', result);

console.log('\nChecking tasks...');
const tasks = db.db.prepare('SELECT * FROM tasks').all();
console.log('Tasks:', tasks);

console.log('\nChecking issues...');
const issues = db.db.prepare('SELECT * FROM review_issues').all();
console.log('Issues:', issues);
