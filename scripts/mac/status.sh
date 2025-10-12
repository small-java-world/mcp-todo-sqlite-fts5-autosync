#!/usr/bin/env bash
set -euo pipefail
if [ -f .server.pid ]; then
  PID=$(cat .server.pid || echo "")
  if [ -n "$PID" ] && ps -p "$PID" >/dev/null 2>&1; then
    echo "[i] Server running (PID: $PID)"
    exit 0
  fi
fi
echo "[i] Server NOT running"
exit 1
