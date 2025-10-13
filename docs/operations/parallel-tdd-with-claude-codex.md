# Spec Kit × TODO.md 並走TDD（Claude Code / Codex CLI運用）

本書は、`Spec Kit` の AC/Tasks と `TODO.md` を二軸同期しながら、**複数端末**かつ **Claude Code / Codex CLI** の両方から **red→green→refactor→verify** を回すための運用SOPです。

## 原則
- 単一の真実源は **DB**。TODO.md は **ミラー**（更新は MCP 経由のみ）
- 位相（phase）は `red|green|refactor|verify` を厳格管理（MCP APIで更新）
- FWやコマンドは `.tdd/profile.yaml` の **runner** を経由（直叩き禁止）
- Spec→Task→Testのトレーサビリティ（`{spec_id}_{story_id}_{ac_index}`）をファイル名で保証

## 最短フロー
1. `/todo.pick "◯◯"` → task_id 確定、`worktree.create_for_task`
2. `/speckit.run "/speckit.tasks"` → `.specify/**/tasks.md` 生成
3. `/tdd.scaffold {task_id}` → RED 雛形生成（kinds は profile 参照）
4. `/tdd.phase.set {task_id, red}` → `/tdd.run`
5. 修正 → `/tdd.run` → GREEN → `/tdd.phase.set {task_id, green}`
6. リファクタ → `/tdd.run`（GREEN維持）→ `/tdd.phase.set {task_id, refactor}`
7. 検収 → `/tdd.run --scope=release` → `/tdd.phase.set {task_id, verify}` → `/pr.open`

## 小粒化ポリシー（todo.decompose）
- 1タスク＝1〜2ファイル/1AC を目安。DAG化し、低コンフリクトから並列化
- Conflict Score: 近接行/同関数/公開API変更は加点、テスト/ドキュメントは減点

## Claude / Codex ルール
- **Claude**: スラッシュコマンドで明示（`/todo.pick` → `/speckit.run` → `/tdd.scaffold` → …）
- **Codex**: 非対話コマンドで同等機能（`codex tdd:run` 等）。戻り値/JSONログで分岐

> 実装は `src/mcp/{speckit.ts,tdd.ts,todo_splitter.ts}` の API から開始すること。
