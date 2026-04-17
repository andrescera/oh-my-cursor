#!/usr/bin/env bash
set -uo pipefail

SENTINEL="${1}"
DELEGATE="${2}"
shift 2

STDIN="$(cat)"

if printf '%s' "$STDIN" | grep -qF "$SENTINEL"; then
  printf '%s' "$STDIN" | bash "$DELEGATE" "$@"
  exit $?
fi

printf '{}\n'
exit 0
