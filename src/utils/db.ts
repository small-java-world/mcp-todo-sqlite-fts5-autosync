
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
  CREATE TABLE IF NOT EXISTS task_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    note TEXT,
    UNIQUE(task_id, target_id, relation)
  );
  CREATE TABLE IF NOT EXISTS task_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS review_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    review_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT DEFAULT 'medium',
    category TEXT,
    severity TEXT DEFAULT 'medium',
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT,
    closed_at INTEGER,
    closed_by TEXT,
    due_date INTEGER,
    tags TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (review_id) REFERENCES reviews(id)
  );
  CREATE TABLE IF NOT EXISTS issue_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    response_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT 0,
    attachment_sha256 TEXT,
    FOREIGN KEY (issue_id) REFERENCES review_issues(id)
  );
  CREATE TABLE IF NOT EXISTS issue_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_issue_id INTEGER NOT NULL,
    target_issue_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    FOREIGN KEY (source_issue_id) REFERENCES review_issues(id),
    FOREIGN KEY (target_issue_id) REFERENCES review_issues(id),
    UNIQUE(source_issue_id, target_issue_id, relation_type)
  );
  CREATE INDEX IF NOT EXISTS idx_review_issues_task_id ON review_issues(task_id);
  CREATE INDEX IF NOT EXISTS idx_review_issues_status ON review_issues(status);
  CREATE INDEX IF NOT EXISTS idx_review_issues_priority ON review_issues(priority);
  CREATE INDEX IF NOT EXISTS idx_review_issues_category ON review_issues(category);
  CREATE INDEX IF NOT EXISTS idx_review_issues_created_by ON review_issues(created_by);
  CREATE INDEX IF NOT EXISTS idx_review_issues_created_at ON review_issues(created_at);
  CREATE INDEX IF NOT EXISTS idx_issue_responses_issue_id ON issue_responses(issue_id);
  CREATE INDEX IF NOT EXISTS idx_issue_responses_created_at ON issue_responses(created_at);
  CREATE INDEX IF NOT EXISTS idx_issue_relations_source ON issue_relations(source_issue_id);
  CREATE INDEX IF NOT EXISTS idx_issue_relations_target ON issue_relations(target_issue_id);
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
    
    // Check for duplicate state change (same timestamp and same state change)
    const existing = this.db.prepare(`
      SELECT COUNT(*) as count FROM task_state_history 
      WHERE task_id = ? AND from_state = ? AND to_state = ? AND at = ? AND by = ?
    `).get(id, row.state, to_state, ts, by ?? null);
    
    if ((existing as any).count === 0) {
  this.db.prepare(`UPDATE tasks SET state=?, done=?, vclock=?, updated_at=? WHERE id=?`)
        .run(to_state, to_state === 'DONE' ? 1 : 0, vclock, ts, id);
  this.db.prepare(`INSERT INTO task_state_history(task_id, from_state, to_state, at, by, note) VALUES (?,?,?,?,?,?)`)
        .run(id, row.state, to_state, ts, by ?? null, note ?? null);
    } else {
      // Duplicate found, just update vclock without inserting history
      this.db.prepare(`UPDATE tasks SET vclock=? WHERE id=?`)
        .run(vclock, id);
    }
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
  const reTimeline = /^Timeline:\s*$/i;
  const reRelated = /^Related:\s*$/i;
  const reRelatedWithContent = /^Related:\s+.+$/i;
  const reNotes = /^Notes:\s*$/i;
  const reReviewHdr = /^####\s+Reviews\s*$/i;
  const reIssues = /^Issues:\s*$/i;
  const reReview = /^-\s+review@([^\s]+)\s+by\s+(\S+)\s*=>\s*(\S+)(?:\s+(.+))?$/i;
  const reComment = /^-\s+comment@([^\s]+)\s+by\s+(\S+):\s*"(.+)"\s*$/i;

  // Issues parsing
  const reIssueHeader = /^-\s+\*\*([^*]+)\*\*:\s*(.+)$/;
  const reIssueField = /^  - ([^:]+):\s*(.+)$/;
  const reIssueResponse = /^\s*-\s+(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+by\s+(\S+)\s+\((\w+)\):\s*"([^"]+)"(\s*\(internal\))?$/;

  // Timeline parsing
  const reTimelineEvent = /^-\s+(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+\|\s+(\w+)\s+([^|]+?)(?:\s+note\s+"([^"]*)")?$/;
  const reTimelineState = /^STATE\s+(\w+)\s+by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/;
  const reTimelineReview = /^REVIEW\s+(\w+)\s+by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/;
  const reTimelineComment = /^COMMENT\s+by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/;
  const reTimelineArchive = /^ARCHIVE\s+by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/;
  const reTimelineRestore = /^RESTORE\s+by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/;

  // Related parsing
  const reRelatedItem = /^-\s+\[([^\]]+)\](?:\s+\(([^)]+)\))?$/;
  const reRelatedSingle = /^Related:\s*\[([^\]]+)\](?:\s+\[([^\]]+)\])*(?:\s+\[([^\]]+)\])*$/;

  // Notes parsing
  const reNoteItem = /^-\s+(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+\|\s+(\S+):\s+(.+)$/;
  const reNoteInternal = /^-\s+(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+\|\s+(\S+):\s+\(internal\)\s+(.+)$/;

  let inMeta = false, inIssues = false;
  let inTimeline = false;
  let inRelated = false;
  let inNotes = false;
  let metaAccum: any = {};
  let inReviews = false;
  let currentIssue: any = null;
  let metaJson = '';
  let inMetaJson = false;

  for (let i=0;i<lines.length;i++) {
    const line = lines[i];

    if (line.startsWith('# ') && !line.startsWith('##')) {
      currentSection = line.replace(/^#\s+/, '').trim();
      inMeta = false; inTimeline = false; inRelated = false; inNotes = false; inReviews=false; inIssues = false;
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
      inMeta = false; inTimeline = false; inRelated = false; inNotes = false; inReviews=false; inIssues = false; metaAccum = {};
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
      inMeta = false; inTimeline = false; inRelated = false; inNotes = false; inReviews=false; inIssues = false;
      continue;
    }
    if (reMeta.test(line)) {
      inMeta = true; inTimeline = false; inRelated = false; inNotes = false; inReviews=false; inIssues = false;
      continue;
    }
    if (reTimeline.test(line)) {
      inTimeline = true; inMeta = false; inRelated = false; inNotes = false; inReviews=false; inIssues = false;
      continue;
    }
    if (reRelated.test(line)) {
      inRelated = true; inMeta = false; inTimeline = false; inNotes = false; inReviews=false; inIssues = false;
      continue;
    }
    if (reRelatedWithContent.test(line)) {
      // Handle single line Related format
      const relatedText = line.replace(/^Related:\s*/i, '').trim();
      const idMatches = relatedText.match(/\[([^\]]+)\]/g);
      if (idMatches && lastTaskId) {
        const now = Date.now();
        for (const idMatch of idMatches) {
          const targetId = idMatch.slice(1, -1); // Remove [ and ]
          try {
            this.db.prepare(`
              INSERT INTO task_links (task_id, target_id, relation, created_at, note)
              VALUES (?, ?, ?, ?, ?)
            `).run(lastTaskId, targetId, 'related to', now, null);
          } catch (e) {
            // Ignore duplicate links
          }
        }
      }
      continue;
    }
    if (reNotes.test(line)) {
      inNotes = true; inMeta = false; inTimeline = false; inRelated = false; inReviews=false; inIssues = false;
      continue;
    }
    if (reIssues.test(line)) {
      inIssues = true; inMeta = false; inTimeline = false; inRelated = false; inNotes = false; inReviews = false;
      continue;
    }
    if (reReviewHdr.test(line)) {
      inReviews = true; inMeta=false; inIssues = false;
      continue;
    }
    if (inMeta && line.trim()) {
      // Meta JSON parsing
      if (line.trim().startsWith('```json')) {
        inMetaJson = true;
        metaJson = '';
        continue;
      }
      if (line.trim().startsWith('```') && inMetaJson) {
        inMetaJson = false;
        try {
          const meta = JSON.parse(metaJson);
          if (lastTaskId) {
            this.db.prepare('UPDATE tasks SET meta = ? WHERE id = ?').run(JSON.stringify(meta), lastTaskId);
          }
        } catch (e) {
          console.warn('Invalid JSON in meta block:', e);
        }
        continue;
      }
      if (inMetaJson) {
        metaJson += line + '\n';
        continue;
      }
    }

    if (inTimeline && line.trim()) {
      // More flexible timeline parsing
      const timelineMatch = line.match(/^-\s+(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+\|\s+(\w+)\s+([^|]+?)(?:\s+note\s+"([^"]*)")?$/);
      if (timelineMatch && lastTaskId) {
        const [_, timestamp, eventType, eventData, note] = timelineMatch;
        const at = isoToEpoch(timestamp);
        
        // Parse event data based on event type
        if (eventType === 'STATE') {
          const stateMatch = eventData.match(/^(\w+)\s+by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/);
          if (stateMatch) {
            const [__, toState, by, stateNote] = stateMatch;
            this.setState(lastTaskId, toState, by, stateNote || note, at);
            continue;
          }
        } else if (eventType === 'REVIEW') {
          const reviewMatch = eventData.match(/^(\w+)\s+by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/);
          if (reviewMatch) {
            const [__, decision, by, reviewNote] = reviewMatch;
            this.addReview(lastTaskId, decision, by, reviewNote || note, at);
            continue;
          }
        } else if (eventType === 'COMMENT') {
          const commentMatch = eventData.match(/^by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/);
          if (commentMatch) {
            const [__, by, commentText] = commentMatch;
            this.addComment(lastTaskId, by, commentText || note || '', at);
            continue;
          }
        } else if (eventType === 'ARCHIVE') {
          const archiveMatch = eventData.match(/^by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/);
          if (archiveMatch) {
            const [__, by, archiveNote] = archiveMatch;
            this.archiveTask(lastTaskId, archiveNote || note);
            continue;
          }
        } else if (eventType === 'RESTORE') {
          const restoreMatch = eventData.match(/^by\s+(\S+)(?:\s+note\s+"([^"]*)")?$/);
          if (restoreMatch) {
            const [__, by, restoreNote] = restoreMatch;
            this.restoreTask(lastTaskId);
            continue;
          }
        } else {
          // Unknown event type - ignore silently
          continue;
        }
      }
    }

    if (inRelated && line.trim()) {
      const relatedMatch = line.match(reRelatedItem);
      if (relatedMatch && lastTaskId) {
        const [__, targetId, relation] = relatedMatch;
        const now = Date.now();
        try {
          this.db.prepare(`
            INSERT INTO task_links (task_id, target_id, relation, created_at, note)
            VALUES (?, ?, ?, ?, ?)
          `).run(lastTaskId, targetId, relation || 'related to', now, null);
        } catch (e) {
          // Ignore duplicate links
        }
        continue;
      }
      
      // Single line related format - capture all IDs
      const singleRelatedMatch = line.match(/^Related:\s*(.+)$/);
      if (singleRelatedMatch && lastTaskId) {
        const relatedText = singleRelatedMatch[1].trim();
        // Extract all [ID] patterns
        const idMatches = relatedText.match(/\[([^\]]+)\]/g);
        if (idMatches) {
          const now = Date.now();
          for (const idMatch of idMatches) {
            const targetId = idMatch.slice(1, -1); // Remove [ and ]
            try {
              this.db.prepare(`
                INSERT INTO task_links (task_id, target_id, relation, created_at, note)
                VALUES (?, ?, ?, ?, ?)
              `).run(lastTaskId, targetId, 'related to', now, null);
            } catch (e) {
              // Ignore duplicate links
            }
          }
        }
        continue;
      }
      
      
      // Alternative single line format
      const altSingleRelatedMatch = line.match(/^Related:\s*\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]$/);
      if (altSingleRelatedMatch && lastTaskId) {
        const [__, ...targetIds] = altSingleRelatedMatch;
        const now = Date.now();
        for (const targetId of targetIds.filter(Boolean)) {
          try {
            this.db.prepare(`
              INSERT INTO task_links (task_id, target_id, relation, created_at, note)
              VALUES (?, ?, ?, ?, ?)
            `).run(lastTaskId, targetId, 'related to', now, null);
          } catch (e) {
            // Ignore duplicate links
          }
        }
        continue;
      }
    }

    if (inNotes && line.trim()) {
      // Check for internal note first (with optional indentation)
      const internalNoteMatch = line.match(/^\s*-\s+(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+\|\s+(\S+):\s+\(internal\)\s+(.+)$/);
      if (internalNoteMatch && lastTaskId) {
        const [__, timestamp, author, body] = internalNoteMatch;
        const at = isoToEpoch(timestamp);
        this.db.prepare(`
          INSERT INTO task_notes (task_id, at, author, body, is_internal)
          VALUES (?, ?, ?, ?, ?)
        `).run(lastTaskId, at, author, body, 1);
        continue;
      }
      
      // Check for regular note (with optional indentation)
      const noteMatch = line.match(/^\s*-\s+(\d{4}-\d{2}-\d{2}T[\d:.-]+Z)\s+\|\s+(\S+):\s+(.+)$/);
      if (noteMatch && lastTaskId) {
        const [__, timestamp, author, body] = noteMatch;
        const at = isoToEpoch(timestamp);
        this.db.prepare(`
          INSERT INTO task_notes (task_id, at, author, body, is_internal)
          VALUES (?, ?, ?, ?, ?)
        `).run(lastTaskId, at, author, body, 0);
        continue;
      }
    }

    if (inIssues && line.trim()) {
      // Issues parsing
      const issueHeaderMatch = reIssueHeader.exec(line);
      if (issueHeaderMatch) {
        // Save previous issue if exists
        if (currentIssue && lastTaskId) {
          this.saveIssue(currentIssue, lastTaskId);
        }
        
        // Start new issue
        const [, priority, title] = issueHeaderMatch;
        currentIssue = {
          title: title.trim(),
          priority: priority.toLowerCase(),
          status: 'open',
          created_at: Date.now(),
          created_by: 'system',
          responses: []
        };
        continue;
      }
      
      if (currentIssue) {
        const fieldMatch = reIssueField.exec(line);
        if (fieldMatch) {
          const [, field, value] = fieldMatch;
          const fieldName = field.toLowerCase().replace(/\s+/g, '_');
          
          switch (fieldName) {
            case 'status':
              currentIssue.status = value.toLowerCase();
              break;
            case 'priority':
              currentIssue.priority = value.toLowerCase();
              break;
            case 'category':
              currentIssue.category = value.toLowerCase();
              break;
            case 'severity':
              currentIssue.severity = value.toLowerCase();
              break;
            case 'created':
              // Handle "2025-01-16T09:00:00Z by reviewer1" format
              const createdMatch = value.match(/^(.+?)\s+by\s+(.+)$/);
              if (createdMatch) {
                currentIssue.created_at = new Date(createdMatch[1]).getTime();
                currentIssue.created_by = createdMatch[2];
              } else {
                currentIssue.created_at = new Date(value).getTime();
              }
              break;
            case 'created_by':
              currentIssue.created_by = value;
              break;
            case 'resolved':
              // Handle "2025-01-16T16:00:00Z by developer1" format
              const resolvedMatch = value.match(/^(.+?)\s+by\s+(.+)$/);
              if (resolvedMatch) {
                currentIssue.resolved_at = new Date(resolvedMatch[1]).getTime();
                currentIssue.resolved_by = resolvedMatch[2];
              } else {
                currentIssue.resolved_at = new Date(value).getTime();
              }
              break;
            case 'resolved_by':
              currentIssue.resolved_by = value;
              break;
            case 'closed':
              // Handle "2025-01-16T17:05:00Z by reviewer1" format
              const closedMatch = value.match(/^(.+?)\s+by\s+(.+)$/);
              if (closedMatch) {
                currentIssue.closed_at = new Date(closedMatch[1]).getTime();
                currentIssue.closed_by = closedMatch[2];
              } else {
                currentIssue.closed_at = new Date(value).getTime();
              }
              break;
            case 'closed_by':
              currentIssue.closed_by = value;
              break;
            case 'due':
              currentIssue.due_date = new Date(value).getTime();
              break;
            case 'tags':
              currentIssue.tags = value.match(/\[([^\]]+)\]/g)?.map(tag => tag.slice(1, -1)) || [];
              break;
          }
          continue;
        }
        
        const responseMatch = reIssueResponse.exec(line);
        if (responseMatch) {
          const [, timestamp, author, responseType, content, isInternal] = responseMatch;
          currentIssue.responses.push({
            created_at: new Date(timestamp).getTime(),
            created_by: author,
            response_type: responseType,
            content,
            is_internal: !!isInternal
          });
          continue;
        }
        
      }
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
  
  // Save the last issue if exists
  if (currentIssue && lastTaskId) {
    this.saveIssue(currentIssue, lastTaskId);
  }
  
  return { ok: true };
}

  saveIssue(issue: any, taskId: string) {
    const stmt = this.db.prepare(`
      INSERT INTO review_issues (
        task_id, title, description, status, priority, category, severity,
        created_at, created_by, resolved_at, resolved_by, closed_at, closed_by,
        due_date, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      taskId,
      issue.title,
      issue.description || null,
      issue.status || 'open',
      issue.priority || 'medium',
      issue.category || null,
      issue.severity || 'medium',
      issue.created_at || Date.now(),
      issue.created_by || 'system',
      issue.resolved_at || null,
      issue.resolved_by || null,
      issue.closed_at || null,
      issue.closed_by || null,
      issue.due_date || null,
      issue.tags ? JSON.stringify(issue.tags) : null
    );
    
    const issueId = result.lastInsertRowid as number;
    
    // Save responses
    if (issue.responses && issue.responses.length > 0) {
      const responseStmt = this.db.prepare(`
        INSERT INTO issue_responses (
          issue_id, response_type, content, created_at, created_by, is_internal
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      for (const response of issue.responses) {
        responseStmt.run(
          issueId,
          response.response_type,
          response.content,
          response.created_at,
          response.created_by,
          response.is_internal ? 1 : 0
        );
      }
    }
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
    
    // Meta block
    if (r.meta) {
      try {
        const meta = JSON.parse(r.meta);
        if (Object.keys(meta).length > 0) {
          out += `\nMeta:\n\`\`\`json\n${JSON.stringify(meta, null, 2)}\n\`\`\`\n`;
        }
      } catch (e) {
        // Skip invalid meta
      }
    }
    
    // Timeline block
    const timelineEvents: string[] = [];
    
    // State history
    const stateHistory = this.db.prepare(`SELECT * FROM task_state_history WHERE task_id=? ORDER BY at ASC`).all(r.id) as any[];
    for (const h of stateHistory) {
      const timestamp = new Date(h.at).toISOString();
      const note = h.note ? ` note "${h.note}"` : '';
      timelineEvents.push(`- ${timestamp} | STATE ${h.to_state} by ${h.by}${note}`);
    }
    
    // Reviews
    const revs = this.db.prepare(`SELECT * FROM reviews WHERE task_id=? ORDER BY at ASC`).all(r.id) as any[];
    for (const v of revs) {
      const timestamp = new Date(v.at).toISOString();
      const note = v.note ? ` note "${v.note}"` : '';
      timelineEvents.push(`- ${timestamp} | REVIEW ${v.decision} by ${v.by}${note}`);
    }
    
    // Comments
    const coms = this.db.prepare(`SELECT * FROM review_comments WHERE task_id=? ORDER BY at ASC`).all(r.id) as any[];
    for (const c of coms) {
      const timestamp = new Date(c.at).toISOString();
      timelineEvents.push(`- ${timestamp} | COMMENT by ${c.by} note "${c.text}"`);
    }
    
    if (timelineEvents.length > 0) {
      out += `\nTimeline:\n`;
      for (const event of timelineEvents) {
        out += `${event}\n`;
      }
    }
    
    // Related block
    const links = this.db.prepare(`SELECT * FROM task_links WHERE task_id=? ORDER BY relation, target_id`).all(r.id) as any[];
    if (links.length > 0) {
      out += `\nRelated:\n`;
      for (const link of links) {
        out += `- [${link.target_id}] (${link.relation})\n`;
      }
    }
    
    // Notes block
    const notes = this.db.prepare(`SELECT * FROM task_notes WHERE task_id=? ORDER BY at ASC`).all(r.id) as any[];
    if (notes.length > 0) {
      out += `\nNotes:\n`;
      for (const note of notes) {
        const timestamp = new Date(note.at).toISOString();
        const internal = note.is_internal ? ' (internal)' : '';
        out += `- ${timestamp} | ${note.author}:${internal} ${note.body}\n`;
      }
    }
    
    // Issues block
    const issues = this.db.prepare(`SELECT * FROM review_issues WHERE task_id=? ORDER BY created_at ASC`).all(r.id) as any[];
    if (issues.length > 0) {
      out += `\nIssues:\n`;
      for (const issue of issues) {
        const priority = issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1);
        out += `- **${priority}**: ${issue.title}\n`;
        
        if (issue.description) {
          out += `  - Description: ${issue.description}\n`;
        }
        out += `  - Status: ${issue.status.charAt(0).toUpperCase() + issue.status.slice(1)}\n`;
        out += `  - Priority: ${issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1)}\n`;
        if (issue.category) {
          out += `  - Category: ${issue.category.charAt(0).toUpperCase() + issue.category.slice(1)}\n`;
        }
        out += `  - Severity: ${issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}\n`;
        out += `  - Created: ${new Date(issue.created_at).toISOString()} by ${issue.created_by}\n`;
        
        if (issue.resolved_at) {
          out += `  - Resolved: ${new Date(issue.resolved_at).toISOString()} by ${issue.resolved_by}\n`;
        }
        if (issue.closed_at) {
          out += `  - Closed: ${new Date(issue.closed_at).toISOString()} by ${issue.closed_by}\n`;
        }
        if (issue.due_date) {
          out += `  - Due: ${new Date(issue.due_date).toISOString()}\n`;
        }
        if (issue.tags) {
          const tags = JSON.parse(issue.tags);
          out += `  - Tags: [${tags.join(', ')}]\n`;
        }
        
        // Responses
        const responses = this.db.prepare(`SELECT * FROM issue_responses WHERE issue_id=? ORDER BY created_at ASC`).all(issue.id) as any[];
        if (responses.length > 0) {
          out += `  - Responses:\n`;
          for (const response of responses) {
            const timestamp = new Date(response.created_at).toISOString();
            const internal = response.is_internal ? ' (internal)' : '';
            out += `    - ${timestamp} by ${response.created_by} (${response.response_type}): "${response.content}"${internal}\n`;
          }
        }
        out += `\n`;
      }
    }
    
    const kids = childStmt.all(r.id) as any[];
    for (const k of kids) {
      const attrs3 = [`state: ${k.state}`];
      out += `### [${k.id}] ${k.title} {${attrs3.join(', ')}}\n`;
    }
    out += `\n`;
  }
  return out;
}

  patchTask(id: string, operations: any, ifVclock: number): { ok: boolean; vclock?: number; error?: string; details?: any } {
    const task = this.getTask(id);
    if (!task) {
      return { ok: false, error: 'task_not_found' };
    }

    if (task.vclock !== ifVclock) {
      return { 
        ok: false, 
        error: 'vclock_conflict',
        details: { current_vclock: task.vclock }
      };
    }

    let newVclock = task.vclock + 1;
    let updates: any = {};
    let newMeta = task.meta ? JSON.parse(task.meta) : {};

    // set操作
    if (operations.set) {
      Object.assign(updates, operations.set);
    }

    // append操作
    if (operations.append) {
      for (const [key, value] of Object.entries(operations.append)) {
        if (key === 'text' && updates.text) {
          updates.text += value;
        } else if (key === 'text') {
          updates.text = (task.text || '') + value;
        }
      }
    }

    // merge操作
    if (operations.merge) {
      if (operations.merge.meta) {
        newMeta = { ...newMeta, ...operations.merge.meta };
        updates.meta = JSON.stringify(newMeta);
      }
      // meta以外のフィールドをマージ
      const { meta, ...otherFields } = operations.merge;
      Object.assign(updates, otherFields);
    }

    // delete操作
    if (operations.delete) {
      if (operations.delete.meta) {
        for (const key of operations.delete.meta) {
          delete newMeta[key];
        }
        updates.meta = JSON.stringify(newMeta);
      }
    }

    // replace操作
    if (operations.replace) {
      if (operations.replace.meta) {
        updates.meta = JSON.stringify(operations.replace.meta);
      }
      // meta以外のフィールドを置換
      const { meta, ...otherFields } = operations.replace;
      Object.assign(updates, otherFields);
    }

    // 無効な操作をチェック
    const validOperations = ['set', 'append', 'merge', 'delete', 'replace'];
    const invalidOps = Object.keys(operations).filter(op => !validOperations.includes(op));
    if (invalidOps.length > 0) {
      return { ok: false, error: 'invalid_operation' };
    }

    // データベースを更新
    if (Object.keys(updates).length > 0) {
      updates.vclock = newVclock;
      updates.updated_at = Date.now();
      
      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(id);
      
      this.db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`).run(...values);
    }

    return { ok: true, vclock: newVclock };
  }
}











