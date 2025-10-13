# Claude Code から TODO MCP サーバーへ接続する設定手順

このドキュメントは、VS Code 拡張「Claude Code」から本リポジトリが提供する TODO MCP サーバー（`src/server.ts`）に接続するための最小構成をまとめたものです。すべて日本語で記載しています。

---

## 1. 前提条件
- このリポジトリをローカルに clone 済みで、`npm install` が完了していること
- `npm run build` で `dist/` が生成されていること（または `npm run dev` で `ts-node` が利用可能）
- Node.js 18 以上 / npm 9 以上
- VS Code 最新版と Claude Code 拡張（`@anthropic-ai/claude-code`）がインストール済み

> Claude Code 拡張のインストール後、VS Code の設定を JSON 形式で編集できるようにしておいてください。

---

## 2. TODO MCP サーバーの起動
1. .env などに共有トークンを設定します（任意ですが本番運用では必須）。

   ```bash
   echo "MCP_TOKEN=devtoken" >> .env
   ```

2. MCP サーバーを起動します。

   ```bash
   # 開発モード（ts-node）
   npm run dev

   # もしくはビルド済み JS で常駐
   PORT=8765 node dist/server.js
   ```

   既定の WebSocket エンドポイントは `ws://127.0.0.1:8765` です。ログに `[ws] client connected` が表示されれば接続待ち状態になっています。

---

## 3. Claude Code 側の設定
Claude Code 拡張は Experimental フラグとして MCP サーバーを登録できます。`settings.json`（ユーザー設定またはワークスペース設定）に以下のキーを追加してください。

```jsonc
{
  // 既存の設定にマージしてください
  "claude.experimental.mcpServers": {
    "todo-sqlite-fts5": {
      "type": "websocket",
      "url": "ws://127.0.0.1:8765",
      "metadata": {
        "authToken": "devtoken"
      }
    }
  }
}
```

### 設定項目の意味
- `type: "websocket"` … Claude Code から WebSocket で直接接続する指定です。
- `url` … MCP サーバーの WebSocket エンドポイント。`PORT` を変更した場合はここも合わせてください。
- `metadata.authToken` … サーバー側の `MCP_TOKEN` と揃えます。トークンが未設定の場合は項目ごと削除して構いません。

> Claude Code は設定保存後、自動で MCP サーバーへの再接続を試みます。うまく接続できない場合は VS Code コマンドパレットから `Claude: Reload MCP Servers` を実行してください。

---

## 4. 接続確認
1. VS Code の「Claude」サイドバーで MCP サーバー一覧に `todo-sqlite-fts5` が表示されているか確認します。
2. `intent.list` など任意の RPC を実行し、レスポンスが得られれば接続成功です。
3. 必要に応じて `remote_client.js`（WS クライアントの動作例）を参考に、`register` 後に `session` が払い出されていることをログで確認してください。

失敗時のチェックリスト:
- サーバーが起動しているか (`npm run dev` のログに `[ws] client connected` が出ているか)
- `PORT` や `MCP_TOKEN` が `.env` と VS Code 設定で一致しているか
- 既に別クライアントがセッションを保持しており、リミットに達していないか
- ファイアウォールや VPN により `ws://127.0.0.1:8765` がブロックされていないか

---

## 5. 運用ヒント
- 作業開始時は `sync docs tests src`（Codex CLI）で最新の投影を取得してから MCP 経由で編集します。
- MCP 経由で Intent/TDD フェーズを更新すると、`todo.watch` サブスクリプション経由で Claude Code と Codex CLI 両方に変更が通知されます。
- Claude Code からファイルを直接編集する場合でも、投影ファイル（`TODO.md` や `.specify/**`）は MCP サーバーを経由して更新するのが原則です。

---

## 6. 参考
- `remote_client.js` … WebSocket 経由で TODO MCP に接続する最小クライアントの例。
- `src/server.ts` … WebSocket サーバーの実装。`register` → `session` → RPC 呼び出しの流れが確認できます。
- `docs/hands-on-todo-tdd-mcp-ja.md` … MCP/TDD ハンズオン資料。Claude Code と Codex CLI の役割分担も説明しています。
