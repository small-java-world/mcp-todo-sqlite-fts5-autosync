/**
 * UT Requirements/TestCases API - 要件とテストケースの提出
 * サーバは生データを受領→正規化（非同期）→配信
 */
import { DB } from "../utils/db.js";
import { randomBytes } from "crypto";

type JsonRpcCtx = {
  log?: (...a: any[]) => void;
  broadcast?: (entity: string, entityId: string, op: string, data?: any) => void;
};

export function registerUtHandlers(
  register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void,
  db: DB
) {
  register("ut.requirements.submit", async (params, ctx) => {
    const todoId = String(params?.todo_id ?? "");
    const rawMarkdown = params?.raw_markdown ? String(params.raw_markdown) : undefined;
    const rawJson = params?.raw_json ? String(params.raw_json) : undefined;
    const idempotencyKey = String(params?.idempotency_key ?? "");

    // Validate required fields
    if (!todoId) {
      return { ok: false, error: "todo_id is required" };
    }

    if (!rawMarkdown && !rawJson) {
      return { ok: false, error: "either raw_markdown or raw_json is required" };
    }

    if (!idempotencyKey) {
      return { ok: false, error: "idempotency_key is required" };
    }

    // Generate requirements ID
    const requirementsId = `REQ-${Date.now()}-${randomBytes(4).toString("hex")}`;

    try {
      const result = db.submitRequirements({
        id: requirementsId,
        todo_id: todoId,
        raw_markdown: rawMarkdown,
        raw_json: rawJson,
        idempotency_key: idempotencyKey
      });

      if (result.ok && result.requirements_id) {
        const requirements = db.getRequirements(result.requirements_id);
        ctx?.broadcast?.('ut_requirements', result.requirements_id, 'submit', requirements);
      }

      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("ut.requirements.get", async (params) => {
    const id = params?.id ? String(params.id) : undefined;
    const todoId = params?.todo_id ? String(params.todo_id) : undefined;

    if (!id && !todoId) {
      return { ok: false, error: "either id or todo_id is required" };
    }

    try {
      let requirements;
      if (id) {
        requirements = db.getRequirements(id);
      } else if (todoId) {
        requirements = db.getRequirementsByTodoId(todoId);
      }

      if (!requirements) {
        return { ok: false, error: "requirements_not_found" };
      }

      return { ok: true, requirements };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("ut.testcases.submit", async (params, ctx) => {
    const requirementsId = String(params?.requirements_id ?? "");
    const todoId = params?.todo_id ? String(params.todo_id) : undefined;
    const rawMarkdown = params?.raw_markdown ? String(params.raw_markdown) : undefined;
    const rawJson = params?.raw_json ? String(params.raw_json) : undefined;
    const idempotencyKey = String(params?.idempotency_key ?? "");

    // Validate required fields
    if (!requirementsId) {
      return { ok: false, error: "requirements_id is required" };
    }

    if (!rawMarkdown && !rawJson) {
      return { ok: false, error: "either raw_markdown or raw_json is required" };
    }

    if (!idempotencyKey) {
      return { ok: false, error: "idempotency_key is required" };
    }

    // If todo_id not provided, get it from requirements
    let finalTodoId: string = todoId || "";
    if (!finalTodoId) {
      const requirements = db.getRequirements(requirementsId);
      if (!requirements) {
        return { ok: false, error: "requirements_not_found" };
      }
      finalTodoId = requirements.todo_id;
    }

    if (!finalTodoId) {
      return { ok: false, error: "todo_id is required" };
    }

    // Generate testcases ID
    const testcasesId = `TC-${Date.now()}-${randomBytes(4).toString("hex")}`;

    try {
      const result = db.submitTestCases({
        id: testcasesId,
        requirements_id: requirementsId,
        todo_id: finalTodoId,
        raw_markdown: rawMarkdown,
        raw_json: rawJson,
        idempotency_key: idempotencyKey
      });

      if (result.ok && result.testcases_id) {
        const testcases = db.getTestCases(result.testcases_id);
        ctx?.broadcast?.('ut_testcases', result.testcases_id, 'submit', testcases);
      }

      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("ut.testcases.get", async (params) => {
    const id = params?.id ? String(params.id) : undefined;
    const requirementsId = params?.requirements_id ? String(params.requirements_id) : undefined;
    const todoId = params?.todo_id ? String(params.todo_id) : undefined;

    if (!id && !requirementsId && !todoId) {
      return { ok: false, error: "either id, requirements_id, or todo_id is required" };
    }

    try {
      let testcases;
      if (id) {
        testcases = db.getTestCases(id);
      } else if (requirementsId) {
        testcases = db.getTestCasesByRequirementsId(requirementsId);
      } else if (todoId) {
        testcases = db.getTestCasesByTodoId(todoId);
      }

      if (!testcases) {
        return { ok: false, error: "testcases_not_found" };
      }

      return { ok: true, testcases };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}
