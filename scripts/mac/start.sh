#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8765}"
MCP_TOKEN="${MCP_TOKEN:-devtoken}"

echo "[i] Starting MCP server on ws://0.0.0.0:${PORT} (token: ${MCP_TOKEN})"
export MCP_TOKEN PORT
node dist/server.js &

PID=$!
echo $PID > .server.pid

# Show LAN IPs
echo "[i] Possible LAN URLs:"
if command -v ipconfig >/dev/null 2>&1; then
  ipconfig getifaddr en0 >/dev/null 2>&1 && echo "  - ws://$(ipconfig getifaddr en0):${PORT}" || true
  ipconfig getifaddr en1 >/dev/null 2>&1 && echo "  - ws://$(ipconfig getifaddr en1):${PORT}" || true
fi
echo "  - ws://127.0.0.1:${PORT}"
echo "[i] PID saved to .server.pid"
