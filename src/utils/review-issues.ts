import Database from 'better-sqlite3';

export interface ReviewIssue {
  id?: number;
  task_id: string;
  review_id?: number;
  title: string;
  description?: string;
  status: 'open' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: number;
  created_by: string;
  resolved_at?: number;
  resolved_by?: string;
  closed_at?: number;
  closed_by?: string;
  due_date?: number;
  tags?: string[];
}

export interface IssueResponse {
  id?: number;
  issue_id: number;
  response_type: 'comment' | 'fix' | 'rejection' | 'question' | 'clarification';
  content: string;
  created_at: number;
  created_by: string;
  is_internal: boolean;
  attachment_sha256?: string;
}

export class ReviewIssuesManager {
  constructor(private db: any) {}

  // 指摘作成
  createIssue(issue: Omit<ReviewIssue, 'id' | 'created_at'>): { id: number; created_at: number } {
    const now = Date.now();
    const tags = issue.tags ? JSON.stringify(issue.tags) : null;
    
    const stmt = this.db.prepare(`
      INSERT INTO review_issues (
        task_id, review_id, title, description, status, priority, category, severity,
        created_at, created_by, due_date, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      issue.task_id,
      issue.review_id || null,
      issue.title,
      issue.description || null,
      issue.status || 'open',
      issue.priority,
      issue.category || null,
      issue.severity,
      now,
      issue.created_by,
      issue.due_date || null,
      tags
    );
    
    return { id: result.lastInsertRowid as number, created_at: now };
  }

  // 指摘更新
  updateIssue(issueId: number, updates: Partial<ReviewIssue>): { ok: boolean } {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.severity !== undefined) {
      fields.push('severity = ?');
      values.push(updates.severity);
    }
    if (updates.due_date !== undefined) {
      fields.push('due_date = ?');
      values.push(updates.due_date);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(updates.tags ? JSON.stringify(updates.tags) : null);
    }
    
    if (fields.length === 0) {
      return { ok: true };
    }
    
    const stmt = this.db.prepare(`
      UPDATE review_issues SET ${fields.join(', ')} WHERE id = ?
    `);
    
    const result = stmt.run(...values, issueId);
    return { ok: result.changes > 0 };
  }

  // 指摘解決
  resolveIssue(issueId: number, resolvedBy: string, resolutionNote?: string): { ok: boolean } {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE review_issues 
      SET status = 'resolved', resolved_at = ?, resolved_by = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(now, resolvedBy, issueId);
    
    if (result.changes > 0 && resolutionNote) {
      this.addResponse({
        issue_id: issueId,
        response_type: 'fix',
        content: resolutionNote,
        created_by: resolvedBy,
        is_internal: false
      });
    }
    
    return { ok: result.changes > 0 };
  }

  // 指摘クローズ
  closeIssue(issueId: number, closedBy: string, closeReason?: string): { ok: boolean } {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      UPDATE review_issues 
      SET status = 'closed', closed_at = ?, closed_by = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(now, closedBy, issueId);
    
    if (result.changes > 0 && closeReason) {
      this.addResponse({
        issue_id: issueId,
        response_type: 'comment',
        content: closeReason,
        created_by: closedBy,
        is_internal: false
      });
    }
    
    return { ok: result.changes > 0 };
  }

  // 対応追加
  addResponse(response: Omit<IssueResponse, 'id' | 'created_at'>): { id: number; created_at: number } {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO issue_responses (
        issue_id, response_type, content, created_at, created_by, is_internal, attachment_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      response.issue_id,
      response.response_type,
      response.content,
      now,
      response.created_by,
      response.is_internal ? 1 : 0,
      response.attachment_sha256 || null
    );
    
    return { id: result.lastInsertRowid as number, created_at: now };
  }

  // 指摘取得
  getIssue(issueId: number): ReviewIssue | null {
    const stmt = this.db.prepare(`
      SELECT * FROM review_issues WHERE id = ?
    `);
    
    const row = stmt.get(issueId) as any;
    if (!row) return null;
    
    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    };
  }

  // タスクの指摘一覧取得
  getIssuesByTask(taskId: string, filters?: {
    status?: string[];
    priority?: string[];
    category?: string;
    created_by?: string;
    limit?: number;
    offset?: number;
  }): ReviewIssue[] {
    let query = 'SELECT * FROM review_issues WHERE task_id = ?';
    const params: any[] = [taskId];
    
    if (filters?.status && filters.status.length > 0) {
      query += ' AND status IN (' + filters.status.map(() => '?').join(',') + ')';
      params.push(...filters.status);
    }
    
    if (filters?.priority && filters.priority.length > 0) {
      query += ' AND priority IN (' + filters.priority.map(() => '?').join(',') + ')';
      params.push(...filters.priority);
    }
    
    if (filters?.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    
    if (filters?.created_by) {
      query += ' AND created_by = ?';
      params.push(filters.created_by);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    }));
  }

  // 指摘の対応一覧取得
  getIssueResponses(issueId: number, includeInternal: boolean = false): IssueResponse[] {
    let query = 'SELECT * FROM issue_responses WHERE issue_id = ?';
    const params: any[] = [issueId];
    
    if (!includeInternal) {
      query += ' AND is_internal = 0';
    }
    
    query += ' ORDER BY created_at ASC';
    
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      ...row,
      is_internal: row.is_internal === 1
    }));
  }

  // 指摘検索
  searchIssues(query: string, filters?: {
    status?: string[];
    priority?: string[];
    category?: string;
    limit?: number;
    offset?: number;
  }): ReviewIssue[] {
    let sql = `
      SELECT * FROM review_issues 
      WHERE (title LIKE ? OR description LIKE ?)
    `;
    const params: any[] = [`%${query}%`, `%${query}%`];
    
    if (filters?.status && filters.status.length > 0) {
      sql += ' AND status IN (' + filters.status.map(() => '?').join(',') + ')';
      params.push(...filters.status);
    }
    
    if (filters?.priority && filters.priority.length > 0) {
      sql += ' AND priority IN (' + filters.priority.map(() => '?').join(',') + ')';
      params.push(...filters.priority);
    }
    
    if (filters?.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    if (filters?.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : []
    }));
  }
}
