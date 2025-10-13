# 更新系 API への vclock 強制ポリシー

## 1. 方針
- **すべての更新系 API** は `if_vclock` を **必須** とする。
- 未指定の場合は `error.code=PRECONDITION_REQUIRED`（HTTP 412 相当）。
- 競合時は `error.code=CONFLICT`（HTTP 409 相当）を返す。

## 2. 対象 API（例）
- `upsert_task`, `patch_task`, `mark_done`
- `requirements.submit`, `testcases.submit`, `tdd.phase.set`
- `note.put`, `issue.update`, `issue.close`, など

## 3. 実装ノート
- vclock は単調増加のバージョン番号（または lamport clock）。
- 書き込み成功時に新しい vclock をレスポンスに含める。
- クライアントは直近 vclock を保持し、次回書き込み時に `if_vclock` として送る。