#!/usr/bin/env bash
set -euo pipefail
export MCP_TOKEN=${MCP_TOKEN:-testtoken}
# Build once
if command -v pnpm >/dev/null 2>&1; then
  pnpm i
  pnpm build
  pnpm run test:integration
else
  npm i
  npm run build
  npm run test:integration
fi
