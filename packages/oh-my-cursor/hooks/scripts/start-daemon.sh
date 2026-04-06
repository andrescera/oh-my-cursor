#!/usr/bin/env bash
set -euo pipefail

PORT="${OH_MY_CURSOR_PORT:-47847}"
MCP_PORT="${OH_MY_CURSOR_MCP_PORT:-47848}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/../daemon.ts"
SIDECAR_SCRIPT="$SCRIPT_DIR/../mcp-sidecar.ts"
PID_FILE="/tmp/oh-my-cursor-daemon.pid"

wait_for_health() {
  local port="$1"
  local delay=0.1
  local elapsed=0
  local max=5
  while (( $(echo "$elapsed < $max" | bc -l) )); do
    if curl -s "http://localhost:${port}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
    elapsed=$(echo "$elapsed + $delay" | bc -l)
    delay=$(echo "$delay * 2" | bc -l)
  done
  return 1
}

if ! curl -s "http://localhost:${PORT}/health" >/dev/null 2>&1; then
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    wait_for_health "$PORT" || echo "warning: daemon process alive but health check failed" >&2
  else
    nohup bun run "$DAEMON_SCRIPT" >/tmp/oh-my-cursor-daemon.log 2>&1 &
    if ! wait_for_health "$PORT"; then
      echo "error: daemon failed to start within timeout — check /tmp/oh-my-cursor-daemon.log" >&2
    fi
  fi
fi

if ! curl -s "http://localhost:${MCP_PORT}/health" >/dev/null 2>&1; then
  if [ -f "$SIDECAR_SCRIPT" ]; then
    nohup bun run "$SIDECAR_SCRIPT" >/tmp/oh-my-cursor-sidecar.log 2>&1 &
    if ! wait_for_health "$MCP_PORT"; then
      echo "warning: MCP sidecar failed to start within timeout — check /tmp/oh-my-cursor-sidecar.log" >&2
    fi
  fi
fi

input=$(cat)
curl -s -X POST "http://localhost:${PORT}/sessionStart" \
  -H 'Content-Type: application/json' \
  -d "$input"
