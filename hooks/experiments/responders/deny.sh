#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

USER_MSG="${1:-denied by experiment}"
AGENT_MSG="${2:-blocked by hook-v2 experiment}"

printf '{"permission":"deny","user_message":"%s","agent_message":"%s"}\n' "$USER_MSG" "$AGENT_MSG"
