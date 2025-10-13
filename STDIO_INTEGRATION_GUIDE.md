# Stdio Integration Guide - Claude Code統合ガイド

## 概要

このガイドでは、MCP Stdio接続を使用してClaude Codeとの統合を行う方法を説明します。

## 実装完了 ✅

**2025-10-13**: Stdio接続対応が完了し、Claude Codeでの利用が可能になりました。

### 実装したコンポーネント

```
src/
├── stdio-server.ts              # Stdio接続サーバー (NEW)
├── server.ts                    # WebSocket接続サーバー (既存)
└── server/
    └── rpc-handler.ts          # 共通RPCハンドラ (NEW)
```

## セットアップ手順

### 1. ビルド

```bash
npm run build
```

これにより以下のファイルが生成されます:
- `dist/stdio-server.js` - Stdio接続サーバー
- `dist/server.js` - WebSocket接続サーバー

### 2. Claude Code設定

#### Windowsの場合
`%APPDATA%\Claude\claude_desktop_config.json` を編集:

```json
{
  "mcpServers": {
    "todo-sqlite-fts5": {
      "command": "node",
      "args": [
        "D:\\mcp-todo-sqlite-fts5-autosync\\dist\\stdio-server.js"
      ],
      "env": {
        "AUTO_EXPORT_ON_EXIT": "1",
        "DB_FILE": "todo.db"
      }
    }
  }
}
```

#### macOS/Linuxの場合
`~/.config/Claude/claude_desktop_config.json` を編集:

```json
{
  "mcpServers": {
    "todo-sqlite-fts5": {
      "command": "node",
      "args": [
        "/path/to/mcp-todo-sqlite-fts5-autosync/dist/stdio-server.js"
      ],
      "env": {
        "AUTO_EXPORT_ON_EXIT": "1",
        "DB_FILE": "todo.db"
      }
    }
  }
}
```

**重要**: パスは絶対パスで指定してください。

### 3. Claude Code再起動

設定を反映させるため、Claude Codeを完全に再起動してください。

### 4. 動作確認

再起動後、以下のMCPツールが利用可能になります:

- `mcp__todo_sqlite_fts5__upsert_task`
- `mcp__todo_sqlite_fts5__get_task`
- `mcp__todo_sqlite_fts5__list_recent`
- `mcp__todo_sqlite_fts5__ut_requirements_submit`
- `mcp__todo_sqlite_fts5__ut_testcases_submit`
- `mcp__todo_sqlite_fts5__projection_requirements`
- `mcp__todo_sqlite_fts5__projection_testcases`
- `mcp__todo_sqlite_fts5__projection_all`
- `mcp__todo_sqlite_fts5__exportTodoMd`
- その他全API

## テスト

### Stdio接続テスト

```bash
node test-stdio-connection.js
```

期待される出力:
```
🔌 Starting MCP Stdio server...
✅ Server started

📝 Test 1: Creating a task...
✅ Task created: T-STDIO-TEST-...

📖 Test 2: Getting the task...
✅ Task retrieved: {...}

📋 Test 3: Submitting requirements...
✅ Requirements submitted: {...}

🧪 Test 4: Submitting testcases...
✅ Testcases submitted: {...}

📄 Test 5: Exporting TODO.md...
✅ TODO.md exported:
   - Has Requirements link: ✓
   - Has TestCases link: ✓

🎉 All file links are present in TODO.md!
🎉 All Stdio tests passed successfully!
```

### WebSocket接続テスト (従来の方法)

```bash
# ターミナル1: サーバー起動
PORT=18765 node dist/server.js

# ターミナル2: テスト実行
node test-mcp-connection.js
```

## 使用例

### Claude Codeでの使用

```
ユーザー: "mcp__todo_sqlite_fts5__upsert_taskを使って新しいタスクを作成してください"

Claude: タスクを作成します。
[mcp__todo_sqlite_fts5__upsert_taskツールを使用]

タスクが作成されました: T-20251013-123
```

```
ユーザー: "projection_allを実行してTODO.mdと関連ファイルを生成してください"

Claude: projection_allを実行します。
[mcp__todo_sqlite_fts5__projection_allツールを使用]

以下のファイルが生成されました:
- TODO.md
- .specify/requirements/...
- .specify/testcases/...
```

## トラブルシューティング

### MCPツールが表示されない

1. **設定ファイルの確認**
   ```bash
   cat "$APPDATA/Claude/claude_desktop_config.json"  # Windows
   cat ~/.config/Claude/claude_desktop_config.json   # macOS/Linux
   ```

2. **パスの確認**
   - 絶対パスを使用していますか？
   - `stdio-server.js` (WebSocketの`server.js`ではない) を指定していますか？

3. **ビルド確認**
   ```bash
   ls -la dist/stdio-server.js
   ```
   ファイルが存在することを確認

4. **手動起動テスト**
   ```bash
   node dist/stdio-server.js
   ```
   起動後、以下のようなログが表示されれば正常:
   ```
   [mcp-stdio] Server started on stdio transport
   ```

5. **Claude Code完全再起動**
   - タスクトレイからも終了
   - プロセスマネージャーで残存プロセスがないか確認
   - 再起動

### ログの確認

Stdio接続では、サーバーログは`stderr`に出力されます:

```bash
node dist/stdio-server.js 2>server.log
```

## アーキテクチャ

### 共通RPCハンドラ

`src/server/rpc-handler.ts`は、WebSocketとStdio両方で使用される共通のRPCハンドラです:

```typescript
export function createRPCHandler(
  db: DB,
  issuesManager: ReviewIssuesManager,
  additionalHandlers: Map<string, Handler>
) {
  return async function handleRPC(method: string, params: any, id: any) {
    // 全てのRPCメソッドを処理
    // WebSocket/Stdio両方で同じロジックを使用
  }
}
```

### Stdio接続フロー

```
Claude Code
    ↓ stdin/stdout
stdio-server.js
    ↓
rpc-handler.ts (共通ハンドラ)
    ↓
DB/MCP Handlers
```

### WebSocket接続フロー (従来)

```
WebSocketクライアント
    ↓ ws://
server.js
    ↓
rpc-handler.ts (共通ハンドラ)
    ↓
DB/MCP Handlers
```

## 環境変数

以下の環境変数が利用可能です:

| 変数名 | 説明 | デフォルト |
|--------|------|------------|
| `DB_FILE` | データベースファイル名 | `todo.db` |
| `AUTO_EXPORT_ON_EXIT` | 終了時の自動エクスポート | `1` |
| `MCP_TOKEN` | 認証トークン (オプション) | なし |
| `CAS_DIR` | Content-Addressable Storage ディレクトリ | `data/cas` |
| `EXPORT_DIR` | エクスポート先ディレクトリ | `data/snapshots` |
| `SHADOW_PATH` | シャドウファイルパス | `data/shadow/TODO.shadow.md` |

## 参考リンク

- [MCP Integration Status](./MCP_INTEGRATION_STATUS.md) - 統合状況の詳細
- [README.md](./README.md) - プロジェクト概要
- [test-stdio-connection.js](./test-stdio-connection.js) - テストコード

## 技術仕様

### JSON-RPC 2.0

Stdio接続は JSON-RPC 2.0 プロトコルを使用します:

```json
// リクエスト
{"jsonrpc": "2.0", "id": 1, "method": "upsert_task", "params": {...}}

// レスポンス (成功)
{"jsonrpc": "2.0", "id": 1, "result": {...}}

// レスポンス (エラー)
{"jsonrpc": "2.0", "id": 1, "error": {"code": 404, "message": "not_found"}}
```

### 通信プロトコル

- **入力**: stdin (1行1JSONメッセージ)
- **出力**: stdout (1行1JSONレスポンス)
- **ログ**: stderr (サーバーログ)

## ライセンス

このプロジェクトと同じライセンスが適用されます。
