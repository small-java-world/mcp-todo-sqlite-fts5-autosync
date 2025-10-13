# Projection の二相コミット手順

DB の正本（tasks）から投影（projections, notes, indices 等）へ反映する際の整合性ガイド。

## 背景

- 変更フィード changes(seq, entity, id, op, ts, vclock) は確定順を担保
- 投影は遅延/再試行/再構築可能であること（冪等）

## 二相コミット

1. Prepare: 入力の整合性チェック、依存の取得、idempotency key 発行
2. Apply: 投影の実行（同一 idempotency key で再実行は no-op）

## エラー時の規約

- 入力不正: 400、再実行不可
- 一時失敗: リトライ（指数バックオフ、最大回数、DLQ）
- 永続失敗: アラート + 手動復旧手順

## 運用

- 監視: ラグ（最大 seq - 消費済み seq）、失敗率、p95/p99
- 再構築: 全件スキャン→投影再生成（FTS と同様の手順）
