#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

MSG="${1:-user-visible note}"

printf '{"user_message":"%s"}\n' "$MSG"
