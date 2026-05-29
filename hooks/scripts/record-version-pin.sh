#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_DIR="/tmp/cursor-hooks-evidence"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
WORKBENCH_PATH="${WORKBENCH_PATH:-/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js}"
PLUGIN_VERSION_FILE="${PLUGIN_VERSION_FILE:-$HOME/.cursor/plugins/local/oh-my-cursor/.version}"
PLUGIN_DIR="${PLUGIN_DIR:-}"

die() {
  echo "record-version-pin: $*" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || die "jq is required but not found in PATH"

mkdir -p "$EVIDENCE_DIR"

cursor_version=""
if command -v cursor >/dev/null 2>&1; then
  cursor_version="$(cursor --version 2>/dev/null | head -n 1 || true)"
else
  die "cursor CLI not found in PATH"
fi
[[ -n "$cursor_version" ]] || die "cursor_version is empty (cursor --version produced no output)"

if [[ ! -r "$WORKBENCH_PATH" ]]; then
  die "workbench file not readable: $WORKBENCH_PATH"
fi
binary_sha256="$(sha256sum "$WORKBENCH_PATH" | awk '{print $1}')"
[[ -n "$binary_sha256" ]] || die "binary_sha256 is empty"

if [[ -f "$PLUGIN_VERSION_FILE" ]]; then
  plugin_version="$(tr -d '\n' <"$PLUGIN_VERSION_FILE" || true)"
fi

# Fallback 1: explicit PLUGIN_DIR override
if [[ -z "${plugin_version:-}" && -n "$PLUGIN_DIR" && -f "$PLUGIN_DIR/.version" ]]; then
  plugin_version="$(tr -d '\n' <"$PLUGIN_DIR/.version" || true)"
fi

# Fallback 2: repo-local .cursor-plugin/.version
if [[ -z "${plugin_version:-}" && -f "${REPO_ROOT}/.cursor-plugin/.version" ]]; then
  plugin_version="$(tr -d '\n' <"${REPO_ROOT}/.cursor-plugin/.version" || true)"
fi

if [[ -z "${plugin_version:-}" ]]; then
  echo "record-version-pin: WARNING: plugin_version could not be resolved (tried: ${PLUGIN_VERSION_FILE}, PLUGIN_DIR=${PLUGIN_DIR:-<unset>}, ${REPO_ROOT}/.cursor-plugin/.version); falling back to \"none\"" >&2
  plugin_version="none"
fi

git_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
[[ -n "$git_sha" ]] || die "git_sha is empty"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
[[ -n "$timestamp" ]] || die "timestamp is empty"

HEADER_JSON="$EVIDENCE_DIR/_header.json"
jq -n \
  --arg cursor_version "$cursor_version" \
  --arg binary_sha256 "$binary_sha256" \
  --arg plugin_version "$plugin_version" \
  --arg git_sha "$git_sha" \
  --arg timestamp "$timestamp" \
  --arg workbench_path "$WORKBENCH_PATH" \
  --arg evidence_dir "$EVIDENCE_DIR" \
  '{
    cursor_version: $cursor_version,
    binary_sha256: $binary_sha256,
    plugin_version: $plugin_version,
    git_sha: $git_sha,
    timestamp: $timestamp,
    workbench_path: $workbench_path,
    evidence_dir: $evidence_dir
  }' >"$HEADER_JSON"

jq -e '
  (.cursor_version | type == "string" and length > 0) and
  (.binary_sha256 | type == "string" and length > 0) and
  (.plugin_version | type == "string" and length > 0) and
  (.git_sha | type == "string" and length > 0) and
  (.timestamp | type == "string" and length > 0) and
  (.workbench_path | type == "string" and length > 0) and
  (.evidence_dir | type == "string" and length > 0)
' "$HEADER_JSON" >/dev/null || die "_header.json validation failed (empty or invalid fields)"

cat "$HEADER_JSON"
