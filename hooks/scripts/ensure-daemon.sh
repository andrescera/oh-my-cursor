#!/usr/bin/env bash
set -uo pipefail

ROUTE="${1:?usage: ensure-daemon.sh /route}"
PORT="${OH_MY_CURSOR_DAEMON_PORT:-${OH_MY_CURSOR_PORT:-27847}}"
PORT_FILE="/tmp/oh-my-cursor-daemon.port"
HEARTBEAT_FILE="/tmp/oh-my-cursor-heartbeat"
PID_FILE="/tmp/oh-my-cursor-daemon.pid"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMEOUT_MS="${OH_MY_CURSOR_ENSURE_TIMEOUT_MS:-3000}"
SCRIPT_START_MS=$(($(date +%s%3N)))

elapsed_ms() {
  local now=$(($(date +%s%3N)))
  echo $(( now - SCRIPT_START_MS ))
}

deadline_exceeded() {
  (( $(elapsed_ms) >= TIMEOUT_MS ))
}

bail_timeout() {
  echo "{\"error\":\"daemon_timeout\",\"elapsedMs\":$(elapsed_ms)}" >&2
  echo '{}'
  exit 1
}

input=$(cat)
deadline_exceeded && bail_timeout

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
elif curl -s --max-time 1 "http://localhost:${ACTUAL_PORT}/health" >/dev/null 2>&1; then
  daemon_alive=true
fi

if ! $daemon_alive; then
  deadline_exceeded && bail_timeout
  stale_killed=false
  if [ -f "$PID_FILE" ]; then
    deadline_exceeded && bail_timeout
    stale_pid="$(cat "$PID_FILE" 2>/dev/null || echo "")"
    if [[ "$stale_pid" =~ ^[0-9]+$ ]] && kill -0 "$stale_pid" 2>/dev/null; then
      kill "$stale_pid" 2>/dev/null || true
      stale_killed=true
    fi
    rm -f "$PID_FILE"
  fi
  if $stale_killed; then
    # Existing supervisor will restart the daemon; avoid spawning a second supervisor.
    for _ in {1..6}; do
      deadline_exceeded && bail_timeout
      sleep 0.2
      ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"
      if is_heartbeat_fresh; then
        daemon_alive=true
        break
      fi
      if curl -s --max-time 1 "http://localhost:${ACTUAL_PORT}/health" >/dev/null 2>&1; then
        daemon_alive=true
        break
      fi
    done
  fi
  if ! $daemon_alive; then
    deadline_exceeded && bail_timeout
    echo '{}' | bash "$SCRIPT_DIR/start-daemon.sh" >/dev/null 2>&1 || true
    deadline_exceeded && bail_timeout
    ACTUAL_PORT="$(read_port_file "$PORT_FILE" "$PORT")"
    curl -s --max-time 0.5 "http://localhost:${ACTUAL_PORT}/health" >/dev/null 2>&1 || true
  fi
fi

RETRY_COUNT="${OH_MY_CURSOR_RETRY_COUNT:-2}"
TOTAL_TIMEOUT=1
RETRY_DELAYS=(0.2 0.4)

response=""
attempt=0
while (( attempt < RETRY_COUNT )); do
  deadline_exceeded && bail_timeout
  response=$(curl -sf --max-time "$TOTAL_TIMEOUT" -X POST "http://localhost:${ACTUAL_PORT}${ROUTE}" \
    -H 'Content-Type: application/json' \
    -d "$input" 2>/dev/null) && break
  attempt=$((attempt + 1))
  if (( attempt < RETRY_COUNT )); then
    echo "warning: daemon request failed (attempt $attempt/$RETRY_COUNT), retrying..." >&2
    deadline_exceeded && bail_timeout
    sleep "${RETRY_DELAYS[$((attempt - 1))]:-2}"
  fi
done

if [ -z "$response" ]; then
  echo '{"error":"daemon_unreachable"}' >&2
  echo '{}'
  exit 1
else
  echo "$response"
fi
