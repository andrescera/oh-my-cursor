#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

USER_MSG="${1:-ask-permission experiment}"

printf '{"permission":"ask","user_message":"%s"}\n' "$USER_MSG"
