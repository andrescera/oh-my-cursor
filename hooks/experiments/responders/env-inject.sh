#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

ENV_JSON="${1:-}"
[[ -z "$ENV_JSON" ]] && ENV_JSON='{}'

printf '{"env":%s}\n' "$ENV_JSON"
