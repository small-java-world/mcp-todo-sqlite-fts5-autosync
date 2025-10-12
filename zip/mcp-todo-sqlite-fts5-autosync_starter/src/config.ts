export const CONFIG = {
  port: parseInt(process.env.PORT || "8787", 10),
  token: process.env.MCP_TOKEN || "changeme",
  dataDir: process.env.DATA_DIR || "./data",
};
