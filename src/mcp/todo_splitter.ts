/**
 * TODO.md をタスクに分解するためのユーティティです。
 * - todo.decompose({from, policy?})  -> tasklets/*.json を生成
 * - todo.materialize({tasklet_id})   -> branch/worktree を生成（実際の動作は擬似API）
 */
import { promises as fs } from "fs";
import * as path from "path";

type JsonRpcCtx = { log?: (...a: any[]) => void };

function resolveTaskletsDir(): string {
  const configured = process.env.TASKLETS_DIR;
  const base = configured && configured.trim().length > 0 ? configured.trim() : "tasklets";
  const resolved = path.isAbsolute(base) ? base : path.join(process.cwd(), base);
  
  // ディレクトリが存在しない場合は作成
  try {
    const fsSync = require('fs');
    fsSync.mkdirSync(resolved, { recursive: true });
  } catch (error) {
    console.warn(`Failed to create tasklets directory: ${resolved}`, error);
  }
  
  return resolved;
}

export function registerTodoSplitter(
  register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void
) {
  register("todo.decompose", async (params) => {
    const from = String(params?.from ?? "TODO.md");
    const body = await readSafe(from);
    const lines = body.split(/\r?\n/).filter((l) => l.trim().startsWith("- "));
    const outDir = resolveTaskletsDir();
    await fs.mkdir(outDir, { recursive: true });
    const emits: string[] = [];
    let i = 0;
    for (const l of lines) {
      const id = `TL-${String(++i).padStart(3, "0")}`;
      const obj = { id, title: l.replace(/^- /, "").trim(), conflictScore: 1 + (i % 3) };
      const fp = path.join(outDir, `${id}.json`);
      await fs.writeFile(fp, JSON.stringify(obj, null, 2), "utf8");
      emits.push(fp);
    }
    return { ok: true, emits };
  });

  register("todo.materialize", async (params) => {
    const id = String(params?.tasklet_id ?? "");
    if (!id) throw new Error("tasklet_id required");
    const branch = `feature/${id}`;
    const fp = path.join(process.cwd(), "data", "materialized.log");
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.appendFile(fp, `${new Date().toISOString()} ${id} -> ${branch}\n`, "utf8");
    return { ok: true, branch };
  });
}

async function readSafe(fp: string) {
  try {
    return await fs.readFile(fp, "utf8");
  } catch {
    return "";
  }
}
