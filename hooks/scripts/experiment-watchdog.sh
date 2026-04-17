#!/usr/bin/env bash
set -uo pipefail

# End-of-session cleanup: restore hooks.json from a timestamped baseline, clear
# experimental hook PIDs, rehydrate the daemon via install.sh --force.

OH_MY_CURSOR_PLUGIN_DIR="${OH_MY_CURSOR_PLUGIN_DIR:-$HOME/.cursor/plugins/local/oh-my-cursor}"
BASELINE_GLOB="${BASELINE_GLOB:-/tmp/hooks.json.baseline-*}"
WATCHDOG_INFLIGHT_PID_FILE="${WATCHDOG_INFLIGHT_PID_FILE:-/tmp/cursor-hooks-inflight.pid}"
WATCHDOG_INSTALL_SCRIPT="${WATCHDOG_INSTALL_SCRIPT:-<REPO>/install.sh}"

HOOKS_JSON="${OH_MY_CURSOR_PLUGIN_DIR}/hooks/hooks.json"

log() {
  printf '%s\n' "$*" >&2
}

newest_baseline() {
  shopt -s nullglob
  local matches=( ${BASELINE_GLOB} )
  shopt -u nullglob
  if [[ ${#matches[@]} -eq 0 ]]; then
    echo ""
    return 0
  fi
  ls -t "${matches[@]}" | head -1
}

cleanup() {
  log "[watchdog] Step a: locating newest baseline (glob: ${BASELINE_GLOB})"
  local baseline_file
  baseline_file="$(newest_baseline)"
  if [[ -z "$baseline_file" ]] || [[ ! -f "$baseline_file" ]]; then
    log "[watchdog] WARN: no baseline file matching ${BASELINE_GLOB}; aborting."
    exit 3
  fi
  log "[watchdog] Using baseline: ${baseline_file}"

  local killed_count=0
  log "[watchdog] Step b: clearing in-flight hook PIDs (${WATCHDOG_INFLIGHT_PID_FILE})"
  if [[ -f "$WATCHDOG_INFLIGHT_PID_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "${line// }" ]] && continue
      if [[ "$line" =~ ^[[:space:]]*([0-9]+)[[:space:]]*$ ]]; then
        local pid="${BASH_REMATCH[1]}"
        log "[watchdog] kill -9 ${pid}"
        kill -9 "$pid" 2>/dev/null || true
        killed_count=$((killed_count + 1))
      fi
    done <"$WATCHDOG_INFLIGHT_PID_FILE"
    rm -f "$WATCHDOG_INFLIGHT_PID_FILE"
    log "[watchdog] Removed inflight PID file."
  else
    log "[watchdog] No inflight PID file."
  fi

  log "[watchdog] Step c: restoring hooks.json from baseline to ${HOOKS_JSON}"
  mkdir -p "$(dirname "$HOOKS_JSON")"
  cp -f "$baseline_file" "$HOOKS_JSON"

  if [[ "${WATCHDOG_SKIP_INSTALL:-}" != "1" ]]; then
    log "[watchdog] Step d: running ${WATCHDOG_INSTALL_SCRIPT} --force (rehydrate daemon)"
    bash "$WATCHDOG_INSTALL_SCRIPT" --force
  else
    log "[watchdog] Step d: skipped (WATCHDOG_SKIP_INSTALL=1)"
  fi

  log "[watchdog] Step e: verifying restoration (cmp -s baseline vs hooks.json)"
  if ! cmp -s "$baseline_file" "$HOOKS_JSON"; then
    log "[watchdog] ERROR: cmp verification failed"
    exit 4
  fi

  log "[watchdog] Summary: baseline=$(basename "$baseline_file") killed_pids=${killed_count}"
  log "[watchdog] You must restart Cursor for hook changes to take effect."
}

case "${1:-}" in
cleanup)
  cleanup
  ;;
*)
  log "Usage: $0 cleanup"
  exit 2
  ;;
esac
