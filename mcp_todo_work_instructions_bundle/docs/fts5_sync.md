# FTS5 同期方式（autosync）と再構築手順

本サーバの全文検索は **SQLite FTS5** を用いる。更新抜け/削除漏れを防ぐため、
**content='tasks' + トリガ** による自動追従を基本とする。

## 1. バーチャルテーブル

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title,           -- 検索対象列
  text,            -- 検索対象列
  tokenize = 'unicode61 remove_diacritics 2',
  content = 'tasks',
  content_rowid = 'id'
);
```

## 2. 同期トリガ

```sql
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
```

> 備考: UPDATE は **delete → insert** の順で差し替える。

## 3. 再インデックス（まれに必要）

- `PRAGMA optimize;` を定期実行。
- 全再構築ユーティリティを提供（`scripts/reindex_fts.sql`）。
- 再構築はバックグラウンドで実施し、完了時に `fts.reindexed` イベントを配信。

## 4. テスト観点（最低限）

- ランダム 1,000 件に対する INSERT/UPDATE/DELETE 混在で**整合性=100%**（期待ヒット/非ヒット）。
- `patch_task`（部分更新）でも FTS が追随すること。
- 削除後にヒットしないこと。