/**
 * Projection API - DB → Filesystem (TODO.md, .specify/**)
 */
import { DB } from "../utils/db.js";

type JsonRpcCtx = {
  log?: (...a: any[]) => void;
  broadcast?: (entity: string, entityId: string, op: string, data?: any) => void;
};

export function registerProjectionHandlers(
  register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void,
  db: DB
) {
  register("projection.requirements", async (params) => {
    const todoId = String(params?.todo_id ?? "");
    const specifyDir = String(params?.specify_dir ?? ".specify");

    if (!todoId) {
      return { ok: false, error: "todo_id is required" };
    }

    try {
      const result = db.projectRequirements(todoId, specifyDir);
      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("projection.testcases", async (params) => {
    const todoId = String(params?.todo_id ?? "");
    const specifyDir = String(params?.specify_dir ?? ".specify");

    if (!todoId) {
      return { ok: false, error: "todo_id is required" };
    }

    try {
      const result = db.projectTestCases(todoId, specifyDir);
      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });

  register("projection.all", async (params) => {
    const outputDir = String(params?.output_dir ?? ".");
    const specifyDir = String(params?.specify_dir ?? ".specify");

    try {
      const result = db.projectAll(outputDir, specifyDir);
      return result;
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  });
}
