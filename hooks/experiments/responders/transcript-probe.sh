#!/usr/bin/env bash
# Experiment E5 — subagentStop transcript probe
# Buffers the hook payload, runs the standard logger, then extracts
# agent_transcript_path and records the first 200 bytes + file format.
set -uo pipefail

EXPERIMENT_ID="${1:-W-X-subagentStop-transcript-path-001}"
EVIDENCE_DIR="${CURSOR_HOOKS_EVIDENCE_DIR:-/tmp/cursor-hooks-evidence}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_SH="$(cd "$SCRIPT_DIR/../../scripts" && pwd)/experiment-logger-v2.sh"

mkdir -p "$EVIDENCE_DIR"

# Buffer stdin so we can both log and inspect
TMPFILE=$(mktemp /tmp/cursor-hooks-transcript-probe-XXXXXX.json)
trap 'rm -f "$TMPFILE"' EXIT
cat > "$TMPFILE"

# Run the standard logger (passes payload via redirect, outputs pass-through)
bash "$LOG_SH" "subagentStop" --experiment-id "$EXPERIMENT_ID" < "$TMPFILE" > /dev/null 2>&1 || true

# Extract agent_transcript_path from the payload using bun (already on PATH)
TRANSCRIPT_PATH=$(bun -e "
  const fs = require('fs');
  try {
    const p = JSON.parse(fs.readFileSync('$TMPFILE', 'utf8'));
    process.stdout.write(p.agent_transcript_path ?? '');
  } catch { process.stdout.write(''); }
" 2>/dev/null || echo "")

# Probe the transcript file if present
TRANSCRIPT_HEAD_B64=""
TRANSCRIPT_FORMAT="not-found"
TRANSCRIPT_SIZE_BYTES=0

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  TRANSCRIPT_HEAD_B64=$(head -c 200 "$TRANSCRIPT_PATH" 2>/dev/null | base64 -w 0 || echo "")
  TRANSCRIPT_FORMAT=$(file -b "$TRANSCRIPT_PATH" 2>/dev/null || echo "unknown")
  TRANSCRIPT_SIZE_BYTES=$(stat -c%s "$TRANSCRIPT_PATH" 2>/dev/null || echo "0")
fi

# Write supplemental evidence record
PROBE_UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s%N)-$$")
cat > "$EVIDENCE_DIR/transcript-probe-${PROBE_UUID}.json" <<JSON
{
  "experiment_id": "$EXPERIMENT_ID",
  "event": "subagentStop",
  "schema_version": "v2",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "agent_transcript_path": "$TRANSCRIPT_PATH",
  "transcript_format": "$TRANSCRIPT_FORMAT",
  "transcript_size_bytes": $TRANSCRIPT_SIZE_BYTES,
  "transcript_head_b64": "$TRANSCRIPT_HEAD_B64"
}
JSON

# Transparent pass-through: Cursor reads our stdout as the hook response
cat "$TMPFILE"
exit 0
