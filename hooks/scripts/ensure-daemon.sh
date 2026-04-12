#!/usr/bin/env bash
set -euo pipefail

ROUTE="${1:?usage: ensure-daemon.sh /route}"
PORT="${OH_MY_CURSOR_PORT:-47847}"
PORT_FILE="/tmp/oh-my-cursor-daemon.port"
HEARTBEAT_FILE="/tmp/oh-my-cursor-heartbeat"
PID_FILE="/tmp/oh-my-cursor-daemon.pid"
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
  stale_killed=false
  if [ -f "$PID_FILE" ]; then
    stale_pid="$(cat "$PID_FILE" 2>/dev/null || echo "")"
    if [[ "$stale_pid" =~ ^[0-9]+$ ]] && kill -0 "$stale_pid" 2>/dev/null; then
      kill "$stale_pid" 2>/dev/null || true
      stale_killed=true
    fi
    rm -f "$PID_FILE"
  fi
  if $stale_killed; then
    # Existing supervisor will restart the daemon; avoid spawning a second supervisor.
    for _ in {1..20}; do
      sleep 0.5
      ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"
      if is_heartbeat_fresh; then
        daemon_alive=true
        break
      fi
      if curl -s --max-time 2 "http://localhost:${ACTUAL_PORT}/health" >/dev/null 2>&1; then
        daemon_alive=true
        break
      fi
    done
  fi
  if ! $daemon_alive; then
    echo '{}' | bash "$SCRIPT_DIR/start-daemon.sh" >/dev/null 2>&1 || true
    ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"
  fi
fi

RETRY_COUNT="${OH_MY_CURSOR_RETRY_COUNT:-3}"
RETRY_DELAY=0.5
TOTAL_TIMEOUT=2

response=""
attempt=0
while (( attempt < RETRY_COUNT )); do
  response=$(curl -s --max-time "$TOTAL_TIMEOUT" -X POST "http://localhost:${ACTUAL_PORT}${ROUTE}" \
    -H 'Content-Type: application/json' \
    -d "$input" 2>/dev/null) && break
  attempt=$((attempt + 1))
  if (( attempt < RETRY_COUNT )); then
    echo "warning: daemon request failed (attempt $attempt/$RETRY_COUNT), retrying..." >&2
    sleep "$RETRY_DELAY"
    RETRY_DELAY=$(echo "$RETRY_DELAY * 2" | bc -l)
  fi
done

if [ -z "$response" ]; then
  echo '{"error":"daemon_unreachable"}' >&2
  echo '{}'
else
  echo "$response"
fi
