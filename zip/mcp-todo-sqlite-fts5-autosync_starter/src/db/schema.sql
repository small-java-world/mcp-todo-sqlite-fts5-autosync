PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA cache_size=-20000; -- ~20MB
PRAGMA mmap_size=3000000000;

-- Entities
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  state TEXT DEFAULT 'open',           -- open / in_review / done / archived
  priority INTEGER DEFAULT 0,
  parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  reviewer TEXT,
  assignee TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,                 -- NULL = active
  vclock INTEGER NOT NULL DEFAULT 0,   -- optimistic concurrency
  meta JSON
);

-- External content FTS5 (no content duplication)
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  id UNINDEXED,                        -- external id for joins
  title,
  body,
  meta,
  content='tasks',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, id, title, body, meta)
  VALUES (new.rowid, new.id, new.title, new.body, COALESCE(new.meta, ''));
END;

CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, id, title, body, meta)
  VALUES('delete', old.rowid, old.id, old.title, old.body, COALESCE(old.meta,''));
END;

CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, id, title, body, meta)
  VALUES('delete', old.rowid, old.id, old.title, old.body, COALESCE(old.meta,''));
  INSERT INTO tasks_fts(rowid, id, title, body, meta)
  VALUES (new.rowid, new.id, new.title, new.body, COALESCE(new.meta,''));
END;

-- Change feed
CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                 -- epoch ms
  entity TEXT NOT NULL,                -- 'task' | 'blob'
  id TEXT NOT NULL,                    -- task.id or sha256
  op TEXT NOT NULL,                    -- 'insert'|'update'|'delete'|'archive'|'restore'|'attach'
  vclock INTEGER
);

-- CAS (Content Addressable Storage)
CREATE TABLE IF NOT EXISTS blobs (
  sha256 TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_blobs (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sha256 TEXT NOT NULL REFERENCES blobs(sha256) ON DELETE CASCADE,
  PRIMARY KEY(task_id, sha256)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state, archived_at);
CREATE INDEX IF NOT EXISTS idx_changes_ts ON changes(ts);
CREATE INDEX IF NOT EXISTS idx_changes_entity ON changes(entity, id);
