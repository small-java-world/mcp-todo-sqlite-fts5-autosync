import Database from 'better-sqlite3';

const db = new Database('data/todo.db');

console.log('=== Tasks Table ===');
const tasks = db.prepare('SELECT * FROM tasks').all();
console.log(JSON.stringify(tasks, null, 2));

console.log('\n=== Task State History Table ===');
try {
  const history = db.prepare('SELECT * FROM task_state_history').all();
  console.log(JSON.stringify(history, null, 2));
} catch (e) {
  console.log('task_state_history table does not exist');
}

console.log('\n=== FTS Table ===');
try {
  const fts = db.prepare('SELECT * FROM tasks_fts').all();
  console.log(JSON.stringify(fts, null, 2));
} catch (e) {
  console.log('tasks_fts table does not exist');
}

db.close();
