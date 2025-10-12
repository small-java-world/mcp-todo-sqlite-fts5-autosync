import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DB } from '../../src/utils/db.js';

const tmpDir = path.join('data', 'test-ut');
const dbFile = 'todo-ut.db';
const casDir = path.join(tmpDir, 'cas');

describe('DB (SQLite + FTS5)', () => {
  let db: DB;
  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    db = new DB(tmpDir, dbFile, casDir);
  });

  afterAll(() => {
    db.db.close();
  });

  it('upsert/search/mark_done flow', () => {
    const v1 = db.upsertTask('U-1','title1','alpha bravo charlie', {owner:'ut'});
    expect(v1).toBeGreaterThan(0);
    const hits = db.search('bravo', 10, 0, true);
    expect(hits.length).toBeGreaterThan(0);
    const v2 = db.markDone('U-1', true, v1);
    expect(v2).toBe(v1 + 1);
    const t = db.getTask('U-1');
    expect(t?.done).toBe(1);
  });

  it('CAS put/get', () => {
    const buf = Buffer.from('hello world');
    const crypto = require('crypto');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    db.putBlob(sha, buf, buf.length);
    const p = db.getBlobPath(sha);
    expect(fs.existsSync(p)).toBe(true);
  });

  it('persists due dates in tasks', () => {
    const due = Date.now() + 86_400_000;
    db.upsertTask('U-due', 'with due', 'body', null, undefined, { due_at: due });
    const row = db.getTask('U-due');
    expect(row?.due_at).toBe(due);
    const md = db.exportTodoMd();
    expect(md).toContain(new Date(due).toISOString().slice(0,10));
  });

  it('excludes archived tasks from search and recent lists', () => {
    const id = `U-arch-${Date.now()}`;
    db.upsertTask(id, 'archived task', 'find me beta', null);
    let hits = db.search('beta');
    expect(hits.some((r: any) => r.id === id)).toBe(true);
    db.archiveTask(id, 'done');
    hits = db.search('beta');
    expect(hits.some((r: any) => r.id === id)).toBe(false);
    const recent = db.listRecent(10);
    expect(recent.some((r: any) => r.id === id)).toBe(false);
  });

  it('preserves review timestamps when importing TODO.md', () => {
    const iso = '2024-05-06T12:00:00.000Z';
    const md = `# Tasks\n\n## [IMP-1] Imported {state: REVIEW}\n\n#### Reviews\n- review@${iso} by alice => APPROVED great\n- comment@${iso} by bob: "looks good"\n`;
    db.importTodoMd(md);
    const review = db.db.prepare('SELECT at FROM reviews WHERE task_id=?').get('IMP-1') as any;
    expect(review.at).toBe(Date.parse(iso));
    const comment = db.db.prepare('SELECT at FROM review_comments WHERE task_id=?').get('IMP-1') as any;
    expect(comment.at).toBe(Date.parse(iso));
  });
});


