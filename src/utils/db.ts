
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type TaskRow = {
  id: string;
  title: string;
  text: string;
  done: number;
  archived: number;
  parent_id?: string | null;
  level: number;
  state: string;
  assignee?: string | null;
  due_at?: number | null;
  meta: string | null;
  vclock: number;
  updated_at: number;
};

export class DB {
  db: Database.Database;
  casRoot: string;

  constructor(dataDir = 'data', dbFile = 'todo.db', casRoot = path.join('data','cas')) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(casRoot, { recursive: true });
    this.casRoot = casRoot;
    const full = path.join(dataDir, dbFile);
    this.db = new Database(full);
    this.pragma();
    this.initSchema();
  }

  pragma() {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    // cache_size: negative means KB
    this.db.pragma('cache_size = -200000'); // ~200MB
    // some platforms ignore mmap_size via better-sqlite3, acceptable
  }

  initSchema() {
    const sql = `
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      meta TEXT,
      vclock INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      parent_id TEXT,
      level INTEGER NOT NULL DEFAULT 2,
      state TEXT NOT NULL DEFAULT 'DRAFT',
      assignee TEXT,
      due_at INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(id, title, text, content='tasks', content_rowid='rowid');
    CREATE TABLE IF NOT EXISTS blobs (
      sha256 TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_blobs (
      task_id TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      PRIMARY KEY(task_id, sha256)
    );
    `;
    this.db.exec(sql);

    // Backfill columns for pre-existing databases
    try { this.db.exec(`ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`); } catch (e) { /* ignore if exists */ }
    try { this.db.exec(`ALTER TABLE tasks ADD COLUMN due_at INTEGER;`); } catch (e) { /* ignore if exists */ }
    try { this.db.exec(`ALTER TABLE archived_tasks ADD COLUMN due_at INTEGER;`); } catch (e) { /* ignore if exists */ }
    this.db.exec(`
  CREATE TABLE IF NOT EXISTS archived_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL,
    meta TEXT,
    vclock INTEGER NOT NULL,
    due_at INTEGER,
    archived_at INTEGER NOT NULL,
    reason TEXT
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    by TEXT NOT NULL,
    decision TEXT NOT NULL,
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS review_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    by TEXT NOT NULL,
    text TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_state_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    at INTEGER NOT NULL,
    by TEXT,
    note TEXT
  );
`);
    // Triggers to sync FTS with base table
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
        INSERT INTO tasks_fts(rowid, id, title, text) VALUES (new.rowid, new.id, new.title, new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, id, title, text) VALUES('delete', old.rowid, old.id, old.title, old.text);
      END;
      CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
        INSERT INTO tasks_fts(tasks_fts, rowid, id, title, text) VALUES('delete', old.rowid, old.id, old.title, old.text);
        INSERT INTO tasks_fts(rowid, id, title, text) VALUES (new.rowid, new.id, new.title, new.text);
      END;
    `);
  }

  upsertTask(
    id: string,
    title: string,
    text: string,
    meta?: any | null,
    if_vclock?: number,
    extra?: { parent_id?: string | null; level?: number; state?: string; assignee?: string | null; due_at?: number | null }
  ) {
    const now = Date.now();
    const row = this.getTask(id);
    const metaProvided = meta !== undefined;
    const parentProvided = extra ? Object.prototype.hasOwnProperty.call(extra, 'parent_id') : false;
    const dueProvided = extra ? Object.prototype.hasOwnProperty.call(extra, 'due_at') : false;

    if (row) {
      if (row.archived) {
        const err: any = new Error('archived');
        err.code = 409;
        throw err;
      }
      if (if_vclock != null && if_vclock !== row.vclock) {
        const err: any = new Error('vclock_conflict');
        err.code = 409;
        err.current = row.vclock;
        throw err;
      }
      const vclock = row.vclock + 1;
      const st = extra?.state ?? row.state;
      const asg = extra?.assignee ?? row.assignee ?? null;
      const pid = parentProvided ? extra!.parent_id ?? null : row.parent_id ?? null;
      const lvl = extra?.level != null ? extra.level : row.level;
      const due = dueProvided ? extra!.due_at ?? null : row.due_at ?? null;
      const metaJson = metaProvided ? (meta === null ? null : JSON.stringify(meta)) : row.meta;

      this.db
        .prepare(`UPDATE tasks SET title=?, text=?, meta=?, vclock=?, updated_at=?, parent_id=?, level=?, state=?, assignee=?, due_at=? WHERE id=?`)
        .run(title, text, metaJson, vclock, now, pid, lvl, st, asg, due, id);

      if (st !== row.state) {
        this.db.prepare(`INSERT INTO task_state_history(task_id, from_state, to_state, at) VALUES (?,?,?,?)`).run(id, row.state, st, now);
      }
      return vclock;
    } else {
      const vclock = 1;
      const st = extra?.state ?? 'DRAFT';
      const asg = extra?.assignee ?? null;
      const pid = parentProvided ? extra!.parent_id ?? null : null;
      const lvl = extra?.level != null ? extra.level : 2;
      const due = dueProvided ? extra!.due_at ?? null : null;
      const metaJson = meta === undefined ? null : meta === null ? null : JSON.stringify(meta);

      this.db
        .prepare(`INSERT INTO tasks(id,title,text,done,meta,vclock,updated_at,parent_id,level,state,assignee,due_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, title, text, 0, metaJson, vclock, now, pid, lvl, st, asg, due);
      this.db.prepare(`INSERT INTO task_state_history(task_id, from_state, to_state, at) VALUES (?,?,?,?)`).run(id, null, st, now);
      return vclock;
    }
  }


  markDone(id: string, done: boolean, if_vclock?: number) {
    const row = this.getTask(id);
    if (!row) {
      const err: any = new Error('not_found');
      err.code = 404;
      throw err;
    }
    if (row.archived) { const err: any = new Error('archived'); err.code = 409; throw err; }
    if (if_vclock != null && if_vclock !== row.vclock) {
      const err: any = new Error('vclock_conflict');
      err.code = 409;
      err.current = row.vclock;
      throw err;
    }
    const vclock = row.vclock + 1;
    const now = Date.now();
    this.db.prepare(`UPDATE tasks SET done=?, vclock=?, updated_at=? WHERE id=?`)
      .run(done ? 1 : 0, vclock, now, id);
    return vclock;
  }

  getTask(id: string): TaskRow | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id=?`).get(id) as any;
    return row || null;
  }

  listRecent(limit=20) {
    return this.db.prepare(`SELECT id,title,done,updated_at,vclock FROM tasks WHERE archived=0 ORDER BY updated_at DESC LIMIT ?`).all(limit);
  }

  search(q: string, limit=20, offset=0, highlight=false) {
    const rows = this.db.prepare(
      `SELECT t.id, t.title,
              bm25(tasks_fts) AS score,
              ${highlight ? "snippet(tasks_fts, 2, '<b>', '</b>', '…', 12)" : "NULL"} AS snippet
       FROM tasks_fts JOIN tasks t ON t.rowid = tasks_fts.rowid
       WHERE tasks_fts MATCH ? AND t.archived=0
       ORDER BY score LIMIT ? OFFSET ?`
    ).all(q, limit, offset);
    return rows;
  }

  // CAS operations
  hasBlob(sha256: string) {
    const row = this.db.prepare(`SELECT sha256 FROM blobs WHERE sha256=?`).get(sha256);
    return !!row;
  }

  putBlob(sha256: string, bytes: Buffer, size: number) {
    const p = this.getBlobPath(sha256);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, bytes);
    }
    const now = Date.now();
    this.db.prepare(`INSERT OR IGNORE INTO blobs(sha256,size,created_at) VALUES (?,?,?)`).run(sha256, size, now);
    return p;
  }

  getBlobPath(sha256: string) {
    return path.join(this.casRoot, sha256);
  }

  archiveTask(id: string, reason?: string) {
  const row = this.getTask(id);
  if (!row) { const e: any = new Error('not_found'); e.code = 404; throw e; }
  if (row.archived) return { ok: true, archived_at: Date.now() };
  const now = Date.now();
  const tx = this.db.transaction(() => {
    this.db.prepare(`INSERT OR REPLACE INTO archived_tasks (id,title,text,done,meta,vclock,due_at,archived_at,reason) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(row.id, row.title, row.text, row.done, row.meta, row.vclock, row.due_at ?? null, now, reason ?? null);
    // delete from FTS
    const rid = (this.db.prepare(`SELECT rowid FROM tasks WHERE id=?`).get(id) as any)?.rowid;
    if (rid != null) {
      this.db.prepare(`INSERT INTO tasks_fts(tasks_fts,rowid,id,title,text) VALUES('delete', ?, ?, ?, ?)`)
        .run(rid, row.id, row.title, row.text);
    }
    this.db.prepare(`UPDATE tasks SET archived=1, updated_at=? WHERE id=?`).run(now, id);
  });
  tx();
  return { ok: true, archived_at: now };
  }

  restoreTask(id: string) {
  const snap = this.db.prepare(`SELECT * FROM archived_tasks WHERE id=?`).get(id) as any;
  if (!snap) { const e: any = new Error('not_found'); e.code = 404; throw e; }
  const now = Date.now();
  const tx = this.db.transaction(() => {
    this.db.prepare(`UPDATE tasks SET archived=0, updated_at=?, title=?, text=?, done=?, meta=?, vclock=?, due_at=? WHERE id=?`)
      .run(now, snap.title, snap.text, snap.done, snap.meta, snap.vclock, snap.due_at ?? null, id);
    const rid = (this.db.prepare(`SELECT rowid FROM tasks WHERE id=?`).get(id) as any)?.rowid;
    if (rid != null) {
      this.db.prepare(`INSERT INTO tasks_fts(rowid,id,title,text) VALUES (?,?,?,?)`)
        .run(rid, snap.id, snap.title, snap.text);
    }
    this.db.prepare(`DELETE FROM archived_tasks WHERE id=?`).run(id);
  });
  tx();
  return { ok: true };
  }

  listArchived(limit=20, offset=0) {
  return this.db.prepare(`SELECT id,title,archived_at,reason FROM archived_tasks ORDER BY archived_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  }

  setState(id: string, to_state: string, by?: string | null, note?: string | null, at?: number) {
    const row = this.getTask(id);
    if (!row) { const e: any = new Error('not_found'); e.code = 404; throw e; }
    if (row.archived) { const e: any = new Error('archived'); e.code = 409; throw e; }
    if (row.state === to_state) return { vclock: row.vclock };
    const ts = at ?? Date.now();
    const vclock = row.vclock + 1;
    this.db.prepare(`UPDATE tasks SET state=?, done=?, vclock=?, updated_at=? WHERE id=?`)
      .run(to_state, to_state === 'DONE' ? 1 : 0, vclock, ts, id);
    this.db.prepare(`INSERT INTO task_state_history(task_id, from_state, to_state, at, by, note) VALUES (?,?,?,?,?,?)`)
      .run(id, row.state, to_state, ts, by ?? null, note ?? null);
    return { vclock };
  }

  addReview(task_id: string, decision: string, by: string, note?: string | null, at?: number | null) {
    const row = this.getTask(task_id);
    if (!row) { const e: any = new Error('not_found'); e.code = 404; throw e; }
    const ts = at ?? Date.now();
    this.db.prepare(`INSERT INTO reviews(task_id, at, by, decision, note) VALUES (?,?,?,?,?)`)
      .run(task_id, ts, by, decision, note ?? null);
    if (decision === 'REQUEST_CHANGES') {
      return this.setState(task_id, 'CHANGES_REQUESTED', by, note ?? undefined, ts);
    } else if (decision === 'APPROVED') {
      return this.setState(task_id, 'APPROVED', by, note ?? undefined, ts);
    }
    return { ok: true };
  }

  addComment(task_id: string, by: string, text: string, at?: number | null) {
    const ts = at ?? Date.now();
    this.db.prepare(`INSERT INTO review_comments(task_id, at, by, text) VALUES (?,?,?,?)`)
      .run(task_id, ts, by, text);
    return { ok: true };
  }

  // --- TODO.md import/export (minimal) ---
  importTodoMd(md: string) {
  const lines = md.split(/\r?\n/);
  let currentSection: string|null = null;
  const sectionStack: string[] = [];
  let lastTaskId: string|null = null;

  const parseAttrs = (s: string) => {
    const out:any = {};
    s.split(',').forEach(kv => {
      const m = kv.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
      if (m) out[m[1]] = m[2].replace(/^\{|\}$/g,'').trim();
    });
    return out;
  };

  const isoToEpoch = (s: string) => {
    const t = Date.parse(s);
    return isNaN(t) ? Date.now() : t;
  };

  const reL2 = /^## \[(.+?)\]\s+(.*?)\s*\{([^}]*)\}\s*$/;
  const reL3 = /^### \[(.+?)\]\s+(.*?)\s*\{([^}]*)\}\s*$/;
  const reMeta = /^Meta:\s*$/i;
  const reReviewHdr = /^####\s+Reviews\s*$/i;
  const reReview = /^-\s+review@([^\s]+)\s+by\s+(\S+)\s*=>\s*(\S+)(?:\s+(.+))?$/i;
  const reComment = /^-\s+comment@([^\s]+)\s+by\s+(\S+):\s*"(.+)"\s*$/i;

  let inMeta = false;
  let metaAccum: any = {};
  let inReviews = false;

  for (let i=0;i<lines.length;i++) {
    const line = lines[i];

    if (line.startsWith('# ') && !line.startsWith('##')) {
      currentSection = line.replace(/^#\s+/, '').trim();
      inMeta = false; inReviews=false;
      continue;
    }
    const m2 = line.match(reL2);
    if (m2) {
      const [_, id, title, attrsRaw] = m2;
      const attrs = parseAttrs(attrsRaw);
      const state = (attrs.state || 'DRAFT').replace(/[{},]/g,'').trim();
      const assignee = attrs.assignee ? attrs.assignee.trim() : null;
      const due = attrs.due ? isoToEpoch(attrs.due) : null;
      this.upsertTask(id, title, '', null, undefined, { parent_id: null, level: 2, state, assignee, due_at: due });
      lastTaskId = id;
      inMeta = false; inReviews=false; metaAccum = {};
      continue;
    }
    const m3 = line.match(reL3);
    if (m3) {
      const [_, id, title, attrsRaw] = m3;
      const attrs = parseAttrs(attrsRaw);
      const state = (attrs.state || 'DRAFT').replace(/[{},]/g,'').trim();
      const assignee = attrs.assignee ? attrs.assignee.trim() : null;
      const due = attrs.due ? isoToEpoch(attrs.due) : null;
      // parent is last L2
      const parent = lastTaskId;
      this.upsertTask(id, title, '', null, undefined, { parent_id: parent ?? null, level: 3, state, assignee, due_at: due });
      inMeta = false; inReviews=false;
      continue;
    }
    if (reMeta.test(line)) {
      inMeta = true; inReviews=false;
      continue;
    }
    if (reReviewHdr.test(line)) {
      inReviews = true; inMeta=false;
      continue;
    }
    if (inMeta && line.trim()) {
      // Skip meta lines
    }

    if (inReviews) {
      const mr = line.match(reReview);
      if (mr && lastTaskId) {
        const [__, atIso, by, decision, rest] = mr;
        const at = isoToEpoch(atIso);
        this.addReview(lastTaskId, decision, by, rest ? rest.trim() : null, at);
        continue;
      }
      const mc = line.match(reComment);
      if (mc && lastTaskId) {
        const [__, atIso, by, text] = mc;
        const at = isoToEpoch(atIso);
        this.addComment(lastTaskId, by, text, at);
        continue;
      }
    }
  }
  return { ok: true };
  }

  exportTodoMd(): string {
  // naive export: list L2 (parent null) and their L3
  const rows2 = this.db.prepare(`SELECT * FROM tasks WHERE level=2 AND archived=0 ORDER BY updated_at DESC`).all() as any[];
  const childStmt = this.db.prepare(`SELECT * FROM tasks WHERE parent_id=? AND archived=0 ORDER BY updated_at ASC`);
  let out = '# Tasks\n\n';
  for (const r of rows2) {
    const attrs = [`state: ${r.state}`];
    if (r.assignee) attrs.push(`assignee: ${r.assignee}`);
    if (r.due_at) attrs.push(`due: ${new Date(r.due_at).toISOString().slice(0,10)}`);
    out += `## [${r.id}] ${r.title} {${attrs.join(', ')}}\n`;
    const kids = childStmt.all(r.id) as any[];
    for (const k of kids) {
      const attrs3 = [`state: ${k.state}`];
      out += `### [${k.id}] ${k.title} {${attrs3.join(', ')}}\n`;
    }
    // reviews
    const revs = this.db.prepare(`SELECT * FROM reviews WHERE task_id=? ORDER BY at ASC`).all(r.id) as any[];
    const coms = this.db.prepare(`SELECT * FROM review_comments WHERE task_id=? ORDER BY at ASC`).all(r.id) as any[];
    if (revs.length || coms.length) {
      out += `\n#### Reviews\n`;
      for (const v of revs) {
        out += `- review@${new Date(v.at).toISOString()} by ${v.by} => ${v.decision}${v.note?(' '+v.note):''}\n`;
      }
      for (const c of coms) {
        out += `- comment@${new Date(c.at).toISOString()} by ${c.by}: "${c.text}"\n`;
      }
    }
    out += `\n`;
  }
  return out;
  }
}











