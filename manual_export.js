import { DB } from './dist/utils/db.js';

const db = new DB('data', 'todo.db', 'data/cas');

console.log('=== Manual Export Test ===');
const markdown = db.exportTodoMd();
console.log('Exported Markdown:');
console.log(markdown);

// 影コピーファイルに書き込み
import fs from 'fs';
import path from 'path';

const shadowPath = 'data/shadow/TODO.shadow.md';
fs.mkdirSync(path.dirname(shadowPath), { recursive: true });
fs.writeFileSync(shadowPath, markdown, 'utf8');

console.log('\n=== Shadow file created ===');
console.log('Shadow file path:', shadowPath);
console.log('Shadow file content:');
console.log(fs.readFileSync(shadowPath, 'utf8'));
