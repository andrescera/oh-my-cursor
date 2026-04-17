#!/usr/bin/env bash
set -uo pipefail

INFLIGHT_PID_FILE="/tmp/cursor-hooks-inflight.pid"
echo $$ > "$INFLIGHT_PID_FILE"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGGER_TS="$(cd "$SCRIPT_DIR/.." && pwd)/experiments/logger-v2.ts"

bun "$LOGGER_TS" "$@" || true

rm -f "$INFLIGHT_PID_FILE"
exit 0
