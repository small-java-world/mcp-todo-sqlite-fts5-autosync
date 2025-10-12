#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-TODO.export.md}"
export MCP_URL="${MCP_URL:-ws://127.0.0.1:8765}"
export MCP_TOKEN="${MCP_TOKEN:-devtoken}"
node tools/export_todo.mjs "$OUT"
