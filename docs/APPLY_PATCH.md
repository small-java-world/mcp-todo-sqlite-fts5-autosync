# パッチ適用と動作確認手順

このパッチは、`small-java-world/mcp-todo-sqlite-fts5-autosync` の **拡張雛形**です。既存コードを壊さず、最小限のファイルを追加します。

## 1. 適用
1) 本ZIPを展開し、各ファイルを **リポジトリ直下**にコピーします（既存と同じパス構成を維持）。
2) 実行権限を付与（macOS/Linux）:
   ```bash
   chmod +x scripts/run-*.sh
   ```

## 2. 差分確認
```bash
git status
git add .tdd scripts docs src
git diff --cached --name-only
```

## 3. サーバへの組み込み（エンドポイント登録）
`src/mcp/index.ts`（JSON-RPCサーバ登録部）に以下の1行を追加して、各レジストラを呼び出してください。
```ts
import { registerSpeckitBridge } from "./speckit";
import { registerTddTools } from "./tdd";
import { registerTodoSplitter } from "./todo_splitter";

// 既存の register 関数に追加
registerSpeckitBridge(register);
registerTddTools(register);
registerTodoSplitter(register);
```

> もしファイル構成が異なる場合は、`src/mcp` 直下の任意のエントリポイントで同様に import / register してください。

## 4. 最小動作テスト
```bash
# サーバ起動（既存の起動方法に合わせてください）
pnpm build && pnpm start &

# 1) /speckit.tasks ダミー生成
echo '{"jsonrpc":"2.0","id":1,"method":"speckit.run","params":{"cmd":"/speckit.tasks"}}'       | nc -U /tmp/mcp.sock || true
# → .specify/demo/tasks.md が生成されればOK

# 2) 雛形生成
echo '{"jsonrpc":"2.0","id":2,"method":"tdd.scaffold","params":{"task_id":"T-EX-001"}}'       | nc -U /tmp/mcp.sock || true

# 3) テスト実行（ダミーレポート作成）
./scripts/run-unit.sh && ./scripts/run-infra.sh && ./scripts/run-e2e.sh && ./scripts/run-front.sh

# 4) 収集
echo '{"jsonrpc":"2.0","id":3,"method":"tdd.captureResults","params":{}}'       | nc -U /tmp/mcp.sock || true
```

## 5. 実運用化に向けて
- `.tdd/profile.yaml` を **プロジェクトの流儀**に合わせて編集（FW/runner/レポート形式）
- `scripts/run-*.sh` を本番の実行器に差し替え（Gradle、Vitest、Playwright 等）
- `src/mcp/*.ts` の **ダミー実装**を既存APIに接続（DB更新・FTS登録・Worktree操作）
- `docs/operations/parallel-tdd-with-claude-codex.md` をチームSOPとして共有
