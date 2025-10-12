
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
- Windows ファイアウォール / macOS 受信許可 / Linux ufw で **8765/tcp** を許可
- 同一Wi‑Fi内の他端末から `ws://<controller-ip>:8765` へ接続

> mDNS で `ws://mcp-hub.local:8765` にしたい場合は Bonjour を有効化（デフォルト有効）。

## 2) API（JSON-RPC 2.0）
- `register({worker_id, authToken?}) -> {ok, session}`
- `upsert_task({id, title, text, meta?, if_vclock?}) -> {vclock}`
- `get_task({id}) -> {task, blobs}`
- `search({q, limit?, offset?, highlight?}) -> {hits:[{id,title,score,snippet?}]}`
- `mark_done({id, done, if_vclock?}) -> {vclock}`
- `attach_blob({id, sha256?, bytes_base64?}) -> {sha256, ok}`
- `get_blob({sha256}) -> {bytes_base64, size}`

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
- `import_todo_md({ bytes_base64 })` / `export_todo_md()`

### TODO.md 例（インポート可能）
```
## [T-2025-001] Implement review {state: IN_PROGRESS, assignee: nina, due: 2025-10-20}
### [T-2025-001-1] Define DB {state: DONE}
#### Reviews
- review@2025-10-12T03:10Z by ken => REQUEST_CHANGES missing error codes
- comment@2025-10-12T03:12Z by ken: "pls add error codes"
```


## 8) TODO.md Import/Export CLI
- Export (mac): `./scripts/mac/export_todo.sh [OUT.md]`
- Import (mac): `./scripts/mac/import_todo.sh [IN.md]`
- Export (Win): `.\scripts\win\export_todo.ps1 -OutPath OUT.md`
- Import (Win): `.\scripts\win\import_todo.ps1 -InPath IN.md`

環境変数: `MCP_URL` (既定 `ws://127.0.0.1:8765`), `MCP_TOKEN` (既定 `devtoken`)


## 9) 安全な同期（サーバ停止時の自動エクスポート & 影コピー）
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

