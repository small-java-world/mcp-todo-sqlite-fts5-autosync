#!/usr/bin/env bash
set -euo pipefail
mkdir -p reports/e2e
cat > reports/e2e/dummy.xml <<'XML'
<testsuite name="e2e" tests="1" failures="1">
  <testcase classname="e2e.sample" name="should_fail_red_phase">
    <failure message="RED by design">first run must fail</failure>
  </testcase>
</testsuite>
XML
echo "[run-e2e] wrote reports/e2e/dummy.xml"
