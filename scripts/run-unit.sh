#!/usr/bin/env bash
set -euo pipefail
mkdir -p reports/unit
cat > reports/unit/dummy.xml <<'XML'
<testsuite name="unit" tests="1" failures="1">
  <testcase classname="unit.sample" name="should_fail_red_phase">
    <failure message="RED by design">first run must fail</failure>
  </testcase>
</testsuite>
XML
echo "[run-unit] wrote reports/unit/dummy.xml"
