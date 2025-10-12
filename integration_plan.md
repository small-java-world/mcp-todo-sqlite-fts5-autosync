# スタータープロジェクトとの統合計画

## 1. スキーマの改善

### 既存のスキーマに追加すべき要素
```sql
-- 変更フィードテーブル
CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  op TEXT NOT NULL,
  vclock INTEGER
);

-- CAS テーブル
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

-- 外部コンテンツFTS5
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  id UNINDEXED,
  title,
  text,
  meta,
  content='tasks',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- FTS同期トリガ
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, id, title, text, meta)
  VALUES (new.rowid, new.id, new.title, new.text, COALESCE(new.meta, ''));
END;
```

## 2. サーバーアーキテクチャの改善

### 追加すべき機能
1. **Zodバリデーション**: 型安全な入力検証
2. **Prepared Statements**: パフォーマンス最適化
3. **Push通知**: リアルタイム変更通知
4. **変更フィード**: `poll_changes` API
5. **CAS統合**: Blob管理機能

## 3. 既存機能の保持

### 維持すべき既存機能
1. **レビュー指摘機能**: 完全な指摘管理システム
2. **TODO.md インポート/エクスポート**: Markdown形式でのデータ交換
3. **メタ構造化**: JSON/YAML形式のメタデータ
4. **タイムライン機能**: 状態変更履歴
5. **関連機能**: タスク間の関連付け
6. **ノート機能**: コメント・内部メモ

## 4. 統合の優先順位

### Phase 1: 基盤の改善
- [ ] スキーマの改善（FTS5、変更フィード、CAS）
- [ ] Zodバリデーションの導入
- [ ] Prepared Statementsの導入

### Phase 2: 機能の統合
- [ ] Push通知の実装
- [ ] 変更フィードAPIの実装
- [ ] Blob管理機能の実装

### Phase 3: テストの改善
- [ ] E2Eテストの拡張
- [ ] パフォーマンステストの追加
- [ ] 統合テストの改善

## 5. 実装のメリット

### パフォーマンス向上
- FTS5の最適化
- Prepared Statementsによる高速化
- キャッシュとmmapの最適化

### 信頼性向上
- 型安全なバリデーション
- 競合制御の改善
- 変更追跡の実装

### 機能拡張
- リアルタイム通知
- Blob管理
- より堅牢なアーキテクチャ
