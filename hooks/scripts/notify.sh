#!/usr/bin/env bash
TITLE="${1:-oh-my-cursor}"
MESSAGE="${2:-Background task completed}"

if command -v notify-send &>/dev/null; then
  notify-send "$TITLE" "$MESSAGE" 2>/dev/null || true
elif command -v osascript &>/dev/null; then
  osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\"" 2>/dev/null || true
fi
