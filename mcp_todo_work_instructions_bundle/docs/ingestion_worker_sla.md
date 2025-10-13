# Ingestion Worker の SLA / 再試行 / 順序保証

## 1. SLA
- 単発インジェストの p95 < **3s**（ローカル）
- バックプレッシャが発生する場合は `429 RETRY_LATER` を返す

## 2. 再試行
- エラーに応じて指数バックオフ（0.5s, 1s, 2s, 4s, … 最大 30s）
- 最大試行回数（例: 5回）を超えたらデッドレターに退避

## 3. 順序保証
- 仕様的な依存関係を持つイベントは **順序付け** する
  - 例: `requirements.updated` → `testcases.updated`
- 同一キーのイベントは同一キュー（シャーディングキー）で処理

## 4. 可観測性
- メトリクス: `ingest_latency_ms`, `retry_count`, `deadletter_count`
- ログ：`who / what / when / payload_digest` を記録