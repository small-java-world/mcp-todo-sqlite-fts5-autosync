/**
 * Common RPC handler logic for both WebSocket and Stdio transports
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DB } from '../utils/db.js';
import { ReviewIssuesManager } from '../utils/review-issues.js';
import { CONFIG } from '../config.js';
import { sanitizeDirName, ensureWorktreeLocally } from './utils.js';
import { broadcastChange } from './watch.js';

type Session = { id: string, worker_id: string, ts: number };
const sessions = new Map<string, Session>();

const TOKEN = process.env.MCP_TOKEN || null;

export function ok(res: any, id: number | string) {
  return { jsonrpc: '2.0', id, result: res };
}

export function err(code: number, message: string, id: number | string | null) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function requireAuth(params: any) {
  if (!TOKEN) return;
  const tok = params?.authToken || (params?.session && sessions.has(params.session) ? params.session : null);
  if (!tok) throw Object.assign(new Error('unauthorized'), { code: 401 });
  if (tok !== TOKEN && !sessions.has(tok)) throw Object.assign(new Error('unauthorized'), { code: 401 });
}

function newSession(worker_id: string) {
  const id = crypto.randomBytes(16).toString('hex');
  const s: Session = { id, worker_id, ts: Date.now() };
  sessions.set(id, s);
  return s;
}

/**
 * Create RPC handler with common logic for all transports
 */
export function createRPCHandler(
  db: DB,
  issuesManager: ReviewIssuesManager,
  additionalHandlers: Map<string, (params: any, ctx?: any) => Promise<any>>,
  onSyncExport?: () => void  // Callback to trigger shadow file export
) {
  return async function handleRPC(method: string, params: any, id: any): Promise<any> {
    try {
      switch (method) {
        case 'register': {
          if (TOKEN && params?.authToken !== TOKEN) {
            return err(401, 'unauthorized', id);
          }
          const worker_id = params?.worker_id || 'anon';
          const s = newSession(worker_id);
          return ok({ ok: true, session: s.id }, id);
        }

        case 'upsert_task': {
          requireAuth(params);
          const { id: tid, title, text, if_vclock } = params || {};
          const metaArg = params && Object.prototype.hasOwnProperty.call(params, 'meta') ? params.meta : undefined;
          if (!tid || !title || !text) {
            return err(400, 'missing_fields', id);
          }
          try {
            const vclock = db.upsertTask(String(tid), String(title), String(text), metaArg, typeof if_vclock === 'number' ? if_vclock : undefined);
            const task = db.getTask(String(tid));
            broadcastChange('task', String(tid), 'upsert', task);

            // Trigger shadow file export (best-effort, don't fail on error)
            if (onSyncExport) {
              try { onSyncExport(); } catch (e) { /* ignore */ }
            }

            return ok({ vclock }, id);
          } catch (e: any) {
            if (e.code === 409) return err(409, 'vclock_conflict', id);
            return err(500, e.message || 'error', id);
          }
        }

        case 'get_task': {
          requireAuth(params);
          const { id: tid } = params || {};
          if (!tid) return err(400, 'missing_id', id);
          const row = db.getTask(String(tid));
          if (!row) return err(404, 'not_found', id);
          if (row.archived && !params?.includeArchived) return err(404, 'not_found', id);
          const blobs = db.db.prepare(`SELECT sha256 FROM task_blobs WHERE task_id=?`).all(String(tid)).map((r: any) => r.sha256);
          return ok({ ...row, task: row, blobs }, id);
        }

        case 'list_recent': {
          requireAuth(params);
          const { limit } = params || {};
          return ok({ items: db.listRecent(limit ?? 20) }, id);
        }

        case 'search': {
          requireAuth(params);
          const { q, limit, offset, highlight } = params || {};
          if (!q) return err(400, 'missing_query', id);
          const hits = db.search(String(q), limit ?? 20, offset ?? 0, !!highlight).map((r: any) => ({
            id: r.id, title: r.title, score: r.score, snippet: r.snippet
          }));
          return ok({ hits }, id);
        }

        case 'mark_done': {
          requireAuth(params);
          const { id: tid, done, if_vclock } = params || {};
          if (typeof done !== 'boolean' || !tid) return err(400, 'missing_fields', id);
          try {
            const vclock = db.markDone(String(tid), !!done, typeof if_vclock === 'number' ? if_vclock : undefined);
            const task = db.getTask(String(tid));
            broadcastChange('task', String(tid), 'mark_done', task);

            // Trigger shadow file export
            if (onSyncExport) {
              try { onSyncExport(); } catch (e) { /* ignore */ }
            }

            return ok({ vclock }, id);
          } catch (e: any) {
            if (e.code === 404) return err(404, 'not_found', id);
            if (e.code === 409) return err(409, 'vclock_conflict', id);
            return err(500, e.message || 'error', id);
          }
        }

        case 'attach_blob': {
          requireAuth(params);
          const { id: tid, sha256, bytes_base64 } = params || {};
          if (!tid) return err(400, 'missing_task_id', id);
          if (!sha256 && !bytes_base64) return err(400, 'missing_blob', id);
          const buf = bytes_base64 ? Buffer.from(String(bytes_base64), 'base64') : null;
          const provided = typeof sha256 === 'string' ? sha256.toLowerCase() : null;
          const computed = buf ? crypto.createHash('sha256').update(buf).digest('hex') : null;
          if (buf && provided && provided !== computed) return err(400, 'bad_blob_digest', id);
          const digest = provided ?? computed;
          if (!digest) return err(400, 'bad_blob', id);
          if (buf) db.putBlob(digest, buf, buf.length);
          db.db.prepare(`INSERT OR IGNORE INTO task_blobs(task_id, sha256) VALUES (?,?)`).run(String(tid), digest);
          return ok({ sha256: digest, ok: true }, id);
        }

        case 'get_blob': {
          requireAuth(params);
          const { sha256 } = params || {};
          if (!sha256) return err(400, 'missing_sha256', id);
          const p = db.getBlobPath(String(sha256));
          if (!fs.existsSync(p)) return err(404, 'not_found', id);
          const bytes = fs.readFileSync(p);
          return ok({ bytes_base64: bytes.toString('base64'), size: bytes.length }, id);
        }

        case 'archive_task': {
          requireAuth(params);
          const { id: tid, reason } = params || {};
          if (!tid) return err(400, 'missing_id', id);
          try {
            const result = db.archiveTask(String(tid), reason);
            broadcastChange('task', String(tid), 'archive', { archived: true, reason });

            // Trigger shadow file export
            if (onSyncExport) {
              try { onSyncExport(); } catch (e) { /* ignore */ }
            }

            return ok(result, id);
          } catch (e: any) {
            return err(e.code || 500, e.message || 'error', id);
          }
        }

        case 'restore_task': {
          requireAuth(params);
          const { id: tid } = params || {};
          if (!tid) return err(400, 'missing_id', id);
          try {
            const result = db.restoreTask(String(tid));
            const task = db.getTask(String(tid));
            broadcastChange('task', String(tid), 'restore', task);

            // Trigger shadow file export
            if (onSyncExport) {
              try { onSyncExport(); } catch (e) { /* ignore */ }
            }

            return ok(result, id);
          } catch (e: any) {
            return err(e.code || 500, e.message || 'error', id);
          }
        }

        case 'list_archived': {
          requireAuth(params);
          const { limit = 20, offset = 0 } = params || {};
          try {
            return ok({ items: db.listArchived(limit, offset) }, id);
          } catch (e: any) {
            return err(e.code || 500, e.message || 'error', id);
          }
        }

        case 'importTodoMd': {
          requireAuth(params);
          const { content } = params || {};
          if (!content) return err(400, 'missing_content', id);
          try {
            const result = db.importTodoMd(content);

            // Trigger shadow file export
            if (onSyncExport) {
              try { onSyncExport(); } catch (e) { /* ignore */ }
            }

            return ok(result, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'exportTodoMd': {
          requireAuth(params);
          try {
            const markdown = db.exportTodoMd();
            return ok({ content: markdown }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'poll_changes': {
          requireAuth(params);
          const { since = 0, limit = 200 } = params || {};
          try {
            const changes = db.pollChanges(since, limit);
            return ok({ changes }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        // Review Issues APIs
        case 'create_issue': {
          requireAuth(params);
          const { task_id, review_id, title, description, priority, category, severity, due_date, tags, created_by } = params || {};
          if (!task_id || !title) return err(400, 'missing_required_fields', id);
          try {
            const result = issuesManager.createIssue({
              task_id, review_id, title, description, priority, category, severity,
              created_by: created_by || 'system', due_date, tags, status: 'open'
            });
            return ok({ issue_id: result.id, created_at: result.created_at }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'get_issue': {
          requireAuth(params);
          const { issue_id } = params || {};
          if (issue_id == null) return err(400, 'missing_issue_id', id);
          try {
            const issue = issuesManager.getIssue(issue_id);
            if (!issue) return err(404, 'issue_not_found', id);
            return ok({ issue }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'update_issue': {
          requireAuth(params);
          const { issue_id, ...updates } = params || {};
          if (issue_id == null) return err(400, 'missing_issue_id', id);
          try {
            const result = issuesManager.updateIssue(issue_id, updates);
            return ok({ ok: result.ok }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'resolve_issue': {
          requireAuth(params);
          const { issue_id, resolved_by, resolution_note } = params || {};
          if (issue_id == null || !resolved_by) return err(400, 'missing_required_fields', id);
          try {
            const result = issuesManager.resolveIssue(issue_id, resolved_by, resolution_note);
            return ok({ ok: result.ok }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'close_issue': {
          requireAuth(params);
          const { issue_id, closed_by, close_reason } = params || {};
          if (issue_id == null || !closed_by) return err(400, 'missing_required_fields', id);
          try {
            const result = issuesManager.closeIssue(issue_id, closed_by, close_reason);
            return ok({ ok: result.ok }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'add_issue_response': {
          requireAuth(params);
          const { issue_id, response_type, content, created_by, is_internal, attachment_sha256 } = params || {};
          if (issue_id == null || !response_type || !content || !created_by) return err(400, 'missing_required_fields', id);
          try {
            const result = issuesManager.addResponse({
              issue_id, response_type, content, created_by, is_internal, attachment_sha256
            });
            return ok({ response_id: result.id, created_at: result.created_at }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'get_issue_responses': {
          requireAuth(params);
          const { issue_id, include_internal = false } = params || {};
          if (issue_id == null) return err(400, 'missing_issue_id', id);
          try {
            const responses = issuesManager.getIssueResponses(issue_id, include_internal ?? true);
            return ok({ responses }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'get_issues': {
          requireAuth(params);
          const { task_id, status, priority, category, created_by, limit, offset } = params || {};
          if (!task_id) return err(400, 'missing_task_id', id);
          try {
            const issues = issuesManager.getIssuesByTask(task_id, {
              status, priority, category, created_by, limit, offset
            });
            return ok({ issues }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'search_issues': {
          requireAuth(params);
          const { q, filters, limit, offset } = params || {};
          if (!q) return err(400, 'missing_query', id);
          try {
            const issues = issuesManager.searchIssues(q, { ...filters, limit, offset });
            return ok({ issues }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'get_repo_binding': {
          requireAuth(params);
          let root = CONFIG.git.worktreeRoot;
          if (!root || !fs.existsSync(path.join(root, '.git'))) {
            if ((CONFIG as any).git.autoEnsureWorktree && CONFIG.git.branch && CONFIG.git.branch !== 'unknown') {
              const dir = sanitizeDirName(process.env.GIT_WORKTREE_NAME || CONFIG.git.branch);
              root = ensureWorktreeLocally(CONFIG.git.branch, dir, CONFIG.git.remote);
            } else {
              root = CONFIG.git.repoRoot;
            }
          }
          return ok({
            repoRoot: root,
            branch: CONFIG.git.branch,
            remote: CONFIG.git.remote,
            policy: CONFIG.git.policy,
          }, id);
        }

        case 'ensure_worktree': {
          requireAuth(params);
          const { branch, dirName } = params || {};
          if (!branch || !dirName) return err(400, 'missing_required_fields', id);
          const dir = sanitizeDirName(String(dirName));
          try {
            const root = ensureWorktreeLocally(String(branch), dir, CONFIG.git.remote);
            return ok({ repoRoot: root, branch: String(branch), remote: CONFIG.git.remote, policy: CONFIG.git.policy }, id);
          } catch (e: any) {
            return err(500, e.message || 'error', id);
          }
        }

        case 'reserve_ids': {
          requireAuth(params);
          const n = Math.max(1, Math.min(100, (params?.n ?? 1)));
          const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const ids: string[] = [];
          for (let i = 0; i < n; i++) {
            const tail = String((Date.now() % 100000) + i).padStart(3, '0');
            ids.push(`T-${ymd}-${tail}`);
          }
          return ok({ ids }, id);
        }

        case 'patch_todo_section': {
          requireAuth(params);
          const section = params?.section;
          const base_sha256 = params?.base_sha256 || '';
          const ops = params?.ops || [];

          if (!['PLAN', 'CONTRACT', 'TEST', 'TASKS'].includes(section)) {
            return err(400, 'invalid_section', id);
          }

          // @ts-ignore
          (global as any).__TODO_STATE__ = (global as any).__TODO_STATE__ || {
            vclock: 0,
            sha256: '',
            sections: new Map<string, string[]>([['PLAN', []], ['CONTRACT', []], ['TEST', []], ['TASKS', []]]),
          };

          // @ts-ignore
          const state = (global as any).__TODO_STATE__;
          if (base_sha256 && base_sha256 !== state.sha256) {
            return err(409, 'conflict', id);
          }

          const lines: string[] = (state.sections.get(section) || []).slice();
          for (const op of ops) {
            if (op.op === 'replaceLines') {
              lines.splice(op.start, op.end - op.start, ...op.text.split(/\r?\n/));
            }
          }

          if (section === 'TASKS') {
            for (const L of lines) {
              if (!/^(\s{2}){0,2}- \[( |x)\] \[T-[A-Z0-9\-]+\]/.test(L)) {
                return err(400, 'TASKS format error', id);
              }
            }
          }

          state.sections.set(section, lines);
          state.vclock += 1;
          const nextSha = crypto.createHash('sha256').update(
            ['PLAN', 'CONTRACT', 'TEST', 'TASKS'].map(s => (state.sections.get(s) || []).join('\n')).join('\n#--\n')
          ).digest('hex');
          state.sha256 = nextSha;

          db.insertChange('todo', section, 'update', state.vclock);

          return ok({ vclock: state.vclock, sha256: nextSha }, id);
        }

        // Note: todo.watch and todo.unwatch are WebSocket-specific and handled separately

        default:
          // Check for additional handlers registered by plugins
          if (additionalHandlers.has(method)) {
            const handler = additionalHandlers.get(method)!;
            const ctx = {
              log: console.log,
              broadcast: broadcastChange
            };
            const result = await handler(params, ctx);
            return ok(result, id);
          }
          return err(-32601, 'method_not_found', id);
      }
    } catch (e: any) {
      const code = e.code ?? 500;
      return err(code, e.message || 'error', id);
    }
  };
}
