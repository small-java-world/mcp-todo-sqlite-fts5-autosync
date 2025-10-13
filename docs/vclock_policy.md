# vclock ポリシー（if_vclock 必須・409/412 規約）

## 目的

更新競合をサーバ側で検出し、意図しない上書きを防ぐ。

## 規約

- すべての更新 API（upsert, mark_done, patch_task 等）は if_vclock を受け付ける
- 現在値と不一致の場合は 409（vclock_conflict）
- 前提違反（必須なのに未指定など）は 412 相当（precondition_failed）

## クライアント手順

1. 読み取り: `get_task` で vclock を取得
2. 変更: if_vclock を付けて送信
3. 409 の場合: 再取得→マージ戦略→再送

## テスト観点

- 並行 upsert/mark_done で競合を必ず検出
- patch_task の行単位競合（必要に応じて CRDT/OT へ拡張）
