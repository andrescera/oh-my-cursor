#!/usr/bin/env bash
set -uo pipefail

# shellcheck source=./_common.sh
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

printf '{"permission":"allow"}\n'
