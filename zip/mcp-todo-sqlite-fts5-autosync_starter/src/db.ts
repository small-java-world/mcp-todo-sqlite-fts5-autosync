import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function openDB(dbPath: string) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -20000');
  db.pragma('mmap_size = 3000000000');

  const schema = fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}
