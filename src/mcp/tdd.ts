/**
 * TDD ツール群（scaffold/run/captureResults/phase）
 * プロファイル駆動でランナーとレポートを扱う。まずは最小のダミー実装。
 */
import { promises as fs } from "fs";
import * as path from "path";
import { DB } from "../utils/db.js";

type JsonRpcCtx = { log?: (...a: any[]) => void };

export function registerTddTools(
  register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void,
  db: DB
) {
  register("tdd.scaffold", async (params) => {
    const taskId = String(params?.task_id ?? "TASK-UNKNOWN");
    const specId = String(params?.spec_id ?? "");
    const storyId = String(params?.story_id ?? "");
    const acMd = String(params?.ac_md ?? "");

    const outDir = path.join(process.cwd(), "tests", "unit");
    await fs.mkdir(outDir, { recursive: true });
    // 強化サニタイズ（パス区切りや危険文字を除去）
    const safeId = taskId
      .replace(/[\\/]/g, "_")
      .replace(/[<>|;]/g, "_")
      .replace(/[^A-Za-z0-9_-]/g, "_");
    const fp = path.join(outDir, `${safeId}_spec.sample.txt`);

    let content = `# RED by design for ${taskId}\n`;
    if (specId) content += `# Spec: ${specId}\n`;
    if (storyId) content += `# Story: ${storyId}\n`;
    if (acMd) content += `\n${acMd}\n\n`;
    content += `- Given ...\n- When ...\n- Then ...\n`;

    await fs.writeFile(fp, content, "utf8");

    // Update task in database with TDD fields
    try {
      const task = db.getTask(taskId);
      if (task) {
        db.upsertTask(taskId, task.title, task.text, undefined, task.vclock, {
          spec_id: specId || task.spec_id,
          story_id: storyId || task.story_id,
          ac_md: acMd || task.ac_md,
          phase: "red" // Start with RED phase
        });
      }
    } catch (e) {
      console.warn(`Failed to update task ${taskId}:`, e);
    }

    return { ok: true, generated: [fp], task_id: taskId };
  });

  register("tdd.captureResults", async (params) => {
    const taskId = String(params?.task_id ?? "");
    const summaries: any[] = [];
    const globs = [
      ["reports/unit/dummy.xml", "junit-xml"],
      ["reports/infra/dummy.xml", "junit-xml"],
      ["reports/e2e/dummy.xml", "junit-xml"],
      ["reports/front/dummy.json", "vitest-json"]
    ] as const;

    let overallStatus = "pass";
    for (const [fp, type] of globs) {
      try {
        const content = await fs.readFile(path.join(process.cwd(), fp), "utf8");
        summaries.push({ file: fp, type, size: content.length });

        // Simple status detection from dummy XML
        if (content.includes("failure") || content.includes("error")) {
          overallStatus = "fail";
        }
      } catch {}
    }

    // Update task test status if task_id provided
    if (taskId && taskId !== "") {
      try {
        const task = db.getTask(taskId);
        if (task) {
          db.upsertTask(taskId, task.title, task.text, undefined, task.vclock, {
            last_test_status: overallStatus
          });
        }
      } catch (e) {
        console.warn(`Failed to update task ${taskId} test status:`, e);
      }
    }

    return { ok: true, summaries, status: overallStatus, task_id: taskId };
  });

  register("tdd.phase.set", async (params) => {
    const taskId = String(params?.task_id ?? "");
    const phase = String(params?.phase ?? "");
    if (!["red", "green", "refactor", "verify"].includes(phase)) {
      throw new Error("invalid phase");
    }

    // Log phase change to file
    const fp = path.join(process.cwd(), "data", "phase.log");
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const line = `${new Date().toISOString()} task=${taskId} phase=${phase}\n`;
    await fs.appendFile(fp, line, "utf8");

    // Update task in database if task_id provided
    if (taskId && taskId !== "") {
      try {
        const task = db.getTask(taskId);
        if (task) {
          db.upsertTask(taskId, task.title, task.text, undefined, task.vclock, {
            phase: phase
          });
        }
      } catch (e) {
        console.warn(`Failed to update task ${taskId} phase:`, e);
      }
    }

    return { ok: true, phase, task_id: taskId };
  });
}
