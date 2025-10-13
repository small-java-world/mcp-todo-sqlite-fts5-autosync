-- FTS5 external content + sync triggers

-- Virtual table (content=tasks)
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  id UNINDEXED,
  title,
  text,
  meta,
  content='tasks', content_rowid='rowid'
);

-- Insert/Update/Delete sync
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, id, title, text, meta)
  VALUES (new.rowid, new.id, new.title, new.text, json(new.meta));
END;

CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, id, title, text, meta) VALUES('delete', old.rowid, old.id, old.title, old.text, json(old.meta));
  INSERT INTO tasks_fts(rowid, id, title, text, meta)
  VALUES (new.rowid, new.id, new.title, new.text, json(new.meta));
END;

CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, id, title, text, meta) VALUES('delete', old.rowid, old.id, old.title, old.text, json(old.meta));
END;

-- Rebuild helper (optional)
-- INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
