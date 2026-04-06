#!/usr/bin/env bash
set -euo pipefail

ROUTE="${1:?usage: ensure-daemon.sh /route}"
PORT="${OH_MY_CURSOR_PORT:-47847}"
PORT_FILE="/tmp/oh-my-cursor-daemon.port"
HEARTBEAT_FILE="/tmp/oh-my-cursor-heartbeat"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

input=$(cat)

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
  [ -f "$HEARTBEAT_FILE" ] || return 1
  local ts
  ts="$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "0")"
  [[ "$ts" =~ ^[0-9]+$ ]] || return 1
  local now_ms
  now_ms="$(date +%s%3N 2>/dev/null || echo "0")"
  (( (now_ms - ts) < 60000 ))
}

ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"

daemon_alive=false
if is_heartbeat_fresh; then
  daemon_alive=true
elif curl -s --max-time 2 "http://localhost:${ACTUAL_PORT}/health" >/dev/null 2>&1; then
  daemon_alive=true
fi

if ! $daemon_alive; then
  echo '{}' | bash "$SCRIPT_DIR/start-daemon.sh" >/dev/null 2>&1 || true
  ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"
fi

curl -s -X POST "http://localhost:${ACTUAL_PORT}${ROUTE}" \
  -H 'Content-Type: application/json' \
  -d "$input" 2>/dev/null || echo '{}'
