# レビュー指摘・クローズ・対応機能 設計書

## 1. データベーススキーマ

### 1.1 レビュー指摘テーブル (review_issues)

```sql
CREATE TABLE IF NOT EXISTS review_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  review_id INTEGER, -- 関連するレビュー（NULL可）
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'resolved', 'closed'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  category TEXT, -- 'security', 'performance', 'bug', 'style', 'logic', 'documentation'
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  closed_at INTEGER,
  closed_by TEXT,
  due_date INTEGER, -- 対応期限
  tags TEXT, -- JSON配列として保存
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (review_id) REFERENCES reviews(id)
);
```

### 1.2 指摘対応テーブル (issue_responses)

```sql
CREATE TABLE IF NOT EXISTS issue_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  response_type TEXT NOT NULL, -- 'comment', 'fix', 'rejection', 'question', 'clarification'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT 0, -- 内部メモかどうか
  attachment_sha256 TEXT, -- 添付ファイルのSHA256
  FOREIGN KEY (issue_id) REFERENCES review_issues(id)
);
```

### 1.3 指摘関連テーブル (issue_relations)

```sql
CREATE TABLE IF NOT EXISTS issue_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_issue_id INTEGER NOT NULL,
  target_issue_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL, -- 'duplicate', 'related', 'blocks', 'blocked_by'
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (source_issue_id) REFERENCES review_issues(id),
  FOREIGN KEY (target_issue_id) REFERENCES review_issues(id),
  UNIQUE(source_issue_id, target_issue_id, relation_type)
);
```

## 2. API設計

### 2.1 指摘管理API

#### create_issue
```json
{
  "method": "create_issue",
  "params": {
    "task_id": "T-123",
    "review_id": 1, // optional
    "title": "Security vulnerability in authentication",
    "description": "The authentication logic has a potential SQL injection vulnerability...",
    "priority": "high",
    "category": "security",
    "severity": "critical",
    "due_date": "2025-02-15T00:00:00Z",
    "tags": ["security", "authentication", "sql-injection"]
  }
}
```

#### update_issue
```json
{
  "method": "update_issue",
  "params": {
    "issue_id": 1,
    "title": "Updated title",
    "description": "Updated description",
    "priority": "medium",
    "status": "open",
    "due_date": "2025-02-20T00:00:00Z",
    "tags": ["updated", "tag"]
  }
}
```

#### resolve_issue
```json
{
  "method": "resolve_issue",
  "params": {
    "issue_id": 1,
    "resolution_note": "Fixed authentication logic with parameterized queries",
    "resolved_by": "developer1"
  }
}
```

#### close_issue
```json
{
  "method": "close_issue",
  "params": {
    "issue_id": 1,
    "close_reason": "verified_fix",
    "closed_by": "reviewer1"
  }
}
```

### 2.2 対応管理API

#### add_issue_response
```json
{
  "method": "add_issue_response",
  "params": {
    "issue_id": 1,
    "response_type": "fix",
    "content": "Implemented parameterized queries to prevent SQL injection",
    "is_internal": false,
    "attachment_sha256": "abc123..."
  }
}
```

#### get_issue_responses
```json
{
  "method": "get_issue_responses",
  "params": {
    "issue_id": 1,
    "include_internal": false
  }
}
```

### 2.3 検索・一覧API

#### get_issues
```json
{
  "method": "get_issues",
  "params": {
    "task_id": "T-123",
    "status": ["open", "resolved"],
    "priority": ["high", "critical"],
    "category": "security",
    "assigned_to": "developer1",
    "created_by": "reviewer1",
    "limit": 20,
    "offset": 0
  }
}
```

#### search_issues
```json
{
  "method": "search_issues",
  "params": {
    "q": "authentication security",
    "filters": {
      "status": ["open"],
      "priority": ["high", "critical"],
      "category": "security"
    },
    "limit": 20,
    "offset": 0
  }
}
```

## 3. TODO.mdでの表現

### 3.1 Issues ブロック

```markdown
## [T-123] Feature Implementation {state: IN_PROGRESS}

#### Reviews
- review@2025-01-15T10:00Z by reviewer1 => REQUEST_CHANGES

#### Issues
- **Critical**: Security vulnerability in authentication
  - Status: Open
  - Priority: High
  - Category: Security
  - Created: 2025-01-15T10:05Z by reviewer1
  - Due: 2025-02-15T00:00:00Z
  - Tags: [security, authentication, sql-injection]
  - Responses:
    - 2025-01-15T14:30Z by developer1 (fix): "Implemented parameterized queries"
    - 2025-01-15T15:00Z by reviewer1 (comment): "Verified fix, looks good"
    - 2025-01-15T15:05Z by reviewer1 (resolution): "Issue resolved"

- **Medium**: Code style inconsistency
  - Status: Resolved
  - Priority: Medium
  - Category: Style
  - Created: 2025-01-15T10:10Z by reviewer1
  - Resolved: 2025-01-15T16:00Z by developer1
  - Responses:
    - 2025-01-15T16:00Z by developer1 (fix): "Applied consistent formatting"
    - 2025-01-15T16:05Z by reviewer1 (resolution): "Confirmed fix"
```

### 3.2 インポート/エクスポート対応

- `importTodoMd` で Issues ブロックを解析
- `exportTodoMd` で DB から Issues ブロックを生成
- 指摘の状態変更を Timeline に記録

## 4. 状態遷移

```
[Open] --resolve--> [Resolved] --close--> [Closed]
   |                    |
   |--reopen--> [Open]  |--reopen--> [Open]
```

### 4.1 状態説明

- **Open**: 新規作成された指摘、対応待ち
- **Resolved**: 対応済み、確認待ち
- **Closed**: 確認完了、クローズ済み

### 4.2 権限

- **作成者**: 指摘の編集、クローズ
- **対応者**: 対応の追加、解決マーク
- **レビュアー**: 全操作可能

## 5. 通知・イベント

### 5.1 イベントタイプ

- `issue_created`: 指摘作成
- `issue_updated`: 指摘更新
- `issue_resolved`: 指摘解決
- `issue_closed`: 指摘クローズ
- `issue_reopened`: 指摘再オープン
- `response_added`: 対応追加

### 5.2 WebSocket通知

```json
{
  "type": "task_event",
  "event": "issue_created",
  "task_id": "T-123",
  "issue_id": 1,
  "data": {
    "title": "Security vulnerability",
    "priority": "high",
    "created_by": "reviewer1"
  }
}
```

## 6. 実装優先順位

1. **Phase 1**: 基本テーブルとCRUD API
2. **Phase 2**: TODO.md インポート/エクスポート
3. **Phase 3**: 関連機能（通知、検索）
4. **Phase 4**: 高度な機能（関連付け、統計）
