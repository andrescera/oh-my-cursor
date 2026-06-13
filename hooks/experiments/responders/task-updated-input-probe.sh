#!/usr/bin/env bash
# B-series probe responder — preToolUse(Task) `updated_input` merge semantics.
#
# Probes whether Cursor MERGES (shallow) or REPLACES the original Task
# `tool_input` when a preToolUse hook returns a PARTIAL `updated_input`. Emits
# the partial override and records a supplemental correlation record so a later
# subagentStart / subagentStop firing can be matched by sentinel.
#
# See: docs/internal/hooks-experiments-runbook.md §B — Task updated_input merge
#      semantics (cells W-X-preToolUse-task-updated-input-merge-001..002).
#
# Invocation (from hooks.json `command`, optionally behind sentinel-gate.sh):
#   task-updated-input-probe.sh <EXPERIMENT_ID> <EVENT> <MODE> [ALT_SLUG]
#
#   MODE:
#     model-only        updated_input = {"model": "<ALT_SLUG>"}              (variant A)
#     prompt-piggyback  updated_input = {"prompt": "<SENTINEL>\n\n<orig>"}   (variant B)
#     echo-all          updated_input = {...orig tool_input, override}       (replace-safe ref)
#   ALT_SLUG: a valid alternate Task model slug (default: composer-2-fast)
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

MODE="${1:-model-only}"
ALT_SLUG="${2:-composer-2-fast}"
NONCE="${OMC_PROBE_NONCE:-$(od -An -N6 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n' || echo "$(date +%s)$$")}"
SENTINEL="SENTINEL_OMC_PIGGYBACK_${NONCE}"
EVIDENCE_DIR="${CURSOR_HOOKS_EVIDENCE_DIR:-/tmp/cursor-hooks-evidence}"
mkdir -p "$EVIDENCE_DIR"

PAYLOAD_FILE="$(mktemp /tmp/omc-b-probe-XXXXXX.json)"
trap 'rm -f "$PAYLOAD_FILE"' EXIT
printf '%s' "$STDIN_CAPTURED" > "$PAYLOAD_FILE"

CORR_UUID="$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-$$-$RANDOM")"

OMC_EXPERIMENT_ID="$EXPERIMENT_ID" \
OMC_MODE="$MODE" \
OMC_ALT_SLUG="$ALT_SLUG" \
OMC_SENTINEL="$SENTINEL" \
OMC_PAYLOAD_FILE="$PAYLOAD_FILE" \
OMC_EVIDENCE_FILE="$EVIDENCE_DIR/b-series-correlation-${CORR_UUID}.json" \
bun -e '
  const fs = require("fs")
  const expId = process.env.OMC_EXPERIMENT_ID || ""
  const mode = process.env.OMC_MODE || "model-only"
  const altSlug = process.env.OMC_ALT_SLUG || "composer-2-fast"
  const sentinel = process.env.OMC_SENTINEL || ""
  const evidenceFile = process.env.OMC_EVIDENCE_FILE

  let payload = {}
  try { payload = JSON.parse(fs.readFileSync(process.env.OMC_PAYLOAD_FILE, "utf8")) } catch {}
  const ti = (payload && typeof payload.tool_input === "object" && payload.tool_input) ? payload.tool_input : {}
  const origPrompt = typeof ti.prompt === "string" ? ti.prompt : ""
  const origType =
    typeof ti.subagent_type === "string" ? ti.subagent_type
    : (typeof ti.agent_type === "string" ? ti.agent_type : "")
  const origDesc = typeof ti.description === "string" ? ti.description : ""
  const origModel = typeof ti.model === "string" ? ti.model : ""

  let updated
  if (mode === "prompt-piggyback") {
    updated = { prompt: sentinel + "\n\n" + origPrompt }
  } else if (mode === "echo-all") {
    // Replace-safe reference: echo every original field, then apply override.
    updated = { ...ti, model: altSlug, prompt: sentinel + "\n\n" + origPrompt }
  } else {
    // model-only (default / variant A)
    updated = { model: altSlug }
  }

  const response = { permission: "allow", updated_input: updated }
  const responseStr = JSON.stringify(response)

  const correlation = {
    experiment_id: expId,
    event: "preToolUse",
    schema_version: "v2-b-series",
    probe: "task-updated-input",
    mode,
    sentinel,
    alt_slug: altSlug,
    tool_name: typeof payload.tool_name === "string" ? payload.tool_name : "",
    tool_use_id: typeof payload.tool_use_id === "string" ? payload.tool_use_id : "",
    conversation_id: typeof payload.conversation_id === "string" ? payload.conversation_id : "",
    original: {
      subagent_type: origType,
      description: origDesc,
      model: origModel,
      prompt_len: origPrompt.length,
      tool_input_keys: Object.keys(ti),
    },
    emitted_updated_input_keys: Object.keys(updated),
    emitted_response_bytes: Buffer.byteLength(responseStr, "utf8"),
    timestamp: new Date().toISOString(),
  }
  try { fs.writeFileSync(evidenceFile, JSON.stringify(correlation, null, 2), "utf8") } catch {}

  process.stdout.write(responseStr + "\n")
'
exit 0
