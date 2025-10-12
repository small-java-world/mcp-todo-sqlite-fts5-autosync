#!/usr/bin/env bash
set -euo pipefail
if [ -f .server.pid ]; then
  PID=$(cat .server.pid || echo "")
  if [ -n "$PID" ]; then
    echo "[i] Stopping server (PID: $PID)"
    kill "$PID" || true
    rm -f .server.pid
    exit 0
  fi
fi
echo "[i] No running server found"
