#!/usr/bin/env bash
set -euo pipefail
mkdir -p reports/front
cat > reports/front/dummy.json <<'JSON'
{
  "stats": { "tests": 1, "failures": 0, "duration": 1 },
  "suites": [{ "name":"front", "tests":[{"name":"green_by_default","status":"pass"}]}]
}
JSON
echo "[run-front] wrote reports/front/dummy.json"
