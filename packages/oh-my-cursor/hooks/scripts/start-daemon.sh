#!/usr/bin/env bash
set -euo pipefail

PORT="${OH_MY_CURSOR_PORT:-47847}"
DAEMON_SCRIPT="$(dirname "$0")/../daemon.ts"

if ! curl -s "http://localhost:${PORT}/health" >/dev/null 2>&1; then
  nohup bun run "$DAEMON_SCRIPT" >/tmp/oh-my-cursor-daemon.log 2>&1 &
  sleep 0.5
  for i in $(seq 1 10); do
    if curl -s "http://localhost:${PORT}/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
fi

input=$(cat)
curl -s -X POST "http://localhost:${PORT}/sessionStart" \
  -H 'Content-Type: application/json' \
  -d "$input"
