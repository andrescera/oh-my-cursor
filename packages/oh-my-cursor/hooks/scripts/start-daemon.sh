#!/usr/bin/env bash
set -euo pipefail

PORT="${OH_MY_CURSOR_PORT:-47847}"
MCP_PORT="${OH_MY_CURSOR_MCP_PORT:-47848}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/../daemon.ts"
SIDECAR_SCRIPT="$SCRIPT_DIR/../mcp-sidecar.ts"
PID_FILE="/tmp/oh-my-cursor-daemon.pid"
PORT_FILE="/tmp/oh-my-cursor-daemon.port"
MCP_PORT_FILE="/tmp/oh-my-cursor-sidecar.port"
HEARTBEAT_FILE="/tmp/oh-my-cursor-heartbeat"

read_port_file() {
  local file="$1"
  local default="$2"
  if [ -f "$file" ]; then
    local port
    port="$(cat "$file" 2>/dev/null || echo "")"
    if [[ "$port" =~ ^[0-9]+$ ]]; then
      echo "$port"
      return
    fi
  fi
  echo "$default"
}

is_heartbeat_fresh() {
  if [ ! -f "$HEARTBEAT_FILE" ]; then
    return 1
  fi
  local ts
  ts="$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "0")"
  if ! [[ "$ts" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  local now_ms
  now_ms="$(date +%s%3N 2>/dev/null || echo "0")"
  local age_ms=$(( now_ms - ts ))
  if (( age_ms < 60000 )); then
    return 0
  fi
  return 1
}

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

ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"

daemon_alive=false
if is_heartbeat_fresh; then
  daemon_alive=true
elif curl -s "http://localhost:${ACTUAL_PORT}/health" >/dev/null 2>&1; then
  daemon_alive=true
fi

if ! $daemon_alive; then
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    wait_for_health "$ACTUAL_PORT" || echo "warning: daemon process alive but health check failed" >&2
  else
    nohup bun run "$DAEMON_SCRIPT" >/tmp/oh-my-cursor-daemon.log 2>&1 &
    if ! wait_for_health "$PORT"; then
      ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"
      if ! wait_for_health "$ACTUAL_PORT"; then
        echo "error: daemon failed to start within timeout — check /tmp/oh-my-cursor-daemon.log" >&2
      fi
    fi
    ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"
  fi
fi

ACTUAL_MCP_PORT="$(read_port_file "$MCP_PORT_FILE" "$MCP_PORT")"

if ! curl -s "http://localhost:${ACTUAL_MCP_PORT}/health" >/dev/null 2>&1; then
  if [ -f "$SIDECAR_SCRIPT" ]; then
    nohup bun run "$SIDECAR_SCRIPT" >/tmp/oh-my-cursor-sidecar.log 2>&1 &
    if ! wait_for_health "$MCP_PORT"; then
      ACTUAL_MCP_PORT="$(read_port_file "$MCP_PORT_FILE" "$MCP_PORT")"
      if ! wait_for_health "$ACTUAL_MCP_PORT"; then
        echo "warning: MCP sidecar failed to start within timeout — check /tmp/oh-my-cursor-sidecar.log" >&2
      fi
    fi
  fi
fi

input=$(cat)
curl -s -X POST "http://localhost:${ACTUAL_PORT}/sessionStart" \
  -H 'Content-Type: application/json' \
  -d "$input"
