const { DB } = require('./dist/utils/db.js');
const fs = require('fs');
const path = require('path');

const tmpDir = path.join('data', 'tmp-meta-check');
fs.mkdirSync(tmpDir, { recursive: true });

const db = new DB(tmpDir, 'meta-check.db');
const md = [
  '## [T-META-1] Test Task {state: IN_PROGRESS, assignee: alice, due: 2025-12-31}',
  '',
  'Meta:',
  '```json',
  '{',
  '  "priority": "High",',
  '  "tags": ["release", "urgent"],',
  '  "subtasks": [',
  '    { "id": "T-META-1-a", "title": "Design review", "done": false },',
  '    { "id": "T-META-1-b", "title": "QA confirmation", "done": false }',
  '  ]',
  '}',
  '```',
  '',
  'This is the task description.'
].join('\n');

console.log('import result:', db.importTodoMd(md));
const task = db.getTask('T-META-1');
console.log('fetched meta:', task?.meta);
if (task?.meta) {
  try {
    console.log('parsed meta:', JSON.parse(task.meta));
  } catch (err) {
    console.error('parse error:', err);
  }
}

db.close();
