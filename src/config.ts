export const CONFIG = {
  port: parseInt(process.env.PORT || "8787", 10),
  token: process.env.MCP_TOKEN || "changeme",
  dataDir: process.env.DATA_DIR || "./data",
  git: {
    worktreeRoot: process.env.GIT_WORKTREE_ROOT || process.cwd(),
    branch: process.env.GIT_BRANCH || "unknown",
    remote: process.env.GIT_REMOTE || "origin",
    policy: {
      commitOnWrite: (process.env.GIT_COMMIT_ON_WRITE || "true") === "true",
      safeGlobs: (process.env.GIT_SAFE_GLOBS || "docs/**,src/**,.github/**").split(","),
      messageTemplate: process.env.GIT_COMMIT_TEMPLATE || "chore(todos): {summary}\n\nRefs: {taskIds}\n\n{signoff}",
      signoff: (process.env.GIT_SIGNOFF || "true") === "true",
    }
  }
};
