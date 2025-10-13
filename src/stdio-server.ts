#!/usr/bin/env node
/**
 * MCP Server - Stdio Transport
 * This server uses stdin/stdout for communication (suitable for Claude Code integration)
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
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
import { createRPCHandler, ok, err } from './server/rpc-handler.js';
import stringify from 'fast-json-stable-stringify';

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

// Register handlers
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

// Create RPC handler with shadow file export callback
const handleRPC = createRPCHandler(db, issuesManager, additionalHandlers, performServerSyncExport);

// Safe export function
// Lockless design: uses filesystem atomic operations (rename) for concurrent safety
function performServerSyncExport(): { shadow: string, snapshot: string } {
  try {
    // Ensure directories exist (idempotent)
    fs.mkdirSync(path.dirname(SHADOW_PATH), { recursive: true });
    fs.mkdirSync(EXPORT_DIR, { recursive: true });

    // Get latest TODO.md from DB
    const md = db.exportTodoMd();

    // Generate snapshot filename with timestamp
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const snapFile = path.join(EXPORT_DIR, `TODO.autosave-${ts}.md`);

    // Atomic write: temp file → rename (last-write-wins, no locks needed)
    const tempShadow = SHADOW_PATH + '.tmp';
    fs.writeFileSync(tempShadow, md, 'utf-8');
    fs.renameSync(tempShadow, SHADOW_PATH); // Atomic operation

    // Snapshot write (historical record, no atomicity needed)
    fs.writeFileSync(snapFile, md, 'utf-8');

    console.error(`[autosync] exported to shadow=${SHADOW_PATH}, snapshot=${snapFile}`);
    return { shadow: SHADOW_PATH, snapshot: snapFile };
  } catch (e) {
    // Log but don't fail (best-effort)
    console.error('[autosync] error:', (e as Error).message);
    throw e; // Re-throw for now, can be changed to return default values
  }
}

// Stdio interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.error('[mcp-stdio] Server started on stdio transport');

rl.on('line', async (line) => {
  let msg: any;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    console.log(stringify(err(-32700, 'parse_error', null)));
    return;
  }

  const { id, method, params } = msg || {};
  if (!method) {
    console.log(stringify(err(-32600, 'invalid_request', id ?? null)));
    return;
  }

  try {
    const response = await handleRPC(method, params, id);
    console.log(stringify(response));
  } catch (e: any) {
    const code = e.code ?? 500;
    console.log(stringify(err(code, e.message || 'error', id)));
  }
});

rl.on('close', () => {
  console.error('[mcp-stdio] stdin closed, exiting');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[signal] SIGINT');
  try {
    if (AUTO_EXPORT_ON_EXIT) performServerSyncExport();
  } catch (e) {
    console.error('[autosync] failed:', (e as Error).message);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[signal] SIGTERM');
  try {
    if (AUTO_EXPORT_ON_EXIT) performServerSyncExport();
  } catch (e) {
    console.error('[autosync] failed:', (e as Error).message);
  }
  process.exit(0);
});
