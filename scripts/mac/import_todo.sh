#!/usr/bin/env bash
set -euo pipefail
IN="${1:-TODO.import.md}"
export MCP_URL="${MCP_URL:-ws://127.0.0.1:8765}"
export MCP_TOKEN="${MCP_TOKEN:-devtoken}"
node tools/import_todo.mjs "$IN"
