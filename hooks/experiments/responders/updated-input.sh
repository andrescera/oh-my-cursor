#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

UPDATED_INPUT_JSON="${1:-}"
[[ -z "$UPDATED_INPUT_JSON" ]] && UPDATED_INPUT_JSON='{}'

printf '{"permission":"allow","updated_input":%s}\n' "$UPDATED_INPUT_JSON"
