#!/usr/bin/env bash
set -uo pipefail

EVENT_NAME="${1:-unknown}"
LOG_FILE="/tmp/cursor-hook-experiment.log"

PAYLOAD="$(cat 2>/dev/null || true)"
CWD="$(pwd 2>/dev/null || echo "")"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"

mkdir -p "$(dirname "$LOG_FILE")" >/dev/null 2>&1 || true

if command -v python3 >/dev/null 2>&1; then
  TMP_PAYLOAD_FILE="$(mktemp 2>/dev/null || echo "/tmp/cursor-hook-experiment-payload.$$")"
  printf '%s' "$PAYLOAD" > "$TMP_PAYLOAD_FILE" 2>/dev/null || true

  RECORD="$(
    EVENT_NAME="$EVENT_NAME" \
    TIMESTAMP="$TIMESTAMP" \
    PID_VALUE="$$" \
    PARENT_PID_VALUE="$PPID" \
    CWD_VALUE="$CWD" \
    TMP_PAYLOAD_FILE="$TMP_PAYLOAD_FILE" \
    python3 - <<'PY'
import base64
import json
import os
from pathlib import Path

payload_file = Path(os.environ.get("TMP_PAYLOAD_FILE", ""))
raw_payload = ""
if payload_file.exists():
    raw_payload = payload_file.read_text(encoding="utf-8", errors="surrogateescape")

payload = {}
try:
    payload["format"] = "json"
    payload["value"] = json.loads(raw_payload) if raw_payload else {}
except Exception:
    payload["format"] = "base64"
    payload["value"] = base64.b64encode(raw_payload.encode("utf-8", errors="surrogatepass")).decode("ascii")

cursor_env = {k: v for k, v in os.environ.items() if k.startswith("CURSOR_")}

record = {
    "timestamp": os.environ.get("TIMESTAMP", ""),
    "event": os.environ.get("EVENT_NAME", "unknown"),
    "pid": int(os.environ.get("PID_VALUE", "0") or 0),
    "ppid": int(os.environ.get("PARENT_PID_VALUE", "0") or 0),
    "cwd": os.environ.get("CWD_VALUE", ""),
    "cursor_env": cursor_env,
    "stdin_payload": payload,
}

print(json.dumps(record, separators=(",", ":"), ensure_ascii=False))
PY
  )"

  rm -f "$TMP_PAYLOAD_FILE" 2>/dev/null || true
else
  ENCODED_PAYLOAD="$(printf '%s' "$PAYLOAD" | base64 | tr -d '\n' 2>/dev/null || true)"
  RECORD="{\"timestamp\":\"$TIMESTAMP\",\"event\":\"$EVENT_NAME\",\"pid\":$$,\"ppid\":$PPID,\"cwd\":\"$CWD\",\"cursor_env\":{},\"stdin_payload\":{\"format\":\"base64\",\"value\":\"$ENCODED_PAYLOAD\"}}"
fi

printf '%s\n' "$RECORD" >> "$LOG_FILE" 2>/dev/null || true
exit 0
