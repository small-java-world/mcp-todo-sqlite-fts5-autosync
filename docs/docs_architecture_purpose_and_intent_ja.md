# 本仕組みの目的と意図（Purpose & Intent）

> 対象: small-java-world/mcp-todo-sqlite-fts5-autosync を中核にした **MCP Server × AIエージェント** 構成
> 位置づけ: **情報の一元化（Single Source of Truth; SSOT）** を最優先に、TODO駆動の仕様書駆動TDDを複数端末・複数エージェントで安全に回すための“契約と運用”を定義する。

---

## 1. 目的（What we want）
- **TODO のリアルタイム一元管理**: TODO一覧・状態・タグ・相互参照を MCP Server の DB に集約し、全端末にライブ配信する。
- **TDD が可能になるための要件定義＆テストケース洗い出しの一元化**: 人が Codex CLI / Claude Code に「この TODO の要件とテストケースを洗い出して」と依頼 → エージェントが結果（**生の原文**）を **MCP エージェント経由で MCP Server へ登録** → Server が正規化・保管し、全員に共有。
- **TDD サイクルの一元管理**: 人が「この TODO の TDD を回して」と指示 → エージェントが外部で実行し、サーバへ **位相（red/green/refactor/verify）** とエビデンスを登録 → 一覧に即時反映。
- **プロジェクト差異への適応**: テストFW・実行環境・フォーマットは現場自由。サーバは“受け取り・正規化・配信”に専念しロックインを作らない。

## 2. 意図（Why this way）
- **SSOT を壊さない**: 真実は DB にのみ存在。ファイル（`TODO.md`, `.specify/**`）は投影物であり、サーバ経由の二相コミットで更新。
- **サーバは実行しない**: テスト Runner 起動や重処理は外部（CI/ローカル/エージェント）。サーバは **ボトルネックにならない** 設計。
- **人 → エージェント → サーバ** の一本道: 依頼（Intent）起点で作業が開始され、成果はサーバへ集約される。

---

## 3. 非目標（Non‑Goals）
- サーバによるテスト実行・CI制御・ビルドはしない。
- 特定FW/言語へのロックインはしない（プロファイルで差し替え可能）。
- 自動マージや自動実装の強制はしない（最小のアシストに留める）。

---

## 4. 役割分担（Who does what）
### MCP Server（SSOT 専任）
- **やる**: データの受領・正規化（非同期ワーカー）・保存・配信、投影（`TODO.md`/`.specify/**`）。
- **やらない**: テスト Runner 起動、重い解析、外部環境の制御。

### AI エージェント（Codex CLI / Claude Code など）
- **やる**: 人の依頼を Intent として登録、要件/テストケースの**洗い出し**（会話・推論）、**生データの提出**、TDD 位相の更新、メモ/リンク添付。
- **やらない**: サーバの投影ファイルへの直接書き込み、正規化処理（サーバのワーカーに任せる）。

---

## 5. コアデータ（一元化される情報）
- **Todo**: `{id, title, state, tags[], vclock}`
- **Intent**: 依頼の記録（誰が何を頼み、何に紐付くか）
  - `intent_type: "elicitation" | "tdd_cycle"`, `todo_id`, `created_by`, `status`
- **UT Requirements**: 要件集合（原文 + 正規化）
  - `raw_markdown/json` / `canonical.assumptions[]`, `canonical.invariants[]`
- **UT TestCases**: テスト列挙（原文 + 正規化）
  - `raw_*` / `canonical.cases[] {id, ac_ref?, kind, inputs, expected}`
- **TDD Phase**: `red | green | refactor | verify`
- **Notes/Artifacts**: 任意のメモ・リンク・生レポート（URL/bytes）

> すべての更新系は `idempotency_key` と `vclock` を持ち、**冪等 + 楽観ロック**で衝突しない。

---

## 6. API（最小の契約）
### 読み取り（エージェント→サーバ）
- `todo.list({q?, tags?})` / `todo.get({id})`
- `todo.watch()`（SSE/WS） … 一覧のライブ更新

### 依頼（Intent）
- `intent.create({intent_type, todo_id, message, idempotency_key})`

### 提出（生の洗い出し結果をまず送る）
- `ut.requirements.submit({todo_id, raw_markdown|raw_json, idempotency_key})`
- `ut.testcases.submit({requirements_id, raw_markdown|raw_json, idempotency_key})`
- `note.put({todo_id, kind, text|url, idempotency_key})`

### 状態（TDD位相）
- `tdd.phase.set({todo_id, to, idempotency_key})`  … サーバは**遷移妥当性のみ**検証

> 正規化はサーバ側の **Ingestion Worker** が非同期に実施 → `requirements.updated` / `testcases.updated` を配信。

---

## 7. 代表フロー（人→エージェント→サーバ）
### 7.1 要件・テスト洗い出し（Elicitation）
1. 人: 「TODO *T-123* の**TDDができるための要件とテストケース**を洗い出して」
2. エージェント: `intent.create({intent_type:"elicitation", todo_id:"T-123"})`
3. エージェント: 会話・参照を通じて要件/ケースを作成（**原文**）
4. エージェント→サーバ: `ut.requirements.submit`, `ut.testcases.submit`
5. サーバ: 受領→正規化→保存→`requirements.updated`/`testcases.updated` を配信

### 7.2 TDD サイクル
1. 人: 「TODO *T-123* の**TDD**を回して」
2. エージェント: `intent.create({intent_type:"tdd_cycle", todo_id:"T-123"})`
3. エージェント: 外部で RED 生成・実装→GREEN・REFACTOR → 必要に応じて VERIFY
4. エージェント→サーバ: `tdd.phase.set({to:…})`、`note.put({kind:"tdd-summary", text:…})`
5. サーバ: 保存→`tdd.phase.changed` を配信→一覧に即時反映

---

## 8. 投影（Projection）
- DB → `TODO.md`, `.specify/**` への再投影は **二相コミット + 楽観ロック** で安全に実施。
- 手編集は禁止（pre-commit で検知）。

---

## 9. スケーラビリティと信頼性
- サーバは **保存・正規化・配信に限定** → CPU軽量 → 水平スケール容易。
- 正規化は **Ingestion Worker** を増やしてスケール。
- ライブ配信（`todo.watch()`）と FTS5 検索で大規模でも**即時性**を確保。

---

## 10. ガバナンス（運用ルール）
- 依頼は必ず **Intent** として残す（誰が何を依頼したかが追跡可能）。
- エージェントは **最新状態を読んでから書く**（`todo.get`→`submit`）。
- すべての更新に `idempotency_key` を付与し、重複送信を無害化。
- 直接編集・Runner 直叩きは禁止（サーバの “一元化” を崩さない）。

---

## 11. 成功指標（How we know it works）
- 依頼（Intent）→要件/テストケース→TDD位相の**遷移が時系列で追える**。
- TODO一覧が **全端末で同じ**（`todo.watch()` で即時反映）。
- 正規化の待ち時間が SLA 内（例: p95 < 3s）。
- サーバ CPU は常に低～中負荷（ボトルネックにならない）。

---

## 12. 今後の拡張（Optional）
- `requirements.diff`/`testcases.diff` の可視化（変更理由の明示）
- Webhook 連携（`requirements.updated` 等を外部へ）
- 監査ビュー（Intent↔変更↔位相のタイムライン）

