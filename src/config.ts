export const CONFIG = {
  port: parseInt(process.env.PORT || "8787", 10),
  token: process.env.MCP_TOKEN || "changeme",
  dataDir: process.env.DATA_DIR || "./data",
  git: {
    // 既定: プロジェクトルート直下に worktrees/ を掘ってworktreeを作る運用
    repoRoot: process.env.GIT_REPO_ROOT || process.cwd(),
    worktreesDir: process.env.GIT_WORKTREES_DIR || "worktrees",
    worktreeRoot: process.env.GIT_WORKTREE_ROOT || "", // 明示指定があれば優先（任意）
    autoEnsureWorktree: (process.env.GIT_AUTO_ENSURE_WORKTREE || "true") === "true",
    branch: process.env.GIT_BRANCH || "unknown",
    remote: process.env.GIT_REMOTE || "origin",
    policy: {
      commitOnWrite: (process.env.GIT_COMMIT_ON_WRITE || "true") === "true",
      safeGlobs: (process.env.GIT_SAFE_GLOBS || "docs/**,src/**,.github/**").split(","),
      messageTemplate: process.env.GIT_COMMIT_TEMPLATE || "chore(todos): {summary}\n\nRefs: {taskIds}\n\n{signoff}",
      signoff: (process.env.GIT_SIGNOFF || "true") === "true",
    },
    // 追加: 生成を許可するブランチ接頭辞（セキュリティ用 allowlist）
    allowedBranchPrefixes: (process.env.GIT_ALLOWED_BRANCH_PREFIXES || "feat/,fix/,chore/,refactor/").split(","),
  }
};
