#!/bin/bash
# GitHub Pulse — one-shot refresh: pull latest complete GH Archive hour,
# rebuild snapshot + history, deploy to surge. Safe to run every 3h.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== [pulse] refresh $(date -u +%Y-%m-%dT%H:%M:%SZ) =="
node pipeline/pulse.cjs

export PATH="$HOME/.local/bin:$PATH"
TOKEN=$(surge token 2>/dev/null | tr -d '[:space:]')
if [ -z "$TOKEN" ]; then
  echo "!! no surge token — skipping deploy"
  exit 1
fi
echo "$TOKEN" > "$HOME/.hermes/surge_token"
SURGE_LOGIN=roguepulse@emalupe.com SURGE_TOKEN="$TOKEN" surge site site 2>&1 | tail -4
echo "== [pulse] done =="
