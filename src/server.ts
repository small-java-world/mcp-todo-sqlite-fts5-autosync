
import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bonjour from 'bonjour-service';
import stringify from 'fast-json-stable-stringify';
import { DB } from './utils/db.js';

const PORT = parseInt(process.env.PORT || '8765', 10);
const TOKEN = process.env.MCP_TOKEN || null; // optional shared token
const AUTO_EXPORT_ON_EXIT = (process.env.AUTO_EXPORT_ON_EXIT || '1') === '1';
const EXPORT_DIR = process.env.EXPORT_DIR || path.join('data','snapshots');
const SHADOW_PATH = process.env.SHADOW_PATH || path.join('data','shadow','TODO.shadow.md');

const db = new DB('data', 'todo.db', path.join('data','cas'));
fs.mkdirSync(EXPORT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(SHADOW_PATH), { recursive: true });

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

function ok(res: any, id: number | string) { return { jsonrpc: '2.0', id, result: res }; }
function err(code: number, message: string, id: number | string | null) { return { jsonrpc: '2.0', id, error: { code, message } }; }

function requireAuth(params: any) {
  if (!TOKEN) return;
  const tok = params?.authToken || params?.session && sessions.get(params.session)?.id; // allow session reuse
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
  ws.on('message', (buf) => {
    let msg: any;
    try { msg = JSON.parse(buf.toString()); }
    catch (e) { ws.send(stringify(err(-32700,'parse_error', null))); return; }

    const { id, method, params } = msg || {};
    if (!method) { ws.send(stringify(err(-32600,'invalid_request', id ?? null))); return; }

    const send = (obj: any) => ws.send(stringify(obj));

    try {
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
          const { id: tid, title, text, meta, if_vclock } = params || {};
          if (!tid || !title || !text) { send(err(400,'missing_fields', id)); break; }
          try {
            const vclock = db.upsertTask(String(tid), String(title), String(text), meta ?? null, typeof if_vclock==='number'?if_vclock:undefined);
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
          send(ok({ task: row, blobs }, id));
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
          const digest = sha256 || (buf ? crypto.createHash('sha256').update(buf).digest('hex') : null);
          if (!digest) { send(err(400,'bad_blob', id)); break; }
          if (buf) db.putBlob(digest, buf, buf.length);
          // link
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
  try { send(ok(db.archiveTask(String(tid), reason), id)); }
  catch (e: any) { send(err(e.code||500, e.message||'error', id)); }
  break;
}
case 'restore_task': {
  requireAuth(params);
  const { id: tid } = params || {};
  if (!tid) { send(err(400,'missing_id', id)); break; }
  try { send(ok(db.restoreTask(String(tid)), id)); }
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
        default:
          send(err(-32601,'method_not_found', id));
      }
    } catch (e: any) {
      const code = e.code ?? 500;
      send(err(code, e.message || 'error', id));
    }
  });
  ws.on('close', () => {
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
