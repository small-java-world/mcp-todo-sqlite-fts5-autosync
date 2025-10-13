/**
 * Spec Kit ブリッジ（/speckit.* を中継）
 * 既存の JSON-RPC サーバ登録ロジックに合わせて、handler を追加してください。
 * ここでは /speckit.tasks のダミー生成のみ実行します。
 */
import { promises as fs } from "fs";
import * as path from "path";
import { DB } from "../utils/db.js";

type JsonRpcCtx = { log?: (...a: any[]) => void };

export function registerSpeckitBridge(
  register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void,
  db: DB
) {
  register("speckit.run", async (params) => {
    const cmd = String(params?.cmd ?? "").trim();
    if (!cmd.startsWith("/speckit.")) {
      throw new Error("speckit.run: cmd must start with /speckit.");
    }
    if (cmd === "/speckit.tasks") {
      const outDir = path.join(process.cwd(), ".specify", "demo");
      await fs.mkdir(outDir, { recursive: true });
      const fp = path.join(outDir, "tasks.md");
      const body = [
        "# Tasks (dummy)",
        "",
        "- [AC-1] Given X, When Y, Then Z",
        "- [AC-2] Given A, When B, Then C",
        ""
      ].join("\n");
      await fs.writeFile(fp, body, "utf8");
      // 任意の簡易インデクシング: todo_id が指定されたら Note として関連付け
      const todoId = params?.todo_id ? String(params.todo_id) : "";
      const createdBy = params?.created_by ? String(params.created_by) : undefined;
      if (todoId) {
        try {
          db.putNote({
            id: `NOTE-${Date.now()}`,
            todo_id: todoId,
            kind: "spec_tasks",
            text: undefined,
            url: fp,
            created_by: createdBy,
            idempotency_key: `idemp-${Date.now()}-${Math.random().toString(16).slice(2)}`
          });
        } catch {}
      }
      return { ok: true, generated: fp, indexed: !!todoId };
    }
    return { ok: false, note: "not-implemented" };
  });
}
