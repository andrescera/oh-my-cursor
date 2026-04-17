#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

CONTEXT_STRING="${1:-CANARY_DEFAULT}"

printf '{"additional_context":"%s"}\n' "$CONTEXT_STRING"
