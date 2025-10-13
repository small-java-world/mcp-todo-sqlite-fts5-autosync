/**
 * Intent API - 依頼の記録（誰が何を頼み、何に紐付くか）
 * intent_type: "elicitation" | "tdd_cycle"
 */
import { DB } from "../utils/db.js";
import { randomBytes } from "crypto";

type JsonRpcCtx = {
  log?: (...a: any[]) => void;
  broadcast?: (entity: string, entityId: string, op: string, data?: any) => void;
};

export function registerIntentHandlers(
  register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void,
  db: DB
) {
  register("intent.create", async (params, ctx) => {
    const intentType = String(params?.intent_type ?? "");
    const todoId = String(params?.todo_id ?? "");
    const message = params?.message ? String(params.message) : undefined;
    const createdBy = params?.created_by ? String(params.created_by) : undefined;
    const idempotencyKey = String(params?.idempotency_key ?? "");

    // Validate required fields
    if (!intentType) {
      return { ok: false, error: "intent_type is required" };
    }

    if (!["elicitation", "tdd_cycle"].includes(intentType)) {
      return { ok: false, error: "invalid intent_type. Must be 'elicitation' or 'tdd_cycle'" };
    }

    if (!todoId) {
      return { ok: false, error: "todo_id is required" };
    }

    if (!idempotencyKey) {
      return { ok: false, error: "idempotency_key is required" };
    }

    // Generate intent ID
    const intentId = `INTENT-${Date.now()}-${randomBytes(4).toString("hex")}`;

    try {
      const result = db.createIntent({
        id: intentId,
        intent_type: intentType,
        todo_id: todoId,
        message,
        created_by: createdBy,
        idempotency_key: idempotencyKey
      });

      if (result.ok && result.intent_id) {
        const intent = db.getIntent(result.intent_id);
        ctx?.broadcast?.('intent', result.intent_id, 'create', intent);
      }

      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("intent.get", async (params) => {
    const id = String(params?.id ?? "");

    if (!id) {
      return { ok: false, error: "id is required" };
    }

    try {
      const intent = db.getIntent(id);
      if (!intent) {
        return { ok: false, error: "intent_not_found" };
      }

      return { ok: true, intent };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("intent.list", async (params) => {
    const todoId = params?.todo_id ? String(params.todo_id) : undefined;
    const status = params?.status ? String(params.status) : undefined;

    try {
      const intents = db.listIntents(todoId, status);
      return { ok: true, intents };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("intent.complete", async (params, ctx) => {
    const id = String(params?.id ?? "");

    if (!id) {
      return { ok: false, error: "id is required" };
    }

    try {
      const intent = db.getIntent(id);
      if (!intent) {
        return { ok: false, error: "intent_not_found" };
      }

      const result = db.completeIntent(id);
      const updatedIntent = db.getIntent(id);
      ctx?.broadcast?.('intent', id, 'complete', updatedIntent);
      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}
