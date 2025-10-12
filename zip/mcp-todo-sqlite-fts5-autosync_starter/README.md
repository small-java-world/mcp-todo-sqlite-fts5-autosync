# mcp-todo-sqlite-fts5-autosync (Starter Bundle)

実運用を意識した最小実装の**雛形**です：

- **SQLite + FTS5 (external content + 同期トリガ)**  
- **PRAGMA初期化 (WAL/NORMAL/foreign_keys など)**  
- **JSON-RPC over WebSocket サーバ**（簡易トークン認証 `MCP_TOKEN`）  
- **CAS（blob保管・SHA-256整合性チェック）**  
- **変更フィード**（`changes`テーブル・push通知・`poll_changes`）  
- **Vitest E2E**（最低限の一連操作を検証）

> ⚠️ これはひな形です。既存リポジトリと差分マージしてご利用ください。

## 使い方

```bash
# 依存インストール
pnpm i   # or npm i / yarn

# 開発起動
MCP_TOKEN=devtoken pnpm dev

# 別ターミナルでE2E
pnpm test
```

- DBは `./data/app.db`。blobは `./data/blobs/<sha256>` に配置。
- WebSocketは `ws://127.0.0.1:8787` 。`Authorization: Bearer <MCP_TOKEN>` 必須。

## JSON-RPC メソッド（抜粋）

- `register()` → `{ sessionId }`
- `upsert_task({ task, if_vclock? })`
- `patch_task({ id, operations, if_vclock? })`
- `search({ q, limit?, highlight? })`
- `archive_task({ id })` / `restore_task({ id })`
- `attach_blob({ taskId, base64, sha256 })`
- `poll_changes({ since, limit? })`
- push通知: サーバから `{"method":"change","params":{...}}` を都度配信

## スキーマの見どころ

- `tasks` 本体と `tasks_fts`（external content）  
- トリガで INSERT/UPDATE/DELETE/ARCHIVE/RESTORE を FTS に反映  
- `changes` テーブルで確定順序を維持（自増`seq`）

詳細は `src/db/schema.sql` を参照。

---

**ライセンス**: MIT（雛形部のみ）。既存コードへの移植時はご自身のリポジトリのライセンスに従ってください。
