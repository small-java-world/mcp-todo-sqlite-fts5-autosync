# MCP Agent Protocol (Promptable Rules)

本書は、MCP エージェント（およびそれを利用するAIツール）が `TODO.md` を中核に作業する際の**明文化された運用規約**です。

## Golden Rules
1. 起動時に **必ず** `get_repo_binding` を実行して `repoRoot/branch/policy` を取得すること。
2. `TODO.md` からのファイル参照（相対/`repo://`）は **`repoRoot` 基準**で解決すること。
3. ファイル生成・更新後、`policy.commitOnWrite=true` の場合は **同一ブランチ**へ即時コミットすること。
4. コミットメッセージは `messageTemplate` を用い、`{taskIds}` に `TODO.md` のタスクIDを必ず含めること。
5. 変更が無いコミットは禁止。push は任意（CI 連動時は推奨）。

## `TODO.md` のタスク行の書式（抜粋）
- `- [ ] [T-YYYYMMDD-###] 要約 ...  :: state:open; prio:1; owner:you`
- 1行1タスク・IDは不変。末尾の `:: key:val; ...` は機械可読メタ。

## エージェントが使う主な RPC（例）
- `get_repo_binding() -> { repoRoot, branch, remote, policy }`
- `reserve_ids(n) -> { ids: string[] }` … 中央採番（オンライン）
- `patch_todo_section({ section, base_sha256, ops[] }) -> { vclock, sha256 }` … 行単位パッチ
