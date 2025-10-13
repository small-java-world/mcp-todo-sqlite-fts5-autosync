# 更新チェックリスト（ドキュメント参照リンクの追記）

本編: `docs/docs_architecture_purpose_and_intent_ja.md`

以下の各文書への参照リンク（See also）を本編に追記:

- tdd_phase_model.md（TDD位相FSM/不変条件）
- fts5_sync.md（FTS5 autosync DDL/Trigger/再構築）
- projection_twophase.md（投影の二相コミット）
- search_safety.md（FTS検索安全設計）
- vclock_policy.md（if_vclock・409/412）
- ingestion_worker_sla.md（SLA/リトライ/可観測性）
- tests/fts_property_test_plan.md（FTSプロパティテスト計画）

作業手順:
1. 本編の最後に「関連ドキュメント」章を追加
2. 上記ファイルへの相対リンクを列挙
3. PR では diff テンプレ（patches/add_links_to_architecture_doc.diff）に準拠
