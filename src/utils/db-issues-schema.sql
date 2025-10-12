-- レビュー指摘機能用のテーブル定義

-- レビュー指摘テーブル
CREATE TABLE IF NOT EXISTS review_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  review_id INTEGER,
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

-- 指摘対応テーブル
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

-- 指摘関連テーブル
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

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_review_issues_task_id ON review_issues(task_id);
CREATE INDEX IF NOT EXISTS idx_review_issues_status ON review_issues(status);
CREATE INDEX IF NOT EXISTS idx_review_issues_priority ON review_issues(priority);
CREATE INDEX IF NOT EXISTS idx_review_issues_category ON review_issues(category);
CREATE INDEX IF NOT EXISTS idx_review_issues_created_by ON review_issues(created_by);
CREATE INDEX IF NOT EXISTS idx_review_issues_created_at ON review_issues(created_at);

CREATE INDEX IF NOT EXISTS idx_issue_responses_issue_id ON issue_responses(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_responses_created_at ON issue_responses(created_at);

CREATE INDEX IF NOT EXISTS idx_issue_relations_source ON issue_relations(source_issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_relations_target ON issue_relations(target_issue_id);
