#!/usr/bin/env bash
set -euo pipefail

SESSION_KEY="${1:-}"
STATUS="${2:-idle}"

if [[ -z "$SESSION_KEY" ]]; then
  echo "Usage: $0 <sessionKey> [status]"
  exit 1
fi

npx convex run agents:heartbeat "{
  \"sessionKey\": \"${SESSION_KEY}\",
  \"status\": \"${STATUS}\"
}"
