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
    // compute sha256 here similarly to server, but we only test persistence path
    const crypto = require('crypto');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    db.putBlob(sha, buf, buf.length);
    const p = db.getBlobPath(sha);
    expect(fs.existsSync(p)).toBe(true);
  });
});
