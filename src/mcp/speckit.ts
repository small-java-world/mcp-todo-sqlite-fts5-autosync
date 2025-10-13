/**
 * Spec Kit ブリッジ（/speckit.* を中継）
 * 既存の JSON-RPC サーバ登録ロジックに合わせて、handler を追加してください。
 * ここでは /speckit.tasks のダミー生成のみ実行します。
 */
import { promises as fs } from "fs";
import * as path from "path";

type JsonRpcCtx = { log?: (...a: any[]) => void };

export function registerSpeckitBridge(register: (method: string, handler: (params: any, ctx?: JsonRpcCtx) => Promise<any>) => void) {
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
      return { ok: true, generated: fp };
    }
    return { ok: false, note: "not-implemented" };
  });
}
