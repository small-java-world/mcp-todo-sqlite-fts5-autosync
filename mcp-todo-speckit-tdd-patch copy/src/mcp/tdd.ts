/**
 * TDD ツール群（scaffold/run/captureResults/phase）
 * プロファイル駆動でランナーとレポートを扱う。まずは最小のダミー実装。
 */
import { promises as fs } from "fs";
import * as path from "path";
import { spawn } from "child_process";

type JsonRpcCtx = { log?: (...a: any[]) => void };

export function registerTddTools(register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void) {
  register("tdd.scaffold", async (params) => {
    const taskId = String(params?.task_id ?? "TASK-UNKNOWN");
    const outDir = path.join(process.cwd(), "tests", "unit");
    await fs.mkdir(outDir, { recursive: true });
    const fp = path.join(outDir, `${taskId.replace(/[^A-Za-z0-9_-]/g, "_")}_spec.sample.txt`);
    await fs.writeFile(fp, `# RED by design for ${taskId}\n- Given ...\n- When ...\n- Then ...\n`, "utf8");
    return { ok: true, generated: [fp] };
  });

  register("tdd.run", async (_params, ctx) => {
    const runners = [
      "scripts/run-unit.sh",
      "scripts/run-infra.sh",
      "scripts/run-e2e.sh",
      "scripts/run-front.sh"
    ];
    for (const r of runners) {
      await runCmd(r, [], ctx);
    }
    return { ok: true };
  });

  register("tdd.captureResults", async () => {
    const summaries: any[] = [];
    const globs = [
      ["reports/unit/dummy.xml", "junit-xml"],
      ["reports/infra/dummy.xml", "junit-xml"],
      ["reports/e2e/dummy.xml", "junit-xml"],
      ["reports/front/dummy.json", "vitest-json"]
    ] as const;
    for (const [fp, type] of globs) {
      try {
        const content = await fs.readFile(path.join(process.cwd(), fp), "utf8");
        summaries.push({ file: fp, type, size: content.length });
      } catch {}
    }
    return { ok: true, summaries };
  });

  register("tdd.phase.set", async (params) => {
    const phase = String(params?.phase ?? "");
    if (!["red", "green", "refactor", "verify"].includes(phase)) {
      throw new Error("invalid phase");
    }
    const fp = path.join(process.cwd(), "data", "phase.log");
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const line = `${new Date().toISOString()} phase=${phase}\n";
    await fs.appendFile(fp, line, "utf8");
    return { ok: true, phase };
  });
}

async function runCmd(cmd: string, args: string[], ctx?: JsonRpcCtx) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: true });
    ctx?.log?.("[run]", cmd, args.join(" "));
    p.on("exit", (code) => (code === 0 || code === 1) ? resolve() : reject(new Error(`${cmd} exit ${code}`)));
  });
}
