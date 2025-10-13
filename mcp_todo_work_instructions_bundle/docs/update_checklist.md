# 作業チェックリスト（ローカルAIエージェント向け）

以下のドキュメントを `docs/` に配置し、`docs/docs_architecture_purpose_and_intent_ja.md` 本文から参照リンクを追記せよ。

## 対象ファイル
- `docs/tdd_phase_model.md`
- `docs/fts5_sync.md`
- `docs/projection_twophase.md`
- `docs/search_safety.md`
- `docs/vclock_policy.md`
- `docs/ingestion_worker_sla.md`

## 追記方針（例）
- 「TDD の位相」節の末尾に → `[詳細: TDD 位相モデル](./tdd_phase_model.md)`
- 「FTS5 autosync」節の末尾に → `[詳細: FTS5 同期方式](./fts5_sync.md)`
- 「投影」節の末尾に → `[詳細: 投影の二相コミット](./projection_twophase.md)`
- 「検索」節の末尾に → `[詳細: Search 安全設計](./search_safety.md)`
- 「更新競合」節の末尾に → `[詳細: vclock 強制ポリシー](./vclock_policy.md)`
- 「Ingestion」節の末尾に → `[詳細: Ingestion Worker SLA](./ingestion_worker_sla.md)`

## テスト観点
- docs 参照リンクのリンク切れが無いこと（相対パスで統一）
- `db/fts5_triggers.sql` の DDL が実DBに適用可能であること
- 既存 README/API ドキュメントと齟齬がないこと