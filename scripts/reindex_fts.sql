-- Reindex / Rebuild FTS5 index for tasks_fts
BEGIN IMMEDIATE;
DELETE FROM tasks_fts;
INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
COMMIT;
