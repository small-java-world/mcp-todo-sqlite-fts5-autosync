// レビュー指摘API用のサーバー拡張
import { ReviewIssuesManager } from './utils/review-issues.js';

export function addIssuesApiHandlers(handlers: Map<string, Function>, db: any) {
  const issuesManager = new ReviewIssuesManager(db.db);

  // create_issue
  handlers.set('create_issue', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { task_id, review_id, title, description, priority = 'medium', category, severity = 'medium', due_date, tags } = params || {};
      
      if (!task_id || !title) {
        send(err(400, 'missing_required_fields', id));
        return;
      }

      const result = issuesManager.createIssue({
        task_id,
        review_id,
        title,
        description,
        status: 'open',
        priority,
        category,
        severity,
        created_by: params.created_by || 'system',
        due_date: due_date ? new Date(due_date).getTime() : undefined,
        tags
      });

      send(ok({ issue_id: result.id, created_at: result.created_at }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // update_issue
  handlers.set('update_issue', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { issue_id, ...updates } = params || {};
      
      if (!issue_id) {
        send(err(400, 'missing_issue_id', id));
        return;
      }

      const result = issuesManager.updateIssue(issue_id, updates);
      send(ok({ ok: result.ok }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // resolve_issue
  handlers.set('resolve_issue', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { issue_id, resolved_by, resolution_note } = params || {};
      
      if (!issue_id || !resolved_by) {
        send(err(400, 'missing_required_fields', id));
        return;
      }

      const result = issuesManager.resolveIssue(issue_id, resolved_by, resolution_note);
      send(ok({ ok: result.ok }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // close_issue
  handlers.set('close_issue', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { issue_id, closed_by, close_reason } = params || {};
      
      if (!issue_id || !closed_by) {
        send(err(400, 'missing_required_fields', id));
        return;
      }

      const result = issuesManager.closeIssue(issue_id, closed_by, close_reason);
      send(ok({ ok: result.ok }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // add_issue_response
  handlers.set('add_issue_response', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { issue_id, response_type, content, created_by, is_internal = false, attachment_sha256 } = params || {};
      
      if (!issue_id || !response_type || !content || !created_by) {
        send(err(400, 'missing_required_fields', id));
        return;
      }

      const result = issuesManager.addResponse({
        issue_id,
        response_type,
        content,
        created_by,
        is_internal,
        attachment_sha256
      });

      send(ok({ response_id: result.id, created_at: result.created_at }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // get_issue
  handlers.set('get_issue', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { issue_id } = params || {};
      
      if (!issue_id) {
        send(err(400, 'missing_issue_id', id));
        return;
      }

      const issue = issuesManager.getIssue(issue_id);
      if (!issue) {
        send(err(404, 'issue_not_found', id));
        return;
      }

      send(ok({ issue }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // get_issues
  handlers.set('get_issues', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { task_id, status, priority, category, created_by, limit = 20, offset = 0 } = params || {};
      
      if (!task_id) {
        send(err(400, 'missing_task_id', id));
        return;
      }

      const issues = issuesManager.getIssuesByTask(task_id, {
        status,
        priority,
        category,
        created_by,
        limit,
        offset
      });

      send(ok({ issues }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // get_issue_responses
  handlers.set('get_issue_responses', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { issue_id, include_internal = false } = params || {};
      
      if (!issue_id) {
        send(err(400, 'missing_issue_id', id));
        return;
      }

      const responses = issuesManager.getIssueResponses(issue_id, include_internal);
      send(ok({ responses }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });

  // search_issues
  handlers.set('search_issues', (params: any, send: Function, err: Function, ok: Function, id: any) => {
    try {
      const { q, filters = {}, limit = 20, offset = 0 } = params || {};
      
      if (!q) {
        send(err(400, 'missing_query', id));
        return;
      }

      const issues = issuesManager.searchIssues(q, {
        ...filters,
        limit,
        offset
      });

      send(ok({ issues }, id));
    } catch (e: any) {
      send(err(500, e.message || 'error', id));
    }
  });
}
