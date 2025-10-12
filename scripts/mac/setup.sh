#!/usr/bin/env bash
set -euo pipefail

# Detect package manager for Node if missing (optional hint only)
if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js not found. Install Node.js (e.g., brew install node) and re-run."
  exit 1
fi

# Prefer pnpm if available, otherwise npm
PKG=pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  PKG=npm
fi

echo "[i] Installing dependencies with $PKG ..."
if [ "$PKG" = "pnpm" ]; then
  pnpm i
else
  npm i
fi

echo "[i] Building TypeScript ..."
if [ "$PKG" = "pnpm" ]; then
  pnpm run build
else
  npx tsc -p tsconfig.json
fi

echo "[i] Setup done. Use ./scripts/mac/start.sh to launch the server."
