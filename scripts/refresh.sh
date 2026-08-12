#!/bin/bash
# GitHub Pulse — one-shot refresh: pull latest complete GH Archive hour,
# rebuild snapshot + history, deploy to surge. Safe to run every 3h.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== [pulse] refresh $(date -u +%Y-%m-%dT%H:%M:%SZ) =="
node pipeline/pulse.cjs
node pipeline/report.cjs

export PATH="$HOME/.local/bin:$PATH"
# Deploy via explicit env auth — surge's netrc lookup sometimes falls into
# the interactive login prompt in cron (stdin closed → deploy silently dies).
# SURGE_LOGIN/SURGE_TOKEN are read from ~/.netrc (written by `surge login`).
if [ -z "${SURGE_LOGIN:-}" ] && [ -f "$HOME/.netrc" ]; then
  SURGE_LOGIN=$(sed -n 's/^[[:space:]]*login[[:space:]]*//p' "$HOME/.netrc" | head -1)
  SURGE_TOKEN=$(sed -n 's/^[[:space:]]*password[[:space:]]*//p' "$HOME/.netrc" | head -1)
  export SURGE_LOGIN SURGE_TOKEN
fi
# publish project dir "site" to the pinned domain (CNAME)
surge site github-pulse.surge.sh 2>&1 | tail -4
# verify the deployment is actually live
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://github-pulse.surge.sh/)
echo "== [pulse] live check: HTTP $CODE =="
echo "== [pulse] done =="
