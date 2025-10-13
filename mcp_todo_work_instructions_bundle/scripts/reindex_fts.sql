-- scripts/reindex_fts.sql
-- Full rebuild of FTS index for tasks_fts

BEGIN;
DELETE FROM tasks_fts;
INSERT INTO tasks_fts(rowid,title,text)
SELECT id, title, text FROM tasks;
COMMIT;

-- Optionally optimize
PRAGMA optimize;
