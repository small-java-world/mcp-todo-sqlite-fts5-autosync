# TDD 位相モデル（FSM）と不変条件

本ドキュメントは、MCP TODO サーバにおける **TDD 位相**の状態遷移と不変条件を、
クライアント／CI／Bot が **機械的に遵守できる形**で規定する。

## 1. 位相（Phase）

- `red`       : 失敗テストが存在する状態（実装前段階）
- `green`     : 全テスト成功（失敗=0）
- `refactor`  : リファクタ中（外部契約を壊さない）
- `verify`    : 検収・レビュー中（仕様へのトレーサビリティ確認）

## 2. 許容遷移（有限状態機械）

- `red → green → refactor → verify`
- 例外的巻き戻し: `verify → green`（検収NG時）

上記以外の遷移は **拒否** する。

## 3. 不変条件

- `green` へ入るには、**直近テストレポートで失敗=0** のエビデンス添付が必須（テスト種別と時刻を記録）。
- `refactor` は `green` を崩さない（外部公開 API/スキーマの互換性を維持）。
- すべての遷移リクエストは `idempotency_key` + `if_vclock` を要求する。

## 4. エラー規約（抜粋）

- 不正遷移: `error.code = INVALID_PHASE_TRANSITION`
- エビデンス不足: `error.code = EVIDENCE_REQUIRED`
- 事前条件未指定（`if_vclock` 無し）: `error.code = PRECONDITION_REQUIRED`（HTTP 412 相当）
- 競合: `error.code = CONFLICT`（HTTP 409 相当）

## 5. 監査ログ

- `who / when / from_phase / to_phase / test_summary / spec_refs` を不可逆に保存する。
