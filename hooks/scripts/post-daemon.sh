#!/usr/bin/env bash
set -euo pipefail

ROUTE="${1:?usage: post-daemon.sh /route}"
PORT="${OH_MY_CURSOR_DAEMON_PORT:-${OH_MY_CURSOR_PORT:-27847}}"
PORT_FILE="/tmp/oh-my-cursor-daemon.port"

input=$(cat)

if [ -f "$PORT_FILE" ]; then
  file_port="$(cat "$PORT_FILE" 2>/dev/null || echo "")"
  if [[ "$file_port" =~ ^[0-9]+$ ]]; then
    PORT="$file_port"
  fi
fi

response=$(curl -s --max-time 2 -X POST "http://localhost:${PORT}${ROUTE}" \
  -H 'Content-Type: application/json' \
  -d "$input" 2>/dev/null) && { echo "$response"; exit 0; }

sleep 0.3

response=$(curl -s --max-time 2 -X POST "http://localhost:${PORT}${ROUTE}" \
  -H 'Content-Type: application/json' \
  -d "$input" 2>/dev/null) && { echo "$response"; exit 0; }

echo '{"error":"daemon_unreachable"}' >&2
echo '{}'
