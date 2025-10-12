#!/usr/bin/env bash
set -euo pipefail
# Ensure deps & build
if command -v pnpm >/dev/null 2>&1; then
  pnpm i
  pnpm build
  pnpm run test:unit
else
  npm i
  npm run build
  npm run test:unit
fi
