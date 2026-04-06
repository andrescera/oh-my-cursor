#!/usr/bin/env bash
set -euo pipefail

PORT="${OH_MY_CURSOR_PORT:-47847}"
MCP_PORT="${OH_MY_CURSOR_MCP_PORT:-47848}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/../daemon.ts"
SIDECAR_SCRIPT="$SCRIPT_DIR/../mcp-sidecar.ts"

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

if ! curl -s "http://localhost:${MCP_PORT}/health" >/dev/null 2>&1; then
  if [ -f "$SIDECAR_SCRIPT" ]; then
    nohup bun run "$SIDECAR_SCRIPT" >/tmp/oh-my-cursor-sidecar.log 2>&1 &
  fi
fi

input=$(cat)
curl -s -X POST "http://localhost:${PORT}/sessionStart" \
  -H 'Content-Type: application/json' \
  -d "$input"
