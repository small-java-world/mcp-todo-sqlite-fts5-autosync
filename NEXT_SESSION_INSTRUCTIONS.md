# 次セッションでの作業指示

## 現在の状態

### 実装完了済み
1. ✅ **Note API** (`note.put`, `note.get`, `note.list`) - タスクへのノート・成果物添付機能
2. ✅ **Projection API** (`projection.requirements`, `projection.testcases`, `projection.all`) - DB → ファイルシステム投影
3. ✅ **TODO.mdファイルリンク機能** - TODO.md内の各タスクに`.specify/**`ファイルへのリンクを自動生成
4. ✅ **MCP設定ファイル更新** - `claude_desktop_config.json`に`todo-sqlite-fts5`サーバー登録（パス修正済み）

### テスト結果
- ✅ 全277テストがパス
- ✅ WebSocket経由の手動テストで全機能動作確認済み
- ✅ ファイルリンクが正しくTODO.mdに生成されることを確認

## Claude Code再起動後の確認作業

### 1. MCPサーバーがClaude Codeから認識されているか確認

Claude Codeを再起動後、以下を確認してください：

```
Claude Code再起動後、利用可能なMCPツールを確認
```

期待されるツール一覧に以下が含まれているか：
- `mcp__todo_sqlite_fts5__upsert_task`
- `mcp__todo_sqlite_fts5__ut_requirements_submit`
- `mcp__todo_sqlite_fts5__ut_testcases_submit`
- `mcp__todo_sqlite_fts5__projection_requirements`
- `mcp__todo_sqlite_fts5__projection_testcases`
- `mcp__todo_sqlite_fts5__projection_all`
- `mcp__todo_sqlite_fts5__exportTodoMd`

### 2. MCP Agent経由での疎通テスト

以下のシーケンスでテストを実行：

#### Step 1: タスク作成
```
MCPツールを使ってテストタスクを作成してください：
- tool: mcp__todo_sqlite_fts5__upsert_task
- params:
  - id: "T-MCP-TEST-001"
  - title: "MCP Agent Integration Test"
  - text: "Testing MCP agent connectivity"
```

#### Step 2: Requirements提出
```
MCPツールでrequirementsを提出してください：
- tool: mcp__todo_sqlite_fts5__ut_requirements_submit
- params:
  - id: "REQ-MCP-001"
  - todo_id: "T-MCP-TEST-001"
  - raw_markdown: "# Requirements\n\n- Must integrate with MCP\n- Must support file links"
  - idempotency_key: "req-mcp-test-001"
```

#### Step 3: TestCases提出
```
MCPツールでtestcasesを提出してください：
- tool: mcp__todo_sqlite_fts5__ut_testcases_submit
- params:
  - id: "TC-MCP-001"
  - requirements_id: "REQ-MCP-001"
  - todo_id: "T-MCP-TEST-001"
  - raw_markdown: "# Test Cases\n\n## TC-1: Integration Test\n- Given: MCP agent is active\n- When: Tool is called\n- Then: Response is received"
  - idempotency_key: "tc-mcp-test-001"
```

#### Step 4: Projection実行
```
MCPツールでprojection.allを実行してください：
- tool: mcp__todo_sqlite_fts5__projection_all
- params:
  - output_dir: "./test-mcp-output"
  - specify_dir: "./test-mcp-output/.specify"
```

#### Step 5: TODO.md確認
```
生成されたTODO.mdファイルを確認してください：
./test-mcp-output/TODO.md

期待される内容：
- T-MCP-TEST-001タスクのセクション
- Related:セクション内に以下のリンク：
  - [Requirements](.specify/requirements/T-MCP-TEST-001.md)
  - [TestCases](.specify/testcases/T-MCP-TEST-001.md)
```

#### Step 6: 生成ファイル確認
```
以下のファイルが存在することを確認：
- ./test-mcp-output/TODO.md
- ./test-mcp-output/.specify/requirements/T-MCP-TEST-001.md
- ./test-mcp-output/.specify/testcases/T-MCP-TEST-001.md
```

## トラブルシューティング

### MCPツールが表示されない場合

1. **設定ファイルの確認**
   ```bash
   cat ~/AppData/Roaming/Claude/claude_desktop_config.json
   ```
   `todo-sqlite-fts5`エントリが存在し、パスが正しいか確認

2. **ビルドファイルの存在確認**
   ```bash
   ls -la D:/mcp-todo-sqlite-fts5-autosync/dist/server.js
   ```

3. **手動起動テスト**
   ```bash
   cd D:/mcp-todo-sqlite-fts5-autosync
   node dist/server.js
   ```
   → `[mcp] listening on ws://0.0.0.0:8765` が表示されればOK

4. **Claude Code完全再起動**
   - Claude Codeを完全終了
   - プロセスが残っていないか確認
   - 再起動

### ポート競合の場合

別のプロセスがポート8765を使用している場合：
```bash
# Windowsの場合
netstat -ano | findstr :8765

# ポートを変更する場合は claude_desktop_config.json の PORT を変更
```

## 成功基準

✅ Claude Code再起動後、MCPツールが利用可能になっている
✅ タスク作成・Requirements・TestCases提出が成功
✅ projection.allが成功し、ファイルが生成される
✅ TODO.md内に正しいファイルリンクが含まれている
✅ リンク先のファイルが実際に存在する

## 参考情報

### 実装済み機能
- **src/utils/db.ts**: `exportTodoMd()`にファイルリンク生成ロジック追加（Line 1263-1288）
- **src/mcp/note.ts**: Note API実装
- **src/mcp/projection.ts**: Projection API実装
- **test/unit/todo-md-file-links.test.ts**: ファイルリンク機能のテスト（6テスト全パス）

### 手動テスト結果
前セッションで実行した`test-mcp-connection.js`により、WebSocket経由で全機能が正常動作することを確認済み。
