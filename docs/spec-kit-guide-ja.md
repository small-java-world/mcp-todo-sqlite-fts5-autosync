# Spec Kit 実践手順書（Next.js+TS/Vitest × Kotlin/Spring Boot × PostgreSQL/Podman）

*Codex CLI & Claude Code（どちらも CLI）併用／macOS／既存コードベース対応／DDD 指向*

---

## 目的

* **設計書（スペック）駆動**で **TDD** を回すための、日々の運用ガイド。
* **フロント**（Next.js+TypeScript+Vitest）と**バックエンド**（Kotlin+Spring Boot+Gradle）を、**Spec Kit**の `/speckit.*` フローで一貫運用。
* **PostgreSQL** は **Podman** で起動。**DDD** を前提に、**リポジトリ層UTはDB前提**の方針も含む。
* **Claude Code（CLI）**＝仕様化・分解・エッジケース洗い出し、**Codex CLI**＝テスト先行の実装ペアプロ、という役割分担。

---

## 前提ツールの導入（macOS）

```bash
# Podman（PostgreSQL用コンテナ実行）
brew install podman
podman machine init --now

# Spec Kit（Specify CLI）
pip install -U git+https://github.com/github/spec-kit.git
# もしくは uv/uvx を利用してもOK

# Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Codex CLI
brew install codex

# 確認
claude version
codex --version
specify --version
podman --version
```

---

## リポジトリ構成（最小例）

既存コードベースに **Spec Kit** を組み込み、設計→計画→タスク→実装の流れを定着させます。

```
repo/
  .specify/                     # ← Spec Kit が生成（スペック一式・記憶など）
  specs/                        # ← 任意：自分たちの設計書置き場（公開用/共有用）
  frontend/                     # Next.js + TS + Vitest
    src/
    tests/
  backend/                      # Kotlin + Spring Boot + Gradle
    src/main/kotlin/...
    src/test/kotlin/...
    build.gradle.kts
    settings.gradle.kts
  tasks/
    TODO.md                     # 実行マスター（3階層タスク＋履歴）
    TODO_ARCHIVE.md             # アーカイブ（DB非対象）
  AGENTS.md                     # エージェント運用規約（TDD厳守など）
  README.md
```

---

## Spec Kit の初期化

既存リポジトリ直下で実行（内容は上書きしない運用想定）。

```bash
cd repo
specify init . --here --force --ai claude
```

> これにより `.specify/` 配下に Spec Kit 用の雛形やメモリ領域が生成され、**Claude Code CLI** で `/speckit.*` コマンドが使えるようになります。

---

## 役割分担（AGENTS.md）

`AGENTS.md` に、AIエージェントの責務と TDD ルールを明記します。

```md
# AGENTS.md

## 役割
- Claude Code CLI：仕様ドラフト化、仕様の明確化、エッジケース洗い出し、Spec Kitの `/speckit.*` 実行。
- Codex CLI：テスト先行のコード生成・実装支援（Vitest/JUnit/スモールコミット）。

## 厳格TDD
1. 仕様（.specify/specs/*）を読み、**先にテスト**を作成。
2. すぐテストを実行し**失敗（Red）を確認**。この段階では実装しない。
3. **最小実装**でグリーン化 → リファクタ → 再テスト。
4. **テストの意図を弱めて通す行為は禁止**。変更多発時は理由と差分の説明必須。
5. 小さなコミット。コミット本文に根拠（仕様・議事）を記載。
```

---

## フロー全体

1. **仕様作成（/speckit.specify）**
2. **計画策定（/speckit.plan）**
3. **タスク化（/speckit.tasks）→ tasks/TODO.md に反映**
4. **TDD 実装ループ（フロント/バック）**
5. **UT/IT 実行（Vitest, Gradle）**
6. **アーカイブ・履歴管理（TODO_ARCHIVE.md / DB 非対象）**

---

## 1) 仕様の作成：`/speckit.specify`

**Claude Code CLI** を起動して（`claude`）、リポジトリ直下で以下を実行：

```
/speckit.specify
```

**入力例（User Authentication 機能）**：

```
ユーザーがメールアドレス＋パスワードでログインできる機能。
- 成功時：JWT を返し、フロントはダッシュボードへ遷移
- 失敗時：エラーメッセージ
- DB: PostgreSQL（ユーザ＋ハッシュ保存）
- バック：Spring Boot API、フロント：Next.js ログインフォーム
- セキュリティ前提：パスワードは必ずハッシュ比較、エラーメッセージは過度に詳細にしない
```

→ `.specify/specs/<ID-user-auth>/spec.md` が生成。

#### 機能名と <ID-...> の生成規則

- 「機能名」とは、`/speckit.specify` 実行時に入力する機能のタイトル（例: "User Authentication", "Task Search"）。
- ディレクトリ名 `<ID-user-auth>` は、機能名をスラッグ化（小文字・空白や記号の除去/置換）し、必要に応じて連番を付与したものが自動生成されます。
- 例: `User Authentication` → `user-auth` → `.specify/specs/<ID-user-auth>/`。
- 必要に応じて後からリネーム可能です（相対リンクで参照しているため、ドキュメント内リンクを合わせて変更すればOK）。
**補強**：`/speckit.clarify` で不明点の質問リストを出させ、仕様に反映。

**仕様テンプレ（見出しベース）**

```md
# Feature: User Authentication
## Business Rules
- 5回連続失敗で15分ロック、成功で失敗カウントリセット
## Acceptance Criteria
- AC1: 成功→200/JWT, HttpOnly Cookie, フロントはリダイレクト
- AC2: 認証失敗→エラー表示（文言ガイドライン準拠）
- AC3: バリデーション（空欄・形式不正）で 400
## Edge Cases
- メール前後の空白除去
- 未認証メールは 403
## Non-Functional
- p95 < 150ms（ローカル）
- カバレッジ 85% 以上（関連モジュール）
```

---

## 2) 計画の策定：`/speckit.plan`

```
/speckit.plan
```

**入力例（技術スタック方針）**：

```
フロント：Next.js + TypeScript + Vitest（React Testing Library）
バック：Kotlin + Spring Boot 3（JPA, Spring Data）, JUnit 5
DB：PostgreSQL 15（Podman コンテナ）
テスト：UT（Vitest/JUnit）、必要に応じて Testcontainers またはローカルPodman接続
DDD：User を Aggregate とし、Repository はドメイン層にインターフェース、インフラ層に実装
Gradle はホストで実行
```

→ `.specify/specs/<ID>/plan.md` が生成。仕様に対する技術上の実現方針・責務分担・フォルダ構成などが記載されます。

---

## 3) タスク化：`/speckit.tasks` → `tasks/TODO.md` へ反映

```
/speckit.tasks
```

→ `.specify/specs/<ID>/tasks.md` が生成されるので、**実作業のマスター**として `tasks/TODO.md` に転記（または取り込み）します。

**`tasks/TODO.md`（3階層＋履歴・状態）例**

```md
# TODO (Authoritative)

## L1: 001-User-Auth
- id: L1-001
- status: InProgress
- history:
  - 2025-10-12T10:00+09:00 Created by team

### L2-010 Backend: 認証サービスの実装
- id: L2-010
- parent: L1-001
- status: InProgress
- history:
  - 2025-10-12T10:15+09:00 Open
- children:
  - L3-101 JUnit 先行（AuthService/Controller 仕様網羅）
  - L3-102 実装最小化→Green化
  - L3-103 例外設計とメッセージポリシー適用

### L2-020 Frontend: LoginPage 実装
- id: L2-020
- parent: L1-001
- status: Open
- children:
  - L3-201 Vitest 先行（フォーム検証・エラー表示）
  - L3-202 実装（API連携・遷移）
```

**アーカイブ**は `tasks/TODO_ARCHIVE.md` に移動コピー

* `status: Archived` に遷移
* **DB ロード対象外**の仕様を徹底（CI で検査するとなお良い）

**DB マッピング方針（参考）**

| フィールド               | DB列                         |
| ------------------- | --------------------------- |
| id                  | tasks.id（文字列PK）             |
| parent              | tasks.parent_id（FK）         |
| title               | tasks.title                 |
| level(L1/L2/L3)     | tasks.level（int）            |
| status              | tasks.status（enum）          |
| history[].timestamp | task_history.ts             |
| history[].action/by | task_history.action / actor |

---

### 3.5) MCP TODO Server 連携（Spec Kit × TDD 実運用）

本リポの MCP TODO Server（WebSocket JSON-RPC）により、Spec Kit で得た成果物や TDD の位相を一元管理できます。

- エンドポイント例（抜粋）
  - `speckit.run({ cmd:"/speckit.tasks", todo_id? }) -> { ok, generated, indexed? }`
    - `.specify/**/tasks.md` を生成。`todo_id` を渡すと、生成物パスを Note(kind=`spec_tasks`) としてDBに索引
  - `tdd.scaffold({ task_id }) -> { ok, generated[] }`
  - `tdd.run() -> { ok }`, `tdd.captureResults() -> { ok, summaries[] }`
  - `tdd.phase.set({ phase: "red|green|refactor|verify" }) -> { ok, phase }`
  - `todo.decompose({ from? }) -> { ok, emits[] }`, `todo.materialize({ tasklet_id }) -> { ok, branch }`
  - `intent.create/get/list/complete`, `note.put/get/list`
  - `projection.requirements/testcases/all`
  - `ut.requirements.submit/get`, `ut.testcases.submit/get`

- 例（JSON-RPC リクエスト）

```json
{ "jsonrpc":"2.0", "id":1, "method":"speckit.run", "params":{ "cmd":"/speckit.tasks", "todo_id":"T-2025-001" } }
```

- `.tdd/profile.yaml`（雛形あり）
  - テスト種別（unit/infra/e2e/front）のランナー/レポート規約を一箇所に定義
  - `tdd.run`/`tdd.captureResults` がこのプロファイルに沿って実行・収集

#### RPCディスパッチのハンドラマップ化（概要）

MCP TODO Server 側の RPC は、メソッド名→ハンドラのマップでディスパッチされます。`src/server.ts` の `coreHandlers` に登録され、拡張（Speckit/TDD/Note/Intent/Projection/UT）は `registerHandler()` でプラグイン追加されます。switch 文の肥大化を避け、保守性と可読性を向上します。

主なマップ化済み RPC（抜粋）:

- タスク: `list_recent`, `get_task`, `upsert_task`, `mark_done`, `attach_blob`
- TODO.md: `importTodoMd`, `exportTodoMd`
- 変更フィード: `poll_changes`
- レビュー指摘: `create_issue`, `get_issue`, `update_issue`, `resolve_issue`, `close_issue`, `add_issue_response`, `get_issue_responses`, `get_issues`, `search_issues`
- ワークツリー: `get_repo_binding`, `ensure_worktree`
- その他: `reserve_ids`, `patch_todo_section`, `todo.watch`, `todo.unwatch`

#### ワークツリー（Git worktree）利用例

`get_repo_binding` で `repoRoot` を取得し、ファイル参照は **worktreeルートからの相対パス**を第一推奨とします（`repo://path/to/file` は任意スキームとして許可、いずれも `repoRoot` 基準）。`CONFIG.git.autoEnsureWorktree` が有効な場合は未作成でもサーバ側で安全に作成されます。明示的にワークツリーを確保したい場合は `ensure_worktree` を先に呼びます。

```json
{"jsonrpc":"2.0","id":1,"method":"ensure_worktree","params":{"authToken":"<MCP_TOKEN>","branch":"feat/awesome","dirName":"feat-awesome"}}
{"jsonrpc":"2.0","id":2,"method":"get_repo_binding","params":{"authToken":"<MCP_TOKEN>"}}
```

---

## 4) フロントエンド TDD（Next.js + Vitest）

**Codex CLI** を使って **テスト先行**で回します。

1. **失敗するテストを先に作る**

   ```bash
   cd frontend
   codex
   ```

   **Codex への指示例**

   ```
   LoginPage の Vitest + React Testing Library テストを作成。
   - 空欄送信でエラー表示
   - 正しい入力で API を叩く（モック）→ 成功時に遷移
   ファイル: tests/LoginPage.test.tsx
   実装はまだ書かない。まず失敗するテストのみ。
   ```

2. **テスト実行（Red を確認）**

   ```bash
   npm run test   # or: pnpm vitest --run
   ```

3. **最小実装→Green化**
   再び **Codex** にて：

   ```
   LoginPage.tsx を実装。上記テストを通す最小限のコードのみ。
   - 入力欄（email/password）
   - バリデーション
   - /api/login への呼び出し（モック前提）
   - 成功で遷移
   ```

4. **リファクタ**

   * UI/ハンドラ分離、検証ロジックの抽出など
   * 追加テスト（エッジケース）→ 実装 → Green → リファクタを繰り返す

---

## 5) バックエンド TDD（Kotlin + Spring Boot + Gradle）

**Codex CLI** で **JUnit 先行**。

1. **失敗するテストを先に作る**

   ```bash
   cd backend
   codex
   ```

   **Codex への指示例**

   ```
   AuthService の JUnit5/Kotlin テストを作成。
   - 正常：正しい資格情報で JWT 生成
   - 異常：不正パスワードで例外
   - 連続失敗ロックの振る舞い（5回/15分）
   ファイル: src/test/kotlin/.../AuthServiceTest.kt
   実装はまだ書かない。まず失敗するテストのみ。
   ```

2. **テスト実行（Red を確認）**

   ```bash
   ./gradlew test
   ```

3. **最小実装→Green化**
   **Codex** にて：

   ```
   Kotlin で AuthService 実装。
   - UserRepository（ドメインのインターフェース）を利用
   - Infrastructure に JPA 実装
   - 仕様のロック判定、一貫した例外、メッセージポリシー
   Controller の login() も実装
   ```

4. **DB 前提テストの実施**

   * **Podman PostgreSQL** を起動して **実DBでのUT/IT** を走らせる、または **Testcontainers**（Podman 対応設定）を導入。

---

## 6) PostgreSQL（Podman）運用

### コンテナ起動

```bash
podman pull postgres:15
podman run -d --name dev-postgres \
  -e POSTGRES_DB=mydb -e POSTGRES_USER=appuser -e POSTGRES_PASSWORD=pass \
  -p 5432:5432 postgres:15
```

* アプリの接続例： `jdbc:postgresql://localhost:5432/mydb`
* `psql -h localhost -U appuser mydb` で確認

### Testcontainers（任意・ITで利用）

Podman ソケットを有効化しておく（環境に応じて設定）。

```bash
export TESTCONTAINERS_HOST_OVERRIDE=localhost
export DOCKER_HOST=unix:///var/run/podman/podman.sock
```

Gradle 依存関係に `testcontainers-postgresql` を追加し、SpringBootTest でコンテナ起動 → DB 前提の統合テストを自動化。

---

## 7) 推奨スクリプト・設定

### frontend/package.json（抜粋）

```json
{
  "scripts": {
    "test": "vitest run --reporter=verbose",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "typescript": "^5.6.0"
  }
}
```

### backend/build.gradle.kts（抜粋）

```kotlin
dependencies {
    testImplementation("org.junit.jupiter:junit-jupiter")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // testcontainers を使う場合
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
}
tasks.test {
    useJUnitPlatform()
}
```

---

## 8) Claude/Codex への定型プロンプト集

### 仕様フェーズ（Claude Code）

* 「`/speckit.specify`：このユーザーストーリーで仕様ドラフトを作成。AC/Edge Cases を明確化して。」
* 「`/speckit.clarify`：仕様の曖昧点を質問リスト化。未確定事項を洗い出して。」
* 「`/speckit.plan`：技術計画を作成。Next.js/Vitest、Spring Boot/JUnit、PostgreSQL/Podman。DDD を明示して。」
* 「`/speckit.tasks`：上記計画をタスクへ分割（フロント/バック/共通）。優先度を付与して。」

### 実装フェーズ（Codex CLI）

* 「**Strict TDD**。`tests/...` に **先に失敗するテスト**を作成。まだ実装しない。」
* 「`npm run test` / `./gradlew test` を実行して **Red** を確認後、**最小実装**でグリーン化して。」
* 「**テストの意図を弱めない**。変更が必要なら理由と差分を明示。」
* 「小さなコミットで進め、コミット本文に根拠リンク（仕様や議事録パス）を記載。」

---

## 9) 日々の運用チェックリスト

* [ ] 新機能の入口は **/speckit.specify → /speckit.plan → /speckit.tasks**。
* [ ] `tasks/TODO.md` を **単一の正準**として更新（DB 同期がある場合もここがマスター）。
* [ ] **テスト先行**（Vitest/JUnit）→ **Red** 確認 → **最小実装** → **Green** → **リファクタ**。
* [ ] **アーカイブ**は `TODO_ARCHIVE.md` へ移動。**DB ロード対象外**ポリシーを CI で検証。
* [ ] **Podman PostgreSQL** が必要なテストは起動確認。**Testcontainers** も選択肢。
* [ ] **AGENTS.md** を参照し、Claude/Codex の役割を逸脱しない。

---

## 10) 付録：テンプレ（コピー可）

### `specs/90_test_plan.md`

```md
# Test Plan
- Frontend: Vitest（React Testing Library）。フォーム・遷移・API呼び出しをモック中心にUT。
- Backend: JUnit5 + Spring Boot Test。サービス・コントローラのUT/IT。必要に応じて Testcontainers。
- Coverage: フロント/バックとも関連モジュール 85% 以上。
- CI: lint/format/test/coverage を必須ゲートに。
```

### `tasks/TODO.md` の履歴形式（サンプル）

```md
#### L3-201 Vitest 先行（フォーム検証・エラー表示）
- id: L3-201
- parent: L2-020
- status: Done
- history:
  - 2025-10-12T13:10+09:00 Open
  - 2025-10-12T13:35+09:00 Done by codex
```

---

## まとめ

* **Spec Kit** を軸に、**仕様→計画→タスク→TDD 実装**を **Claude（仕様）× Codex（実装）** で機械的に回せます。
* **DDD** と **DB 前提のUT/IT** にも対応（Podman/PostgreSQL、Testcontainers）。
* `AGENTS.md` / `tasks/TODO.md` / `.specify/` が**単一の真実の源泉**としてチーム全体のガイドになります。

> このファイルを `docs/spec-kit-guide-ja.md` としてリポジトリに保存し、オンボーディング＆日次運用のリファレンスとしてご利用ください。
