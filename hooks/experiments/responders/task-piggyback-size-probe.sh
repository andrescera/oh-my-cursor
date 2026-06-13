#!/usr/bin/env bash
# B-series probe responder — preToolUse(Task) `updated_input` prompt SIZE bound.
#
# Emits a `prompt` piggyback of a TARGET byte size to find the size at which
# Cursor stops accepting (or truncates) an `updated_input` override. The
# piggyback is framed with a HEAD and a TAIL marker around the padding so a
# later subagentStart capture can classify the outcome:
#
#   HEAD present + TAIL present  -> accepted whole at this size
#   HEAD present + TAIL absent   -> truncated between HEAD and TAIL
#   HEAD absent  + TAIL absent   -> override rejected / replaced
#
# See: docs/internal/hooks-experiments-runbook.md §B — Task updated_input merge
#      semantics (cell W-X-preToolUse-task-updated-input-size-003).
#
# Invocation (from hooks.json `command`, optionally behind sentinel-gate.sh):
#   task-piggyback-size-probe.sh <EXPERIMENT_ID> <EVENT> <SIZE_BYTES>
#
#   SIZE_BYTES sweep: 1024 (1KB), 8192 (8KB), 65536 (64KB).
#
# Env:
#   OMC_PROBE_NONCE            override the sentinel nonce (default: random hex)
#   CURSOR_HOOKS_EVIDENCE_DIR  evidence output dir (default /tmp/cursor-hooks-evidence)
#
# Contract: _common.sh logs the inbound payload via experiment-logger-v2 and
# lets this responder own stdout. Only the JSON hook response is written to
# stdout; all probe bookkeeping goes to evidence files / stderr.

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

SIZE_BYTES="${1:-1024}"
NONCE="${OMC_PROBE_NONCE:-$(od -An -N6 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n' || echo "$(date +%s)$$")}"
SENTINEL="SENTINEL_OMC_SIZE_${SIZE_BYTES}_${NONCE}"
EVIDENCE_DIR="${CURSOR_HOOKS_EVIDENCE_DIR:-/tmp/cursor-hooks-evidence}"
mkdir -p "$EVIDENCE_DIR"

PAYLOAD_FILE="$(mktemp /tmp/omc-b-size-XXXXXX.json)"
trap 'rm -f "$PAYLOAD_FILE"' EXIT
printf '%s' "$STDIN_CAPTURED" > "$PAYLOAD_FILE"

CORR_UUID="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-$$-$RANDOM")"

OMC_EXPERIMENT_ID="$EXPERIMENT_ID" \
OMC_SIZE="$SIZE_BYTES" \
OMC_SENTINEL="$SENTINEL" \
OMC_PAYLOAD_FILE="$PAYLOAD_FILE" \
OMC_EVIDENCE_FILE="$EVIDENCE_DIR/b-series-size-${CORR_UUID}.json" \
bun -e '
  const fs = require("fs")
  const expId = process.env.OMC_EXPERIMENT_ID || ""
  const size = parseInt(process.env.OMC_SIZE || "1024", 10)
  const sentinel = process.env.OMC_SENTINEL || ""
  const evidenceFile = process.env.OMC_EVIDENCE_FILE

  let payload = {}
  try { payload = JSON.parse(fs.readFileSync(process.env.OMC_PAYLOAD_FILE, "utf8")) } catch {}
  const ti = (payload && typeof payload.tool_input === "object" && payload.tool_input) ? payload.tool_input : {}
  const origPrompt = typeof ti.prompt === "string" ? ti.prompt : ""

  const head = sentinel + "_HEAD::"
  const tail = "::" + sentinel + "_TAIL"
  const fixedBytes = Buffer.byteLength(head + tail, "utf8")
  const padLen = Math.max(0, size - fixedBytes)
  const padding = "A".repeat(padLen)
  const piggyback = head + padding + tail + "\n\n" + origPrompt

  const updated = { prompt: piggyback }
  const response = { permission: "allow", updated_input: updated }
  const responseStr = JSON.stringify(response)

  const correlation = {
    experiment_id: expId,
    event: "preToolUse",
    schema_version: "v2-b-series",
    probe: "task-piggyback-size",
    sentinel,
    head_marker: head,
    tail_marker: tail,
    target_size_bytes: size,
    actual_piggyback_bytes: Buffer.byteLength(piggyback, "utf8"),
    emitted_response_bytes: Buffer.byteLength(responseStr, "utf8"),
    tool_name: typeof payload.tool_name === "string" ? payload.tool_name : "",
    tool_use_id: typeof payload.tool_use_id === "string" ? payload.tool_use_id : "",
    conversation_id: typeof payload.conversation_id === "string" ? payload.conversation_id : "",
    original_prompt_len: origPrompt.length,
    timestamp: new Date().toISOString(),
  }
  try { fs.writeFileSync(evidenceFile, JSON.stringify(correlation, null, 2), "utf8") } catch {}

  process.stdout.write(responseStr + "\n")
'
exit 0
