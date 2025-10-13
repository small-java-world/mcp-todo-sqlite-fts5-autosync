
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bonjour from 'bonjour-service';
import stringify from 'fast-json-stable-stringify';
import { DB } from './utils/db.js';
import { ReviewIssuesManager } from './utils/review-issues.js';
import { CONFIG } from './config.js';
import { registerSpeckitBridge } from './mcp/speckit.js';
import { registerTddTools } from './mcp/tdd.js';
import { registerTodoSplitter } from './mcp/todo_splitter.js';
import { registerIntentHandlers } from './mcp/intent.js';
import { registerUtHandlers } from './mcp/ut.js';
import { registerNoteHandlers } from './mcp/note.js';
import { registerProjectionHandlers } from './mcp/projection.js';
import { sanitizeDirName, ensureWorktreeLocally } from './server/utils.js';
import { watchers, broadcastChange, type WatchSubscription } from './server/watch.js';

const PORT = parseInt(process.env.PORT || '8765', 10);
const TOKEN = process.env.MCP_TOKEN || null; // optional shared token
const AUTO_EXPORT_ON_EXIT = (process.env.AUTO_EXPORT_ON_EXIT || '1') === '1';

const DATA_DIR = path.resolve(CONFIG.dataDir || 'data');
const resolveWithinData = (raw: string | undefined, segments: string[]): string => {
  if (!raw || !raw.trim()) {
    return path.join(DATA_DIR, ...segments);
  }
  return path.isAbsolute(raw) ? raw : path.join(DATA_DIR, raw);
};
const DB_FILE = process.env.DB_FILE || 'todo.db';
const CAS_DIR = resolveWithinData(process.env.CAS_DIR, ['cas']);
const EXPORT_DIR = resolveWithinData(process.env.EXPORT_DIR, ['snapshots']);
const SHADOW_PATH = resolveWithinData(process.env.SHADOW_PATH, ['shadow', 'TODO.shadow.md']);

const db = new DB(DATA_DIR, DB_FILE, CAS_DIR);
const issuesManager = new ReviewIssuesManager(db.db);
fs.mkdirSync(EXPORT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(SHADOW_PATH), { recursive: true });

// Register TDD/Speckit handlers
const additionalHandlers = new Map<string, (params: any, ctx?: any) => Promise<any>>();
const registerHandler = (method: string, handler: (params: any, ctx?: any) => Promise<any>) => {
  additionalHandlers.set(method, handler);
};

registerSpeckitBridge(registerHandler, db);
registerTddTools(registerHandler, db);
registerTodoSplitter(registerHandler);
registerIntentHandlers(registerHandler, db);
registerUtHandlers(registerHandler, db);
registerNoteHandlers(registerHandler, db);
registerProjectionHandlers(registerHandler, db);

// mDNS advertise (optional)
try {
  const b = new bonjour();
  b.publish({ name: 'mcp-hub', type: 'ws', protocol: 'tcp', port: PORT, txt: { kind: 'todo-sqlite-fts5' } });
  console.log('[mDNS] published _ws._tcp mcp-hub');
} catch (e) {
  console.warn('[mDNS] disabled or failed:', (e as Error).message);
}

type Session = { id: string, worker_id: string, ts: number };
const sessions = new Map<string, Session>();

// watchers moved to ./server/watch

function ok(res: any, id: number | string) { return { jsonrpc: '2.0', id, result: res }; }
function err(code: number, message: string, id: number | string | null) { return { jsonrpc: '2.0', id, error: { code, message } }; }

// Broadcast change events to watchers
// broadcastChange moved to ./server/watch

function requireAuth(params: any) {
  if (!TOKEN) return;
  const tok = params?.authToken || (params?.session && sessions.has(params.session) ? params.session : null); // allow session reuse
  if (!tok) throw Object.assign(new Error('unauthorized'), { code: 401 });
  if (tok !== TOKEN && !sessions.has(tok)) throw Object.assign(new Error('unauthorized'), { code: 401 });
}

function newSession(worker_id: string) {
  const id = crypto.randomBytes(16).toString('hex');
  const s: Session = { id, worker_id, ts: Date.now() };
  sessions.set(id, s);
  return s;
}

// Safe export: write markdown to shadow file and timestamped snapshot; never overwrite TODO.md directly.
function performServerSyncExport(): { shadow: string, snapshot: string } {
  const md = db.exportTodoMd();
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g,'-');
  const snapFile = path.join(EXPORT_DIR, `TODO.autosave-${ts}.md`);
  // atomic-ish write: write temp then rename
  const tempShadow = SHADOW_PATH + '.tmp';
  fs.writeFileSync(tempShadow, md, 'utf-8');
  fs.renameSync(tempShadow, SHADOW_PATH);
  fs.writeFileSync(snapFile, md, 'utf-8');
  console.log(`[autosync] exported to shadow=${SHADOW_PATH}, snapshot=${snapFile}`);
  return { shadow: SHADOW_PATH, snapshot: snapFile };
}

const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });
wss.on('connection', (ws, req) => {
  console.log('[ws] client connected from', req.socket.remoteAddress);

  // Track watchers for this connection
  const connectionWatchers = new Set<WatchSubscription>();

  // core handler map (段階的移行用)
  const coreHandlers = new Map<string, (params: any, id: any) => Promise<void>>([
    ['list_recent', async (params, id) => {
      requireAuth(params);
      const { limit } = params || {};
      ws.send(stringify(ok({ items: db.listRecent(limit??20) }, id)));
    }],
    ['get_blob', async (params, id) => {
      requireAuth(params);
      const { sha256 } = params || {};
      if (!sha256) { ws.send(stringify(err(400,'missing_sha256', id))); return; }
      const p = db.getBlobPath(String(sha256));
      if (!fs.existsSync(p)) { ws.send(stringify(err(404,'not_found', id))); return; }
      const bytes = fs.readFileSync(p);
      ws.send(stringify(ok({ bytes_base64: bytes.toString('base64'), size: bytes.length }, id)));
    }],
    ['get_task', async (params, id) => {
      requireAuth(params);
      const { id: tid } = params || {};
      if (!tid) { ws.send(stringify(err(400,'missing_id', id))); return; }
      const row = db.getTask(String(tid));
      if (!row) { ws.send(stringify(err(404,'not_found', id))); return; }
      if (row.archived && !params?.includeArchived) { ws.send(stringify(err(404,'not_found', id))); return; }
      const blobs = db.db.prepare(`SELECT sha256 FROM task_blobs WHERE task_id=?`).all(String(tid)).map((r:any)=>r.sha256);
      ws.send(stringify(ok({ ...row, task: row, blobs }, id)));
    }],
    ['upsert_task', async (params, id) => {
      requireAuth(params);
      const { id: tid, title, text, if_vclock } = params || {};
      const metaArg = params && Object.prototype.hasOwnProperty.call(params, 'meta') ? params.meta : undefined;
      if (!tid || !title || !text) { ws.send(stringify(err(400,'missing_fields', id))); return; }
      try {
        const vclock = db.upsertTask(String(tid), String(title), String(text), metaArg, typeof if_vclock==='number' ? if_vclock : undefined);
        const task = db.getTask(String(tid));
        broadcastChange('task', String(tid), 'upsert', task);
        ws.send(stringify(ok({ vclock }, id)));
      } catch (e: any) {
        if (e.code === 409) ws.send(stringify(err(409, 'vclock_conflict', id)));
        else ws.send(stringify(err(500, e.message || 'error', id)));
      }
    }],
    ['mark_done', async (params, id) => {
      requireAuth(params);
      const { id: tid, done, if_vclock } = params || {};
      if (typeof done !== 'boolean' || !tid) { ws.send(stringify(err(400,'missing_fields', id))); return; }
      try {
        const vclock = db.markDone(String(tid), !!done, typeof if_vclock==='number'?if_vclock:undefined);
        const task = db.getTask(String(tid));
        broadcastChange('task', String(tid), 'mark_done', task);
        ws.send(stringify(ok({ vclock }, id)));
      } catch (e: any) {
        if (e.code === 404) ws.send(stringify(err(404,'not_found', id)));
        else if (e.code === 409) ws.send(stringify(err(409,'vclock_conflict', id)));
        else ws.send(stringify(err(500, e.message || 'error', id)));
      }
    }],
    ['attach_blob', async (params, id) => {
      requireAuth(params);
      const { id: tid, sha256, bytes_base64 } = params || {};
      if (!tid) { ws.send(stringify(err(400,'missing_task_id', id))); return; }
      if (!sha256 && !bytes_base64) { ws.send(stringify(err(400,'missing_blob', id))); return; }
      const buf = bytes_base64 ? Buffer.from(String(bytes_base64), 'base64') : null;
      const provided = typeof sha256 === 'string' ? sha256.toLowerCase() : null;
      const computed = buf ? crypto.createHash('sha256').update(buf).digest('hex') : null;
      if (buf && provided && provided !== computed) { ws.send(stringify(err(400,'bad_blob_digest', id))); return; }
      const digest = provided ?? computed;
      if (!digest) { ws.send(stringify(err(400,'bad_blob', id))); return; }
      if (buf) db.putBlob(digest, buf, buf.length);
      db.db.prepare(`INSERT OR IGNORE INTO task_blobs(task_id, sha256) VALUES (?,?)`).run(String(tid), digest);
      ws.send(stringify(ok({ sha256: digest, ok: true }, id)));
    }],
  ]);

  ws.on('message', (buf) => {
    let msg: any;
    try { msg = JSON.parse(buf.toString()); }
    catch (e) { ws.send(stringify(err(-32700,'parse_error', null))); return; }

    const { id, method, params } = msg || {};
    if (!method) { ws.send(stringify(err(-32600,'invalid_request', id ?? null))); return; }

    const send = (obj: any) => ws.send(stringify(obj));

    try {
      // まずハンドラマップ経由のディスパッチを試行
      if (coreHandlers.has(method)) {
        coreHandlers.get(method)!(params, id).catch((e:any)=>{
          const code = e?.code || 500; ws.send(stringify(err(code, e?.message||'error', id)));
        });
        return;
      }
      switch (method) {
        case 'register': {
          if (TOKEN && params?.authToken !== TOKEN) { send(err(401,'unauthorized', id)); break; }
          const worker_id = params?.worker_id || 'anon';
          const s = newSession(worker_id);
          send(ok({ ok: true, session: s.id }, id));
          break;
        }
        case 'upsert_task': {
          requireAuth(params);
          const { id: tid, title, text, if_vclock } = params || {};
          const metaArg = params && Object.prototype.hasOwnProperty.call(params, 'meta') ? params.meta : undefined;
          if (!tid || !title || !text) { send(err(400,'missing_fields', id)); break; }
          try {
            const vclock = db.upsertTask(String(tid), String(title), String(text), metaArg, typeof if_vclock==='number' ? if_vclock : undefined);
            const task = db.getTask(String(tid));
            broadcastChange('task', String(tid), 'upsert', task);
            send(ok({ vclock }, id));
          } catch (e: any) {
            if (e.code === 409) send(err(409, 'vclock_conflict', id));
            else send(err(500, e.message || 'error', id));
          }
          break;
        }
        case 'get_task': {
          requireAuth(params);
          const { id: tid } = params || {};
          if (!tid) { send(err(400,'missing_id', id)); break; }
          const row = db.getTask(String(tid));
          if (!row) { send(err(404,'not_found', id)); break; }
          if (row.archived && !params?.includeArchived) { send(err(404,'not_found', id)); break; }
          // list blobs
          const blobs = db.db.prepare(`SELECT sha256 FROM task_blobs WHERE task_id=?`).all(String(tid)).map((r:any)=>r.sha256);
          send(ok({ ...row, task: row, blobs }, id));
          break;
        }
        case 'search': {
          requireAuth(params);
          const { q, limit, offset, highlight } = params || {};
          if (!q) { send(err(400,'missing_query', id)); break; }
          const hits = db.search(String(q), limit??20, offset??0, !!highlight).map((r:any)=>({
            id: r.id, title: r.title, score: r.score, snippet: r.snippet
          }));
          send(ok({ hits }, id));
          break;
        }
        case 'mark_done': {
          requireAuth(params);
          const { id: tid, done, if_vclock } = params || {};
          if (typeof done !== 'boolean' || !tid) { send(err(400,'missing_fields', id)); break; }
          try {
            const vclock = db.markDone(String(tid), !!done, typeof if_vclock==='number'?if_vclock:undefined);
            const task = db.getTask(String(tid));
            broadcastChange('task', String(tid), 'mark_done', task);
            send(ok({ vclock }, id));
          } catch (e: any) {
            if (e.code === 404) send(err(404,'not_found', id));
            else if (e.code === 409) send(err(409,'vclock_conflict', id));
            else send(err(500, e.message || 'error', id));
          }
          break;
        }
        case 'attach_blob': {
          requireAuth(params);
          const { id: tid, sha256, bytes_base64 } = params || {};
          if (!tid) { send(err(400,'missing_task_id', id)); break; }
          if (!sha256 && !bytes_base64) { send(err(400,'missing_blob', id)); break; }
          const buf = bytes_base64 ? Buffer.from(String(bytes_base64), 'base64') : null;
          const provided = typeof sha256 === 'string' ? sha256.toLowerCase() : null;
          const computed = buf ? crypto.createHash('sha256').update(buf).digest('hex') : null;
          if (buf && provided && provided !== computed) { send(err(400,'bad_blob_digest', id)); break; }
          const digest = provided ?? computed;
          if (!digest) { send(err(400,'bad_blob', id)); break; }
          if (buf) db.putBlob(digest, buf, buf.length);
          db.db.prepare(`INSERT OR IGNORE INTO task_blobs(task_id, sha256) VALUES (?,?)`).run(String(tid), digest);
          send(ok({ sha256: digest, ok: true }, id));
          break;
        }
        case 'get_blob': {
          requireAuth(params);
          const { sha256 } = params || {};
          if (!sha256) { send(err(400,'missing_sha256', id)); break; }
          const p = db.getBlobPath(String(sha256));
          if (!fs.existsSync(p)) { send(err(404,'not_found', id)); break; }
          const bytes = fs.readFileSync(p);
          send(ok({ bytes_base64: bytes.toString('base64'), size: bytes.length }, id));
          break;
        }
        case 'list_recent': {
          requireAuth(params);
          const { limit } = params || {};
          send(ok({ items: db.listRecent(limit??20) }, id));
          break;
        }

case 'archive_task': {
  requireAuth(params);
  const { id: tid, reason } = params || {};
  if (!tid) { send(err(400,'missing_id', id)); break; }
  try {
    const result = db.archiveTask(String(tid), reason);
    broadcastChange('task', String(tid), 'archive', { archived: true, reason });
    send(ok(result, id));
  }
  catch (e: any) { send(err(e.code||500, e.message||'error', id)); }
  break;
}
case 'restore_task': {
  requireAuth(params);
  const { id: tid } = params || {};
  if (!tid) { send(err(400,'missing_id', id)); break; }
  try {
    const result = db.restoreTask(String(tid));
    const task = db.getTask(String(tid));
    broadcastChange('task', String(tid), 'restore', task);
    send(ok(result, id));
  }
  catch (e: any) { send(err(e.code||500, e.message||'error', id)); }
  break;
}
case 'list_archived': {
  requireAuth(params);
  const { limit=20, offset=0 } = params || {};
  try { send(ok({ items: db.listArchived(limit, offset) }, id)); }
  catch (e: any) { send(err(e.code||500, e.message||'error', id)); }
  break;
}
        case 'create_issue': {
          requireAuth(params);
          const { task_id, review_id, title, description, priority, category, severity, due_date, tags, created_by } = params || {};
          if (!task_id || !title) { send(err(400,'missing_required_fields', id)); break; }
          try {
            const result = issuesManager.createIssue({
              task_id, review_id, title, description, priority, category, severity,
              created_by: created_by || 'system', due_date, tags, status: 'open'
            });
            send(ok({ issue_id: result.id, created_at: result.created_at }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'update_issue': {
          requireAuth(params);
          const { issue_id, ...updates } = params || {};
          if (!issue_id) { send(err(400,'missing_issue_id', id)); break; }
          try {
            const result = issuesManager.updateIssue(issue_id, updates);
            send(ok({ ok: result.ok }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'resolve_issue': {
          requireAuth(params);
          const { issue_id, resolved_by, resolution_note } = params || {};
          if (!issue_id || !resolved_by) { send(err(400,'missing_required_fields', id)); break; }
          try {
            const result = issuesManager.resolveIssue(issue_id, resolved_by, resolution_note);
            send(ok({ ok: result.ok }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'close_issue': {
          requireAuth(params);
          const { issue_id, closed_by, close_reason } = params || {};
          if (!issue_id || !closed_by) { send(err(400,'missing_required_fields', id)); break; }
          try {
            const result = issuesManager.closeIssue(issue_id, closed_by, close_reason);
            send(ok({ ok: result.ok }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'add_issue_response': {
          requireAuth(params);
          const { issue_id, response_type, content, created_by, is_internal, attachment_sha256 } = params || {};
          if (!issue_id || !response_type || !content || !created_by) { send(err(400,'missing_required_fields', id)); break; }
          try {
            const result = issuesManager.addResponse({
              issue_id, response_type, content, created_by, is_internal, attachment_sha256
            });
            send(ok({ response_id: result.id, created_at: result.created_at }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'get_issue': {
          requireAuth(params);
          const { issue_id } = params || {};
          if (!issue_id) { send(err(400,'missing_issue_id', id)); break; }
          try {
            const issue = issuesManager.getIssue(issue_id);
            if (!issue) { send(err(404,'issue_not_found', id)); break; }
            send(ok({ issue }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'get_issues': {
          requireAuth(params);
          const { task_id, status, priority, category, created_by, limit, offset } = params || {};
          if (!task_id) { send(err(400,'missing_task_id', id)); break; }
          try {
            const issues = issuesManager.getIssuesByTask(task_id, {
              status, priority, category, created_by, limit, offset
            });
            send(ok({ issues }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'get_issue_responses': {
          requireAuth(params);
          const { issue_id } = params || {};
          if (!issue_id) { send(err(400,'missing_issue_id', id)); break; }
          const includeInternal = params?.include_internal;
          try {
            const responses = issuesManager.getIssueResponses(issue_id, includeInternal ?? true);
            send(ok({ responses }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'search_issues': {
          requireAuth(params);
          const { q, filters, limit, offset } = params || {};
          if (!q) { send(err(400,'missing_query', id)); break; }
          try {
            const issues = issuesManager.searchIssues(q, { ...filters, limit, offset });
            send(ok({ issues }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'importTodoMd': {
          requireAuth(params);
          const { content } = params || {};
          if (!content) { send(err(400,'missing_content', id)); break; }
          try {
            const result = db.importTodoMd(content);
            send(ok(result, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'exportTodoMd': {
          requireAuth(params);
          try {
            const markdown = db.exportTodoMd();
            send(ok({ content: markdown }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'poll_changes': {
          requireAuth(params);
          const { since = 0, limit = 200 } = params || {};
          try {
            const changes = db.pollChanges(since, limit);
            send(ok({ changes }, id));
          } catch (e: any) { send(err(500, e.message || 'error', id)); }
          break;
        }
        case 'todo.watch': {
          requireAuth(params);
          const filters = params?.filters;
          const subscription: WatchSubscription = {
            ws,
            filters: filters ? {
              entity: filters.entity,
              id: filters.id
            } : undefined
          };
          watchers.add(subscription);
          connectionWatchers.add(subscription);
          send(ok({ ok: true, watching: true }, id));
          console.log(`[watch] Client subscribed, total watchers: ${watchers.size}`);
          break;
        }
        case 'todo.unwatch': {
          requireAuth(params);
          // Remove all watchers for this connection
          connectionWatchers.forEach(w => watchers.delete(w));
          connectionWatchers.clear();
          send(ok({ ok: true, watching: false }, id));
          console.log(`[watch] Client unsubscribed, total watchers: ${watchers.size}`);
          break;
        }
        case 'get_repo_binding': {
          // 既存worktreeが指定済みならそれを返す
          let root = CONFIG.git.worktreeRoot;
          // 未指定の場合は、autoEnsureWorktreeの設定に従い自動生成を試みる
          if (!root || !fs.existsSync(path.join(root, '.git'))) {
            if (CONFIG.git.autoEnsureWorktree && CONFIG.git.branch && CONFIG.git.branch !== 'unknown') {
              const dir = sanitizeDirName(process.env.GIT_WORKTREE_NAME || CONFIG.git.branch);
              root = ensureWorktreeLocally(CONFIG.git.branch, dir, CONFIG.git.remote);
            } else {
              // 自動生成しない運用では repoRoot を返す（※クライアントは ensure_worktree を明示呼び出し）
              root = CONFIG.git.repoRoot;
            }
          }
          return send(ok({
            repoRoot: root,
            branch: CONFIG.git.branch,
            remote: CONFIG.git.remote,
            policy: CONFIG.git.policy,
          }, id));
        }
        case 'reserve_ids': {
          const n = Math.max(1, Math.min(100, (params?.n ?? 1)));
          const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
          const ids: string[] = [];
          for (let i=0;i<n;i++){
            const tail = String((Date.now()%100000)+i).padStart(3,'0');
            ids.push(`T-${ymd}-${tail}`);
          }
          return send(ok({ ids }, id));
        }
        case 'patch_todo_section': {
          const section = params?.section;
          const base_sha256 = params?.base_sha256 || '';
          const ops = params?.ops || [];
          
          if (!['PLAN','CONTRACT','TEST','TASKS'].includes(section)) {
            return send(err(400, 'invalid_section', id));
          }
          
          // @ts-ignore
          global.__TODO_STATE__ = global.__TODO_STATE__ || {
            vclock: 0,
            sha256: '',
            sections: new Map<string,string[]>([['PLAN',[]],['CONTRACT',[]],['TEST',[]],['TASKS',[]]]),
          };
          
          // @ts-ignore
          const state = global.__TODO_STATE__;
          if (base_sha256 && base_sha256 !== state.sha256) {
            return send(err(409, 'conflict', id));
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
                return send(err(400, 'TASKS format error', id));
              }
            }
          }
          
          state.sections.set(section, lines);
          state.vclock += 1;
          const nextSha = crypto.createHash('sha256').update(
            ['PLAN','CONTRACT','TEST','TASKS'].map(s => (state.sections.get(s)||[]).join('\n')).join('\n#--\n')
          ).digest('hex');
          state.sha256 = nextSha;
          
          const now = Date.now();
          // 変更フィードに記録
          db.insertChange('todo', section, 'update', state.vclock);
          
          return send(ok({ vclock: state.vclock, sha256: nextSha }, id));
        }
        default:
          // Check for additional handlers registered by plugins
          if (additionalHandlers.has(method)) {
            const handler = additionalHandlers.get(method)!;
            const ctx = {
              log: console.log,
              broadcast: broadcastChange
            };
            handler(params, ctx).then(result => send(ok(result, id)))
              .catch((e: any) => send(err(e.code || 500, e.message || 'error', id)));
          } else {
            send(err(-32601,'method_not_found', id));
          }
      }
    } catch (e: any) {
      const code = e.code ?? 500;
      send(err(code, e.message || 'error', id));
    }
  });
  ws.on('close', () => {
    // Remove all watchers for this connection
    connectionWatchers.forEach(w => watchers.delete(w));
    connectionWatchers.clear();
    console.log(`[watch] Client disconnected, total watchers: ${watchers.size}`);
    // sessions are ephemeral; if needed, implement cleanup
  });
});

console.log(`[mcp] listening on ws://0.0.0.0:${PORT}`);


process.on('SIGINT', () => {
  console.log('[signal] SIGINT');
  try { if (AUTO_EXPORT_ON_EXIT) performServerSyncExport(); } catch(e) { console.warn('[autosync] failed:', (e as Error).message); }
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('[signal] SIGTERM');
  try { if (AUTO_EXPORT_ON_EXIT) performServerSyncExport(); } catch(e) { console.warn('[autosync] failed:', (e as Error).message); }
  process.exit(0);
});


