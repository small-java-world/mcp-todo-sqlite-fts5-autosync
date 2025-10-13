-- db/fts5_triggers.sql
-- FTS5 virtual table and triggers for autosync

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title,
  text,
  tokenize = 'unicode61 remove_diacritics 2',
  content = 'tasks',
  content_rowid = 'id'
);

CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid,title,text)
  VALUES (new.id, new.title, new.text);
END;

CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, text)
  VALUES('delete', old.id, old.title, old.text);
END;

CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, text)
  VALUES('delete', old.id, old.title, old.text);
  INSERT INTO tasks_fts(rowid, title, text)
  VALUES (new.id, new.title, new.text);
END;
