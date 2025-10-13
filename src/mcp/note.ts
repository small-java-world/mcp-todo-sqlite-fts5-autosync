/**
 * Note API - メモやアーティファクトの添付
 */
import { DB } from "../utils/db.js";
import { randomBytes } from "crypto";

type JsonRpcCtx = {
  log?: (...a: any[]) => void;
  broadcast?: (entity: string, entityId: string, op: string, data?: any) => void;
};

export function registerNoteHandlers(
  register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void,
  db: DB
) {
  register("note.put", async (params, ctx) => {
    const todoId = String(params?.todo_id ?? "");
    const kind = String(params?.kind ?? "");
    const text = params?.text ? String(params.text) : undefined;
    const url = params?.url ? String(params.url) : undefined;
    const createdBy = params?.created_by ? String(params.created_by) : undefined;
    const idempotencyKey = String(params?.idempotency_key ?? "");

    // Validate required fields
    if (!todoId) {
      return { ok: false, error: "todo_id is required" };
    }

    if (!kind) {
      return { ok: false, error: "kind is required" };
    }

    if (!text && !url) {
      return { ok: false, error: "either text or url is required" };
    }

    if (!idempotencyKey) {
      return { ok: false, error: "idempotency_key is required" };
    }

    // Generate note ID
    const noteId = `NOTE-${Date.now()}-${randomBytes(4).toString("hex")}`;

    try {
      const result = db.putNote({
        id: noteId,
        todo_id: todoId,
        kind,
        text,
        url,
        created_by: createdBy,
        idempotency_key: idempotencyKey
      });

      if (result.ok && result.note_id) {
        const note = db.getNote(result.note_id);
        ctx?.broadcast?.('note', result.note_id, 'put', note);
      }

      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("note.get", async (params) => {
    const id = String(params?.id ?? "");

    if (!id) {
      return { ok: false, error: "id is required" };
    }

    try {
      const note = db.getNote(id);
      if (!note) {
        return { ok: false, error: "note_not_found" };
      }

      return { ok: true, note };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("note.list", async (params) => {
    const todoId = params?.todo_id ? String(params.todo_id) : undefined;
    const kind = params?.kind ? String(params.kind) : undefined;

    try {
      const notes = db.listNotes(todoId, kind);
      return { ok: true, notes };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}
