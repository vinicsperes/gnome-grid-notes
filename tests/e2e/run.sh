#!/usr/bin/env bash
# Runs the end-to-end tests, each file in its own fresh shell.
set -euo pipefail
cd "$(dirname "$0")/../.."
status=0
for file in tests/e2e/*.e2e.js; do
    [[ $# -gt 0 && $file != *"$1"* ]] && continue
    echo "== $file"
    tools/headless.sh --data tests/fixtures bash -c \
        'sleep 3; node --test --test-reporter=spec "$0"' "$file" || status=1
done
exit $status
