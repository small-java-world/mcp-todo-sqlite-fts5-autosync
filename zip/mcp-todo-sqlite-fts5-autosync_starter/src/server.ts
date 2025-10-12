import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { parse, success, error } from 'jsonrpc-lite';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { CONFIG } from './config';
import { openDB } from './db';
import { now, sha256, applyPatch } from './util';
import { TaskSchema, PatchOpSchema, Task } from './types';

type Client = {
  ws: WebSocket;
  sessionId: string;
  authed: boolean;
};

const db = openDB(path.join(CONFIG.dataDir, 'app.db'));
fs.mkdirSync(path.join(CONFIG.dataDir, 'blobs'), { recursive: true });

// Prepared statements
const stmts = {
  getTask: db.prepare('SELECT * FROM tasks WHERE id = ?'),
  insertTask: db.prepare(`INSERT INTO tasks (id,title,body,state,priority,parent_id,reviewer,assignee,created_at,updated_at,archived_at,vclock,meta)
                          VALUES (@id,@title,@body,@state,@priority,@parent_id,@reviewer,@assignee,@created_at,@updated_at,@archived_at,@vclock,json(@meta))`),
  updateTask: db.prepare(`UPDATE tasks SET
                          title=@title, body=@body, state=@state, priority=@priority,
                          parent_id=@parent_id, reviewer=@reviewer, assignee=@assignee,
                          updated_at=@updated_at, archived_at=@archived_at, vclock=@vclock, meta=json(@meta)
                          WHERE id=@id`),
  archiveTask: db.prepare(`UPDATE tasks SET archived_at=@archived_at, state='archived', updated_at=@updated_at, vclock=vclock+1 WHERE id=@id`),
  restoreTask: db.prepare(`UPDATE tasks SET archived_at=NULL, state='open', updated_at=@updated_at, vclock=vclock+1 WHERE id=@id`),
  search: db.prepare(`
    SELECT t.*, bm25(tasks_fts) AS score
    FROM tasks_fts
    JOIN tasks t ON t.rowid = tasks_fts.rowid
    WHERE tasks_fts MATCH ? AND t.archived_at IS NULL
    ORDER BY score, t.created_at DESC
    LIMIT ?
  `),
  insertChange: db.prepare(`INSERT INTO changes (ts, entity, id, op, vclock) VALUES (@ts, @entity, @id, @op, @vclock)`),
  pollChanges: db.prepare(`SELECT * FROM changes WHERE seq > ? ORDER BY seq ASC LIMIT ?`),
  insertBlob: db.prepare(`INSERT INTO blobs (sha256, bytes, created_at) VALUES (?, ?, ?)
                          ON CONFLICT(sha256) DO NOTHING`),
  linkBlob: db.prepare(`INSERT INTO task_blobs (task_id, sha256) VALUES (?, ?)
                        ON CONFLICT(task_id, sha256) DO NOTHING`),
};

function publishChange(ev: any) {
  for (const c of clients) {
    if (c.authed) {
      try {
        c.ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'change', params: ev }));
      } catch {}
    }
  }
}

function upsertTask(task: Task, if_vclock: number | null) {
  const nowMs = now();
  const existing = stmts.getTask.get(task.id) as any;
  if (!existing) {
    const row = {
      ...task,
      created_at: (task as any).created_at ?? nowMs,
      updated_at: nowMs,
      vclock: (task as any).vclock ?? 0,
      meta: task.meta ? JSON.stringify(task.meta) : null,
    };
    stmts.insertTask.run(row);
    stmts.insertChange.run({ ts: nowMs, entity: 'task', id: task.id, op: 'insert', vclock: row.vclock });
    publishChange({ entity:'task', id:task.id, op:'insert', ts:nowMs, vclock: row.vclock });
    return { created: true, vclock: row.vclock };
  } else {
    if (if_vclock !== null && if_vclock !== undefined && if_vclock !== existing.vclock) {
      const e: any = new Error('Conflict'); e.code = 40901; throw e;
    }
    const newV = existing.vclock + 1;
    const row = {
      ...existing,
      ...task,
      updated_at: nowMs,
      vclock: newV,
      meta: task.meta ? JSON.stringify(task.meta) : existing.meta,
    };
    stmts.updateTask.run(row);
    stmts.insertChange.run({ ts: nowMs, entity: 'task', id: task.id, op: 'update', vclock: newV });
    publishChange({ entity:'task', id:task.id, op:'update', ts:nowMs, vclock:newV });
    return { created: false, vclock: newV };
  }
}

const clients = new Set<Client>();

const wss = new WebSocketServer({ port: CONFIG.port });
wss.on('connection', (ws) => {
  const c: Client = { ws, sessionId: nanoid(), authed: false };
  clients.add(c);

  ws.on('close', () => clients.delete(c));

  ws.on('message', (raw) => {
    let msg: any;
    try { msg = parse(raw.toString()); } catch {
      ws.send(JSON.stringify(error(null, { code: -32700, message: 'Parse error' }))); return;
    }
    if (msg.type !== 'request') return;

    const { id, payload } = msg;
    const { method, params } = payload as { method: string, params: any };

    const reply = (res: any) => ws.send(JSON.stringify(success(id, res)));
    const fail = (code: number, message: string, data?: any) => ws.send(JSON.stringify(error(id, { code, message, data })));

    if (!c.authed && method !== 'register') {
      return fail(40100, 'Unauthorized');
    }

    try {
      switch (method) {
        case 'register': {
          const token = (params && params.token) || '';
          if (token !== CONFIG.token) return fail(40100, 'Unauthorized');
          c.authed = true;
          return reply({ sessionId: c.sessionId });
        }
        case 'upsert_task': {
          const shape = z.object({ task: TaskSchema, if_vclock: z.number().int().nullable().optional() });
          const input = shape.parse(params);
          const res = upsertTask(input.task, input.if_vclock ?? null);
          return reply(res);
        }
        case 'patch_task': {
          const shape = z.object({
            id: z.string(),
            operations: z.array(PatchOpSchema),
            if_vclock: z.number().int().nullable().optional()
          });
          const input = shape.parse(params);
          const existing = stmts.getTask.get(input.id) as any;
          if (!existing) return fail(40400, 'Not found');
          if (input.if_vclock !== undefined && input.if_vclock !== null && input.if_vclock !== existing.vclock) {
            const e: any = new Error('Conflict'); e.code = 40901; throw e;
          }
          let merged = { ...existing };
          for (const op of input.operations) merged = applyPatch(merged, op as any);
          const res = upsertTask(merged as Task, null);
          return reply(res);
        }
        case 'search': {
          const shape = z.object({ q: z.string(), limit: z.number().int().min(1).max(200).default(50), highlight: z.boolean().default(false) });
          const input = shape.parse(params);
          const rows = (stmts.search.all(input.q, input.limit) as any[]).map(r => ({
            ...r,
            meta: r.meta ? JSON.parse(r.meta) : null,
          }));
          return reply({ rows });
        }
        case 'archive_task': {
          const shape = z.object({ id: z.string() });
          const input = shape.parse(params);
          const e = stmts.getTask.get(input.id) as any;
          if (!e) return fail(40400, 'Not found');
          const nowMs = now();
          stmts.archiveTask.run({ id: input.id, archived_at: nowMs, updated_at: nowMs });
          stmts.insertChange.run({ ts: nowMs, entity: 'task', id: input.id, op: 'archive', vclock: e.vclock+1 });
          publishChange({ entity:'task', id:input.id, op:'archive', ts:nowMs, vclock:e.vclock+1 });
          return reply({ ok: true });
        }
        case 'restore_task': {
          const shape = z.object({ id: z.string() });
          const input = shape.parse(params);
          const e = stmts.getTask.get(input.id) as any;
          if (!e) return fail(40400, 'Not found');
          const nowMs = now();
          stmts.restoreTask.run({ id: input.id, updated_at: nowMs });
          stmts.insertChange.run({ ts: nowMs, entity: 'task', id: input.id, op: 'restore', vclock: e.vclock+1 });
          publishChange({ entity:'task', id:input.id, op:'restore', ts:nowMs, vclock:e.vclock+1 });
          return reply({ ok: true });
        }
        case 'attach_blob': {
          const shape = z.object({ taskId: z.string(), base64: z.string(), sha256: z.string().length(64) });
          const input = shape.parse(params);
          const e = stmts.getTask.get(input.taskId) as any;
          if (!e) return fail(40400, 'Task not found');
          const buf = Buffer.from(input.base64, 'base64');
          const digest = sha256(buf);
          if (digest !== input.sha256) return fail(40000, 'SHA256 mismatch');
          const blobPath = path.join(CONFIG.dataDir, 'blobs', input.sha256);
          if (!fs.existsSync(blobPath)) fs.writeFileSync(blobPath, buf);
          const nowMs = now();
          stmts.insertBlob.run(input.sha256, buf.byteLength, nowMs);
          stmts.linkBlob.run(input.taskId, input.sha256);
          stmts.insertChange.run({ ts: nowMs, entity: 'blob', id: input.sha256, op: 'attach', vclock: null });
          publishChange({ entity:'blob', id:input.sha256, op:'attach', ts:nowMs });
          return reply({ ok: true, bytes: buf.byteLength });
        }
        case 'poll_changes': {
          const shape = z.object({ since: z.number().int().default(0), limit: z.number().int().min(1).max(1000).default(200) });
          const input = shape.parse(params);
          const rows = stmts.pollChanges.all(input.since, input.limit);
          return reply({ rows });
        }
        default:
          return fail(-32601, 'Method not found');
      }
    } catch (e: any) {
      const code = e?.code || 50000;
      return fail(code, e?.message || 'Internal error');
    }
  });
});

console.log(`[mcp-todo] ws://127.0.0.1:${CONFIG.port} token=${CONFIG.token}`);
