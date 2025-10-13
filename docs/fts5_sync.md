# FTS5 autosync: DDL / Trigger / 再構築手順

SQLite FTS5 の external content モードを利用し、tasks と tasks_fts をトリガで同期させる方針です。

## DDL（要約）

- tasks_fts(title, text, meta) virtual table with content=tasks
- 同期トリガ: INSERT/UPDATE/DELETE/ARCHIVE/RESTORE を tasks_fts に反映
- 変更フィード changes による確定順の配信

## 再構築

1. DELETE FROM tasks_fts; → INSERT INTO tasks_fts(tasks_fts) VALUES('rebuild');
2. または scripts/reindex_fts.sql を使用

## 運用ポイント

- journal_mode=WAL, synchronous=NORMAL（可用性と一貫性バランス）
- 大量更新時は一時的にトリガ抑止→一括再構築（ダウンタイム計画）
