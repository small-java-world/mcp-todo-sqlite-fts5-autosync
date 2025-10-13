import fs from 'fs';
import path from 'path';
import { DB } from './dist/utils/db.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const resolveWithinData = (raw, segments) => {
  if (!raw || !raw.trim()) {
    return path.join(DATA_DIR, ...segments);
  }
  return path.isAbsolute(raw) ? raw : path.join(DATA_DIR, raw);
};

const DB_FILE = process.env.DB_FILE || 'todo.db';
const CAS_DIR = resolveWithinData(process.env.CAS_DIR, ['cas']);
const SHADOW_PATH = resolveWithinData(process.env.SHADOW_PATH, ['shadow', 'TODO.shadow.md']);

const db = new DB(DATA_DIR, DB_FILE, CAS_DIR);

console.log('=== Manual Export Test ===');
const markdown = db.exportTodoMd();
console.log('Exported Markdown:');
console.log(markdown);

fs.mkdirSync(path.dirname(SHADOW_PATH), { recursive: true });
fs.writeFileSync(SHADOW_PATH, markdown, 'utf8');

console.log('\n=== Shadow file created ===');
console.log('Shadow file path:', SHADOW_PATH);
console.log('Shadow file content:');
console.log(fs.readFileSync(SHADOW_PATH, 'utf8'));