# Hands-on: TODO × TDD × MCP（Claude Code/Codex 向け実践ガイド）

本ハンズオンは、Claude Code 等から MCP Agent 経由で MCP Server に情報を集約しつつ、TDD を段階的に回すための依頼（プロンプト）テンプレと具体例をまとめたものです。

---

## 0. Speckit を起点にしたTDD（推奨フロー）

まず SpecKit のカスタムスラッシュコマンドで「仕様→計画→タスク」を生成し、その後に MCP 側の要件/テスト/TDD 位相を連携するのが最短です。

Claude Code（SpecKit）のカスタムスラッシュコマンド（例）
```
/specify 〈機能名とゴール〉
/plan 〈技術方針やアーキテクチャ前提〉
/tasks 〈実装タスクへの分解方針（必要に応じて追記）〉
```
補足:
- 上記はクライアント側（Claude Code 等）で実行されるカスタムコマンドです。サーバやMCPエージェントは関与しません。
- 生成された `.specify/**` はローカルの worktree にコミットし、必要に応じて MCP にリンク（worktree ルート相対パス）を登録します。
  - 参考: [SpecKitの紹介記事（Zenn）](https://zenn.dev/acntechjp/articles/1d35658b0114b6)

### SpecKit カスタムスラッシュコマンド一覧（概要）

- `/specify`: 仕様の生成（目的・背景・受け入れ基準・制約）。
- `/plan`: 設計/技術計画の生成（スタック・構成・テスト/運用戦略）。
- `/tasks`: タスク分解（小さな実装単位・優先度・依存関係）。

これらはクライアント（Claude Code など）で実行され、生成物は worktree に保存・コミットされます。MCP はその後の SSOT 連携（要件/テスト/TDD/リンク）を担います。

注意（連携ポリシー）
- /tasks の後は「設計系と作業ログのみ」をMCPへ連携します。
  - 連携対象: 仕様(spec)/計画(plan)/タスク(tasks)の必要断片、作業ログ/要約ノート。
  - 非対象: アプリのコード/テストコード（ソースはリポジトリで管理し、MCP連携は不要）。
- 連携は MCP エージェントが自動化（worktreeルート相対リンク or 必要時の添付）。クライアント側の手動送信は不要です。

役割分担（重要）
- クライアント（Claude Code/Codex CLI）: `/specify` `/plan` `/tasks` を実行し、生成物を worktree に保存・コミット。
- MCP: Speckit非依存。`intent.*`/`ut.*`/`tdd.phase.set`/`note.put` でSSOT（DB）へ要件・テスト・位相・リンクを登録/共有。
- 以降、本ドキュメントの 2章（要件→テスト設計→TDD各位相）へ進む

補足: Speckit で作られた `.specify/**` は投影物であり SSOT ではありません。正本（SSOT）は常に MCP Server（DB）側の `tasks`/`notes`/`ut.*` にあります。
参考: [SpecKitの概要と運用例（Zenn）](https://zenn.dev/acntechjp/articles/1d35658b0114b6)

---

## 1. 全体像（Claude Code → MCP Agent → MCP Server）
- 依頼を Claude に入力すると、Claude 側の MCP Agent が JSON-RPC を呼び、MCP Server が DB（SSOT）に保存・配信（watch）します。
- 主に使うRPC（抜粋）
  - intent.*（依頼の作成/完了）
  - ut.requirements.submit/get、ut.testcases.submit/get
  - tdd.phase.set（red/green/refactor/verify）
  - note.put（要約・ログ・成果物リンクの保存）
  - speckit.run（補助的な仕様/タスク生成）

---

## 2. フローと依頼テンプレ（そのまま貼って使えます）

### 2.1 テストの要件定義（Requirements Elicitation）
Claudeへの依頼（例）
```
# まず仕様と計画を Speckit で固める
/specify 「Task Search の検索要件（FTS/ハイライト/並び替え）の定義」
/plan 「SQLite FTS5、bm25、snippet、WAL運用とテスト戦略」

# 必要ならタスク分解
/tasks 「UT/IT分割、FTSプロパティテスト導入、運用スクリプト」

# ここから MCP に要件を連携
この TODO T-2025-001 の「テスト可能な要件」を Markdown でまとめ、
ut.requirements.submit({ todo_id:"T-2025-001", raw_markdown:<本文>, idempotency_key:"req-T-2025-001-v1" }) を実行。
- 不変条件/事前条件/事後条件
- Given/When/Then の例 2〜3件
- 曖昧点/不足点リスト
```

（作成物の登録は MCP エージェントが自動化します。クライアント側での手動操作は不要です。）
ポイント
- idempotency_key を必ず付ける（重複登録防止）。
- 提出後は watch の `requirements.updated` で反映を確認。

### 2.2 テストケース設計（Test Cases Design）
（成果物の登録・リンク付けは MCP エージェントが自動化。クライアントの手動操作は不要）
Claudeへの依頼（例）
```
上記要件に対するテストケースを設計してください。
- 正常/異常/境界/順序依存を分類
- 各ケースに id / kind / inputs / expected を必須
出力は Markdown（表形式）。
出力後、ut.testcases.submit({ requirements_id:<前段のID>, raw_markdown:<本文>, idempotency_key:"tc-T-2025-001-v1" }) を呼んでください。
```

### 2.3 TDD Red（失敗する最小テストの追加）
（フェーズ更新や要約の保存は MCP エージェントが自動化。クライアントはテスト追加と最小実装に集中）
Claudeへの依頼（例）
```
/tdd.phase.set { phase: "red" }
この TODO T-2025-001 の RED を作成：
- まず失敗する最小のテストを1件だけ追加（既存テストに影響なし）
- 実行コマンドと結果を要約して、note.put({ todo_id:"T-2025-001", kind:"tdd-summary", text:<要約> }) で保存
```

### 2.4 TDD Green（最小実装で緑に）
（フェーズ更新や要約の保存は MCP エージェントが自動化）
Claudeへの依頼（例）
```
/tdd.phase.set { phase: "green" }
さきほどの RED を緑にする最小実装を行い、全テストを実行して結果を要約→ note.put で保存。
外部仕様の変更は不可。
```

### 2.5 TDD Refactor（外部仕様を変えずに改善）
（フェーズ更新や要約の保存は MCP エージェントが自動化）
Claudeへの依頼（例）
```
/tdd.phase.set { phase: "refactor" }
外部挙動を変えずに内部改善（命名の明確化、関数分割、重複削除）。
テストは常に全緑を維持。作業内容と根拠を要約して note.put で保存。
```

### 2.6 TDD Verify（統合/非機能の検証）
（非機能検証の結果要約も MCP エージェントが自動保存）
Claudeへの依頼（例）
```
/tdd.phase.set { phase: "verify" }
統合テスト、性能（p95）、タイムアウト、ログ・監視指標を確認。
観測結果の要約と改善提案を note.put に保存。
```

---

## 3. JSON-RPC の具体例
以下は Claude から MCP Agent を介して送られる想定のリクエスト例です（手動利用時の参考）。
```json
{ "jsonrpc":"2.0", "id":1, "method":"ut.requirements.submit", "params":{
  "todo_id":"T-2025-001",
  "raw_markdown":"# Requirements\n- ...",
  "idempotency_key":"req-T-2025-001-v1"
}}
```
```json
{ "jsonrpc":"2.0", "id":2, "method":"tdd.phase.set", "params":{ "phase":"red" } }
```
```json
{ "jsonrpc":"2.0", "id":3, "method":"note.put", "params":{
  "todo_id":"T-2025-001",
  "kind":"tdd-summary",
  "text":"RED: 失敗テスト1件。ログ: ..."
}}
```

---

## 4. 運用のコツ（短縮版）
- すべての更新に `idempotency_key` と、必要に応じて `if_vclock` を付与（衝突/重複を無害化）。
- 作業は小さく刻み、`note.put(kind=tdd-summary)` で経過をこまめに保存 → watch で即時共有。
- Verify では p95/timeout/ログ/監視の観点を必ずチェック。

---

## 5. よく使うリンク
- 全体像/契約: `docs/docs_architecture_purpose_and_intent_ja.md`
- Spec Kit × TDD 実運用: `docs/spec-kit-guide-ja.md`
- FTS 運用/再構築: `docs/fts5_sync.md`, `scripts/reindex_fts.sql`
- 受信（watch）例・FAQ・移行: README の該当節

