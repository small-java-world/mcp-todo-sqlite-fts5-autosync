# TDD 位相モデル（FSM）と不変条件

この文書は、MCP TODO Server を中心に実施する TDD の位相（phase）を有限状態機械として定義し、不変条件、禁止遷移、エラー規約を示します。

## 位相

- red: 失敗するテストが存在する状態。実装変更は禁止。テストの意図が仕様に整合していること。
- green: すべてのテストが成功。最小実装のみ。外部仕様を変えずに成立していること。
- refactor: green を維持しながら内部改善。外部仕様を変えない。
- verify: IT/E2E を実行し、非機能要件（p95、安定性、ログ、観測性）を満たす。

## 不変条件

- red→green 間で機能追加は最小限。テストの弱体化は禁止。
- refactor 中は public API の互換性とテストの緑を維持。
- verify は観測性・タイムアウト・リトライ設計を満たすまで継続。

## エラー規約（JSON-RPC）

- バリデーション: 400（invalid_request / missing_fields / invalid_section など）
- 認証: 401（unauthorized）
- 競合: 409（vclock_conflict / conflict）
- 不足前提: 412（precondition_failed 相当。if_vclock 必須違反など）
- 存在なし: 404（not_found / issue_not_found）

`tdd.phase.set` はこれらの位相遷移に準拠し、サーバはログに phase を記録すること。


