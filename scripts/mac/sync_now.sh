#!/usr/bin/env bash
set -euo pipefail
export MCP_URL="${MCP_URL:-ws://127.0.0.1:8765}"
export MCP_TOKEN="${MCP_TOKEN:-devtoken}"
node tools/rpc.mjs server_sync_export "{}"
