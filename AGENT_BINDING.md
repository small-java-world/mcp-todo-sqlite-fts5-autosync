# Agent Binding for Git Worktree

## 目的
`TODO.md` から参照されるファイル（例: `docs/specs/...`）は、**現在の worktree が束縛する Git ブランチ**にコミットされるべきです。  
MCP サーバはエージェントに以下のバインディング情報を提供し、AI/エージェントが「どのブランチへコミットすべきか」を機械的に理解できるようにします。

## 提供情報（RPC: `get_repo_binding`）
- `repoRoot`: 作業ルート（絶対パス；worktree のルート）
- `branch`: 現在のブランチ名（例: `feature/search-bm25`）
- `remote`: push 先（例: `origin`）
- `policy`:
  - `commitOnWrite: boolean` … ファイル生成/更新時に即コミットするか
  - `safeGlobs: string[]` … 生成/更新を許可するパスのグロブ
  - `messageTemplate: string` … コミットメッセージのテンプレート
  - `signoff: boolean` … `--signoff` を付けるか

## ファイル参照規約
- `TODO.md` 内の相対パスは **常に `repoRoot` からの相対パス**として解決する。
- 明示的に `repo://path/to/file` というスキーム指定も許可（これも `repoRoot` 基準）。
- 生成・更新対象は `policy.safeGlobs` に合致している必要がある。

## コミット規約
1. 変更が生じたら `git add` → `git commit -m "<template適用>"`（`policy.commitOnWrite` が true の場合）
2. コミットメッセージは `messageTemplate` を適用する。  
   例: `"chore(todos): {summary}

Refs: {taskIds}

{signoff}"`
   - `{summary}`: タスク要約
   - `{taskIds}`: `TODO.md` のタスクID（例: `T-20251012-001`）の列挙
   - `{signoff}`: `Signed-off-by: ...`（`signoff` が true の場合）

## 最低限のエージェント実装フロー
1. `get_repo_binding` を呼んで repo/branch/policy を取得
2. `TODO.md` に記載の参照ファイル（相対 or `repo://`）を `repoRoot` 配下に生成/更新
3. `policy.commitOnWrite` が true なら即コミット（必要に応じて push）
4. すべてのコミットには `{taskIds}`（`TODO.md` の一意ID）を含める
