
# MCP TODO Server (SQLite + FTS5)

単一MCPサーバで TODO 検索・参照・更新を一手に引き受ける最小実装。  
- **DB**: SQLite + FTS5（`better-sqlite3`）
- **通信**: WebSocket(JSON-RPC 2.0) `ws://<controller-ip>:8765`
- **バイナリ**: CAS(`data/cas/<sha256>`) で保存／Base64で取得

## 1) セットアップ（サーバ：コントローラ機）
```bash
pnpm i    # または npm i / yarn
pnpm build
# 環境変数（任意）：MCP_TOKEN=xxxx で簡易認証
MCP_TOKEN=devtoken pnpm start
```

### テスト実行とクリーンアップ
```bash
# 通常のテスト実行
pnpm test

# テスト実行後に一時ディレクトリを自動クリーンアップ
pnpm run test:clean

# 単体テストのみ実行してクリーンアップ
pnpm run test:unit:clean

# 手動でクリーンアップ
pnpm run cleanup
```
- Windows ファイアウォール / macOS 受信許可 / Linux ufw で **8765/tcp** を許可
- 同一Wi‑Fi内の他端末から `ws://<controller-ip>:8765` へ接続

> mDNS で `ws://mcp-hub.local:8765` にしたい場合は Bonjour を有効化（デフォルト有効）。

## 2) API（JSON-RPC 2.0）

### 基本API
- `register({worker_id, authToken?}) -> {ok, session}`
- `upsert_task({id, title, text, meta?, if_vclock?}) -> {vclock}`
- `get_task({id}) -> {task, blobs}`
- `search({q, limit?, offset?, highlight?}) -> {hits:[{id,title,score,snippet?}]}`
- `mark_done({id, done, if_vclock?}) -> {vclock}`
- `attach_blob({id, sha256?, bytes_base64?}) -> {sha256, ok}`
- `get_blob({sha256}) -> {bytes_base64, size}`

### パッチAPI
- `patch_task({id, operations, if_vclock}) -> {ok, vclock}` - 部分更新（set, append, merge, delete, replace）

### レビュー指摘API
- `create_issue({task_id, title, description?, priority?, category?, severity?, due_date?, tags?, created_by}) -> {issue_id, created_at}`
- `update_issue({issue_id, title?, description?, priority?, category?, severity?, due_date?, tags?}) -> {ok}`
- `resolve_issue({issue_id, resolved_by, note?}) -> {ok}`
- `close_issue({issue_id, closed_by, note?}) -> {ok}`
- `add_issue_response({issue_id, response_type, content, created_by, is_internal?}) -> {response_id, created_at}`
- `get_issue({issue_id}) -> {issue}`
- `get_issues({task_id?, status?, priority?, category?, limit?, offset?}) -> {issues}`
- `get_issue_responses({issue_id, include_internal?}) -> {responses}`
- `search_issues({q, filters?, limit?, offset?}) -> {issues}`

### TODO.md インポート/エクスポートAPI
- `importTodoMd({content}) -> {ok}` - TODO.md形式のインポート
- `exportTodoMd() -> {content}` - TODO.md形式のエクスポート

### TDD / Spec Kit / TODO分解 拡張API
- `speckit.run({ cmd:"/speckit.tasks", todo_id?, created_by? }) -> { ok, generated, indexed? }`
  - `.specify/**/tasks.md` を生成。`todo_id` を渡すと、生成物のパスを `note.put` 相当でDBに索引（kind=`spec_tasks`）
- `tdd.scaffold({ task_id }) -> { ok, generated[] }`
- `tdd.run() -> { ok }`
- `tdd.captureResults() -> { ok, summaries[] }`
- `tdd.phase.set({ phase: "red|green|refactor|verify" }) -> { ok, phase }`
- `todo.decompose({ from? }) -> { ok, emits[] }`
- `todo.materialize({ tasklet_id }) -> { ok, branch }`

### Intent / Note / Projection / UT 要件API
- `intent.create({ intent_type, todo_id, message?, created_by?, idempotency_key }) -> { ok, intent_id }`
- `intent.get({ id }) -> { ok, intent }`
- `intent.list({ todo_id?, status? }) -> { ok, intents }`
- `intent.complete({ id }) -> { ok }`
- `note.put({ todo_id, kind, text?|url?, created_by?, idempotency_key }) -> { ok, note_id }`
- `note.get({ id }) -> { ok, note }`
- `note.list({ todo_id?, kind? }) -> { ok, notes }`
- `projection.requirements({ todo_id, specify_dir? }) -> { ok, file }`
- `projection.testcases({ todo_id, specify_dir? }) -> { ok, file }`
- `projection.all({ output_dir?, specify_dir? }) -> { ok }`
- `ut.requirements.submit({ todo_id, raw_markdown?|raw_json?, idempotency_key }) -> { ok, requirements_id }`
- `ut.requirements.get({ id?|todo_id? }) -> { ok, requirements }`
- `ut.testcases.submit({ requirements_id, todo_id?, raw_markdown?|raw_json?, idempotency_key }) -> { ok, testcases_id }`
- `ut.testcases.get({ id?|requirements_id?|todo_id? }) -> { ok, testcases }`

#### 簡易サンプル（WebSocket JSON-RPC）
```json
{ "jsonrpc":"2.0", "id":1, "method":"speckit.run", "params":{ "cmd":"/speckit.tasks", "todo_id":"T-2025-001" } }
```

### RPCディスパッチ: ハンドラマップ化

サーバ内部の RPC ディスパッチは大きな switch から、メソッド名→ハンドラ関数のマップに段階移行しました。これにより:

- 追従・追加が容易（`src/server.ts` の `coreHandlers` に登録）
- Speckit/TDD 等の拡張は `registerHandler()` でプラグイン的に追加

マップ化済みの主な RPC:

- タスク系: `list_recent`, `get_task`, `upsert_task`, `mark_done`, `attach_blob`
- TODO.md入出力: `importTodoMd`, `exportTodoMd`
- 変更フィード: `poll_changes`
- レビュー指摘: `create_issue`, `get_issue`, `update_issue`, `resolve_issue`, `close_issue`, `add_issue_response`, `get_issue_responses`, `get_issues`, `search_issues`
- リポジトリ/ワークツリー: `get_repo_binding`, `ensure_worktree`
- 補助: `reserve_ids`, `patch_todo_section`, `todo.watch`, `todo.unwatch`

### Git Worktree バインディングAPI
- `get_repo_binding()` → **Git worktree バインディング**（repoRoot/branch/policy）。`CONFIG.git.autoEnsureWorktree` 有効時は未作成でもサーバ側で安全に自動作成。
- `ensure_worktree({ branch, dirName })` → `<repoRoot>/<worktreesDir>/<dirName>` に worktree を安全作成（既存時は再利用）し、その worktree を repoRoot とするバインディングを返却。
- `reserve_ids({n})` → **TODO用IDの中央採番**（例: `T-YYYYMMDD-###`）
- `patch_todo_section({section, base_sha256, ops[]})` → **TODO.mdの行パッチ**（3階層＋1行1タスク前提）

vclock はタスクごとの単調増加バージョン（楽観ロック）。`if_vclock` 不一致なら 409 を返します。

## 3) クライアント例
- Node: `examples/node_client.js`
- Python: `examples/py_client.py`

## 4) データ配置
```
data/
  todo.db         # SQLite DB
  cas/
    <sha256>      # 添付ファイル（CAS）
```

## 5) 検索Tips（FTS5）
- クエリ例: `server NEAR/1 skeleton`, `"exact phrase"`
- 並び替え: `bm25(tasks_fts)`
- スニペット: `snippet(...)` でハイライト断片

## 6) 注意
- FTS5 が有効な SQLite が必要（macOS/Linuxは標準でOK。Windowsは配布DLLに含まれることが多い）。


## Archive API
- `archive_task({ id, reason? }) -> { ok, archived_at }` 以後、検索/一覧から除外・編集不可。
- `restore_task({ id }) -> { ok }` 再び検索対象に復帰（FTS再登録）。
- `list_archived({ limit?, offset? }) -> { items }`
- `get_task({ id, includeArchived: true })` でアーカイブも直接参照可。

編集系（`upsert_task`, `mark_done`）は `archived=1` のタスクには 409 を返します。


## 7) 3階層・レビュー・履歴 API
- `set_state({ id, to_state, by?, note? }) -> { vclock }`
- `add_review({ task_id, decision, by, note? })`
- `add_comment({ task_id, by, text })`

## 8) レビュー指摘機能

### 指摘の作成・管理
- タスクに関連する指摘（Issue）を作成・更新・解決・クローズ
- 指摘に対する応答（Response）の追加
- 指摘の検索・フィルタリング
- 内部メモ（Internal Notes）のサポート

### TODO.md での指摘管理
```
### Issues:

#### Issue 1: Database Performance
- **Status**: Open
- **Priority**: High
- **Category**: Performance
- **Severity**: High
- **Created**: 2025-01-16T09:00:00Z by reviewer1
- **Description**: Database queries are too slow
- **Tags**: performance, database

**Responses:**
- 2025-01-16T10:00:00Z by developer1: I'll optimize the queries
- 2025-01-16T11:00:00Z by reviewer1: Please add indexes
- 2025-01-16T12:00:00Z by developer1 (internal): Working on it
```

### TODO.md 例（インポート可能）
```
## [T-2025-001] Implement review {state: IN_PROGRESS, assignee: nina, due: 2025-10-20}
### [T-2025-001-1] Define DB {state: DONE}
#### Reviews
- review@2025-10-12T03:10Z by ken => REQUEST_CHANGES missing error codes
- comment@2025-10-12T03:12Z by ken: "pls add error codes"
```


## 9) TODO.md Import/Export CLI
- Export (mac): `./scripts/mac/export_todo.sh [OUT.md]`
- Import (mac): `./scripts/mac/import_todo.sh [IN.md]`
- Export (Win): `.\scripts\win\export_todo.ps1 -OutPath OUT.md`
- Import (Win): `.\scripts\win\import_todo.ps1 -InPath IN.md`

環境変数: `MCP_URL` (既定 `ws://127.0.0.1:8765`), `MCP_TOKEN` (既定 `devtoken`)


## 10) 安全な同期（サーバ停止時の自動エクスポート & 影コピー）
- サーバは **停止時(SIGINT/SIGTERM)** に、DB内容の TODO を Markdown として**影コピー**へ書き出し、さらに **スナップショット**を `data/snapshots/` に保存します。
- 既定の保存先：
  - 影コピー: `data/shadow/TODO.shadow.md`（上書きだが**一時ファイル→rename**で安全）
  - スナップショット: `data/snapshots/TODO.autosave-<ISO>.md`（追記形式）
- 環境変数：
  - `AUTO_EXPORT_ON_EXIT=1`（既定=1／0で無効化）
  - `EXPORT_DIR=data/snapshots`
  - `SHADOW_PATH=data/shadow/TODO.shadow.md`

### 手動同期（RPC）
- `server_sync_export` … サーバ側で上記と同じ処理を即時実行。


## 11) テスト

### ユニットテスト
```bash
npm test
```

### 統合テスト
```bash
# サーバー起動
npm start

# 別ターミナルで統合テスト実行
npm test test/integration/
```

### テストカバレッジ
- 基本機能（CRUD、検索、アーカイブ）
- パッチ機能（部分更新）
- レビュー指摘機能（作成、更新、解決、クローズ、応答）
- TODO.md インポート/エクスポート機能
- メタ構造化、タイムライン、関連、ノート機能

## 12) 追加ドキュメント

### エージェント向けドキュメント
- `AGENT_BINDING.md` … エージェントが **「TODO由来のファイルは紐づくブランチにコミット」** を理解するための仕様
- `AGENT_PROTOCOL.md` … エージェント/AI向けの運用プロトコル（Golden Rules と使用RPC）

### 環境変数（worktree）
- `GIT_REPO_ROOT`（プロジェクトの .git 管理側のルート。未指定時は `process.cwd()`）
- `GIT_WORKTREES_DIR`（既定: `worktrees`）
- `GIT_WORKTREE_ROOT`（明示worktreeがある場合に直接指定；通常は `ensure_worktree` を使用）
- `GIT_AUTO_ENSURE_WORKTREE=true`（`get_repo_binding`で自動worktree作成を有効化）
- `GIT_WORKTREE_NAME`（自動作成時のworktree名。未指定時はブランチ名をサニタイズ）
- `GIT_BRANCH`（必須推奨）
- `GIT_REMOTE=origin`
- `GIT_COMMIT_ON_WRITE=true`
- `GIT_SAFE_GLOBS=docs/**,src/**,.github/**`
- `GIT_COMMIT_TEMPLATE="chore(todos): {summary}\n\nRefs: {taskIds}\n\n{signoff}"`
- `GIT_SIGNOFF=true`
- `GIT_ALLOWED_BRANCH_PREFIXES="feat/,fix/,chore/,refactor/"`（worktree作成を許可するブランチ接頭辞）

## 便利RPC
- `ensure_worktree({ branch, dirName })` → `<repoRoot>/<worktreesDir>/<dirName>` に worktree を作成（既存なら再利用）し、その worktree を `repoRoot` とするバインディングを返す。
- `get_repo_binding()` → 既存worktreeがあれば返す。なければ`GIT_AUTO_ENSURE_WORKTREE=true`の場合、自動でworktreeを作成して返す。

## 13) MCP設定（Cursor / Claude Desktop / Codex CLI）

### 13.1 Cursor設定

#### ローカル接続
```json
{
  "mcpServers": {
    "mcp-todo-server": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "D:\\mcp-todo-sqlite-fts5-autosync",
      "env": {
        "MCP_TOKEN": "devtoken"
      }
    }
  }
}
```

#### リモート接続（IPアドレス指定）
```json
{
  "mcpServers": {
    "mcp-todo-server": {
      "command": "node",
      "args": ["remote_client.js"],
      "cwd": "D:\\mcp-todo-sqlite-fts5-autosync",
      "env": {
        "MCP_SERVER_IP": "192.168.1.9",
        "MCP_TOKEN": "devtoken"
      }
    }
  }
}
```

**設定ファイルの場所:**
- Windows: `%APPDATA%\Cursor\User\settings.json`
- macOS: `~/Library/Application Support/Cursor/User/settings.json`
- Linux: `~/.config/Cursor/User/settings.json`

### 13.2 Claude Desktop設定

#### ローカル接続
```json
{
  "mcpServers": {
    "mcp-todo-server": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "D:\\mcp-todo-sqlite-fts5-autosync",
      "env": {
        "MCP_TOKEN": "devtoken"
      }
    }
  }
}
```

#### リモート接続（IPアドレス指定）
```json
{
  "mcpServers": {
    "mcp-todo-server": {
      "command": "node",
      "args": ["remote_client.js"],
      "cwd": "D:\\mcp-todo-sqlite-fts5-autosync",
      "env": {
        "MCP_SERVER_IP": "192.168.1.9",
        "MCP_TOKEN": "devtoken"
      }
    }
  }
}
```

**設定ファイルの場所:**
- Windows: `%APPDATA%\Claude\claude_desktop_config\mcp_servers\mcp-todo-server.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config/mcp_servers/mcp-todo-server.json`
- Linux: `~/.config/claude/claude_desktop_config/mcp_servers/mcp-todo-server.json`

### 13.3 Codex CLI設定

#### ローカル接続
```bash
# 環境変数設定
export MCP_SERVER_URL="ws://127.0.0.1:8765"
export MCP_TOKEN="devtoken"

# Codex CLI実行
codex --mcp-server-url $MCP_SERVER_URL --mcp-token $MCP_TOKEN
```

#### リモート接続（IPアドレス指定）
```bash
# 環境変数設定
export MCP_SERVER_URL="ws://192.168.1.9:8765"
export MCP_TOKEN="devtoken"

# Codex CLI実行
codex --mcp-server-url $MCP_SERVER_URL --mcp-token $MCP_TOKEN
```

### 13.4 リモート接続のための設定

#### サーバー側（MCP TODO Server）
```bash
# サーバー起動
$env:MCP_TOKEN="devtoken"; npm start

# ファイアウォール設定（Windows管理者権限で実行）
netsh advfirewall firewall add rule name="MCP TODO Server" dir=in action=allow protocol=TCP localport=8765
```

#### クライアント側（リモート接続用）
```bash
# リモートクライアント実行
$env:MCP_SERVER_IP="192.168.1.9"; node remote_client.js
```

#### ネットワーク設定
1. **ファイアウォール設定**: ポート8765を開放
2. **IPアドレス確認**: `ipconfig` (Windows) / `ifconfig` (macOS/Linux)
3. **ネットワーク確認**: 同一ネットワーク内であることを確認

### 13.5 トラブルシューティング

#### 接続エラーの場合
1. **ファイアウォール確認**: ポート8765が開放されているか
2. **IPアドレス確認**: 正しいサーバーIPアドレスを指定しているか
3. **ネットワーク確認**: 両方のマシンが同一ネットワークにいるか
4. **認証確認**: 同じ`MCP_TOKEN`を使用しているか

#### ログ確認
```bash
# サーバーログ確認
$env:MCP_TOKEN="devtoken"; npm start

# クライアントログ確認
$env:MCP_SERVER_IP="192.168.1.9"; node remote_client.js
```

