#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

# Intentionally malformed — the missing closing brace and unquoted key are the experiment payload.
printf '{permission:"deny"'
