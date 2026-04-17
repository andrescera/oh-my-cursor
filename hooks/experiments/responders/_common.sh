#!/usr/bin/env bash
# Shared responder prologue. Sourced, not executed.
#
# Sets: EXPERIMENT_ID, EVENT, STDIN_CAPTURED
# Side effects: appends $$ to inflight PID file, traps EXIT to remove it,
# logs evidence via logger-v2 (stdout discarded so the responder owns stdout).
#
# Sourcing without arguments inherits the caller's $@ so that shift 2 strips
# EXPERIMENT_ID and EVENT from the responder's positional parameters.

set -uo pipefail

INFLIGHT_PID_FILE="${CURSOR_HOOKS_INFLIGHT_PID_FILE:-/tmp/cursor-hooks-inflight.pid}"
LOGGER_SCRIPT="${CURSOR_HOOKS_LOGGER:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../scripts" && pwd)/experiment-logger-v2.sh}"

mkdir -p "$(dirname "$INFLIGHT_PID_FILE")"
echo $$ >> "$INFLIGHT_PID_FILE"
cleanup_pid() { sed -i "/^$$\$/d" "$INFLIGHT_PID_FILE" 2>/dev/null || true; }
trap cleanup_pid EXIT

EXPERIMENT_ID="${1:-UNKNOWN}"
EVENT="${2:-unknown}"
shift 2 || true

STDIN_CAPTURED="$(cat)"

echo "$STDIN_CAPTURED" | bash "$LOGGER_SCRIPT" "$EVENT" --experiment-id "$EXPERIMENT_ID" >/dev/null 2>&1 || true
