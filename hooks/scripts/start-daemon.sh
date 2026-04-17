#!/usr/bin/env bash
set -euo pipefail

PORT="${OH_MY_CURSOR_PORT:-47847}"
MCP_PORT="${OH_MY_CURSOR_MCP_PORT:-47848}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/../daemon.ts"
SIDECAR_SCRIPT="$SCRIPT_DIR/../mcp-sidecar.ts"
PID_FILE="/tmp/oh-my-cursor-daemon.pid"
MCP_PID_FILE="/tmp/oh-my-cursor-sidecar.pid"
PORT_FILE="/tmp/oh-my-cursor-daemon.port"
MCP_PORT_FILE="/tmp/oh-my-cursor-sidecar.port"
HEARTBEAT_FILE="/tmp/oh-my-cursor-heartbeat"
RESTART_COUNT_FILE="/tmp/oh-my-cursor-restart-count"
SIDECAR_RESTART_COUNT_FILE="/tmp/oh-my-cursor-sidecar-restart-count"

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
  local ts_ms
  ts_ms="$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "0")"
  if ! [[ "$ts_ms" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  local now_s ts_s
  now_s="$(date +%s)"
  ts_s=$((ts_ms / 1000))
  if (( (now_s - ts_s) < 60 )); then
    return 0
  fi
  return 1
}

wait_for_health() {
  local port="$1"
  local delays=(0.1 0.2 0.4 0.8 1.6)
  for delay in "${delays[@]}"; do
    if curl -sf "http://localhost:${port}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
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
    # Background supervisor: restarts on non-zero exit (crashes); exit 0 = graceful shutdown (e.g. /shutdown).
    nohup env DAEMON_SCRIPT="$DAEMON_SCRIPT" PID_FILE="$PID_FILE" RESTART_COUNT_FILE="$RESTART_COUNT_FILE" bash -c '
      while true; do
        rm -f "$PID_FILE"
        env -u OH_MY_CURSOR_PORT -u OH_MY_CURSOR_MCP_PORT bun run "$DAEMON_SCRIPT" >>/tmp/oh-my-cursor-daemon.log 2>&1 &
        child=$!
        wait "$child"
        ec=$?
        if [ "$ec" -eq 0 ]; then
          exit 0
        fi
        now=$(date +%s)
        printf "%s\n" "$now" >>"$RESTART_COUNT_FILE"
        cutoff=$((now - 60))
        recent=0
        while IFS= read -r line || [ -n "$line" ]; do
          [[ "$line" =~ ^[0-9]+$ ]] || continue
          if [ "$line" -ge "$cutoff" ]; then
            recent=$((recent + 1))
          fi
        done <"$RESTART_COUNT_FILE"
        if [ "$recent" -ge 5 ]; then
          echo "fatal: daemon crash loop detected (5 restarts in 60s), giving up" >&2
          exit 1
        fi
        sleep 1
      done
    ' >>/tmp/oh-my-cursor-daemon.log 2>&1 &
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
    export OH_MY_CURSOR_DAEMON_PORT="$ACTUAL_PORT"
    # Background supervisor: restarts on non-zero exit (crashes); exit 0 = graceful shutdown.
    nohup env \
      SIDECAR_SCRIPT="$SIDECAR_SCRIPT" \
      MCP_PID_FILE="$MCP_PID_FILE" \
      SIDECAR_RESTART_COUNT_FILE="$SIDECAR_RESTART_COUNT_FILE" \
      OH_MY_CURSOR_DAEMON_PORT="$ACTUAL_PORT" \
      bash -c '
      while true; do
        rm -f "$MCP_PID_FILE"
        env -u OH_MY_CURSOR_PORT -u OH_MY_CURSOR_MCP_PORT bun run "$SIDECAR_SCRIPT" >>/tmp/oh-my-cursor-sidecar.log 2>&1 &
        child=$!
        wait "$child"
        ec=$?
        if [ "$ec" -eq 0 ]; then
          exit 0
        fi
        now=$(date +%s)
        printf "%s\n" "$now" >>"$SIDECAR_RESTART_COUNT_FILE"
        cutoff=$((now - 60))
        recent=0
        while IFS= read -r line || [ -n "$line" ]; do
          [[ "$line" =~ ^[0-9]+$ ]] || continue
          if [ "$line" -ge "$cutoff" ]; then
            recent=$((recent + 1))
          fi
        done <"$SIDECAR_RESTART_COUNT_FILE"
        if [ "$recent" -ge 5 ]; then
          echo "fatal: sidecar crash loop detected (5 restarts in 60s), giving up" >&2
          exit 1
        fi
        sleep 1
      done
    ' >>/tmp/oh-my-cursor-sidecar.log 2>&1 &
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
