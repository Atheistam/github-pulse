#!/bin/bash
# GitHub Pulse — one-shot refresh: pull latest complete GH Archive hour,
# rebuild snapshot + history, deploy to surge. Safe to run every 3h.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== [pulse] refresh $(date -u +%Y-%m-%dT%H:%M:%SZ) =="
node pipeline/pulse.cjs

export PATH="$HOME/.local/bin:$PATH"
# deploy via local CNAME (github-pulse.surge.sh)
surge site publish 2>&1 | tail -4 || {
  echo "!! 'surge site publish' failed — retrying with explicit domain"
  surge site github-pulse.surge.sh 2>&1 | tail -4
}
# verify the deployment is actually live
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://github-pulse.surge.sh/)
echo "== [pulse] live check: HTTP $CODE =="
echo "== [pulse] done =="
