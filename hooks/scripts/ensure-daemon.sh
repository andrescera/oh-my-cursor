#!/usr/bin/env bash
set -euo pipefail

ROUTE="${1:?usage: ensure-daemon.sh /route}"
PORT="${OH_MY_CURSOR_DAEMON_PORT:-${OH_MY_CURSOR_PORT:-27847}}"
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
  local ts_ms
  ts_ms="$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo "0")"
  [[ "$ts_ms" =~ ^[0-9]+$ ]] || return 1
  local now_s ts_s
  now_s="$(date +%s)"
  ts_s=$((ts_ms / 1000))
  (( (now_s - ts_s) < 60 ))
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
TOTAL_TIMEOUT=2
RETRY_DELAYS=(0.5 1 2)

response=""
attempt=0
while (( attempt < RETRY_COUNT )); do
  response=$(curl -sf --max-time "$TOTAL_TIMEOUT" -X POST "http://localhost:${ACTUAL_PORT}${ROUTE}" \
    -H 'Content-Type: application/json' \
    -d "$input" 2>/dev/null) && break
  attempt=$((attempt + 1))
  if (( attempt < RETRY_COUNT )); then
    echo "warning: daemon request failed (attempt $attempt/$RETRY_COUNT), retrying..." >&2
    sleep "${RETRY_DELAYS[$((attempt - 1))]:-2}"
  fi
done

if [ -z "$response" ]; then
  echo '{"error":"daemon_unreachable"}' >&2
  echo '{}'
else
  echo "$response"
fi
