# 仕様書駆動TDD（Spec Kit × TODO.md 並走）対応 変更提案

**目的**: 既存の SQLite + FTS5 TODO MCP を、Spec Kit と TODO.md を並走させつつ、Claude Code / Codex CLI どちらからでも red→green→refactor→verify を複数端末で回せる“プラガブルTDD基盤”に拡張する。

## 変更サマリ
- MCP追加: `speckit.run`, `tdd.scaffold`, `tdd.run`, `tdd.captureResults`, `tdd.phase.set`, `todo.decompose`, `todo.materialize`
- DB拡張: tasks に `spec_id, story_id, ac_md, phase, last_test_status, worktree_path`
- プロファイル駆動: `.tdd/profile.yaml` で generator/runner/reports/命名規約を統一
- 二相コミット: `todo.shadow.md` → 差分適用 → `TODO.md` 置換（409処理）
- 運用ルール: DBを単一真実源、phase更新必須、トレーサ保持、runner経由の実行

## 追加エンドポイント（概要）
- **speckit.run**: `/speckit.tasks` 等を呼び `.specify/**` を生成しDBへ索引
- **tdd.scaffold**: AC→Given/When/Then 雛形（RED）を生成（FWはプロファイルで差替）
- **tdd.run**: `.tdd/profile.yaml` の runner を起動しレポートを生成
- **tdd.captureResults**: JUnit-XML / JSON を正規化し DB の `last_test_status` 更新
- **tdd.phase.set**: `red|green|refactor|verify` を TODOメタ＋DBに反映
- **todo.decompose / materialize**: 小粒化＋worktree/ブランチ準備

## .tdd/profile.yaml（例）
```yaml
version: 1
spec_source: { tasks_glob: ".specify/**/tasks.md" }
test_kinds:
  - { kind: e2e,   generator: blueprints/e2e/gwt, out_dir: tests/e2e,   runner: scripts/run-e2e.sh,  reports: { type: junit-xml,  glob: reports/e2e/**/*.xml } }
  - { kind: unit,  generator: blueprints/unit/basic, out_dir: tests/unit, runner: scripts/run-unit.sh, reports: { type: junit-xml,  glob: reports/unit/**/*.xml } }
  - { kind: infra, generator: blueprints/infra/repository, out_dir: tests/infra, runner: scripts/run-infra.sh, reports: { type: junit-xml,  glob: reports/infra/**/*.xml } }
  - { kind: front, generator: blueprints/front/contract, out_dir: tests/front, runner: scripts/run-front.sh, reports: { type: vitest-json, glob: reports/front/**/*.json } }
switches: { require_on_verify: [e2e, unit] }
conventions: { branch_format: "feature/{spec_id}-{story_id}-{kind}", file_naming: "{spec_id}_{story_id}_{ac_index}_{kind}.{ext}" }
```

## SOP（端末非依存）
1. 人: TODO.md と関連ファイルを作成
2. MCP: `todo.decompose` → `todo.materialize`
3. MCP: `speckit.run "/speckit.tasks"` → `.specify/**/tasks.md`
4. MCP: `tdd.scaffold`（RED）→ `tdd.phase.set red` → `tdd.run`
5. 実装 → `tdd.run` → GREEN → `tdd.phase.set green` → refactor/verify → `pr.open`
