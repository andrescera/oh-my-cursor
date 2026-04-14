#!/usr/bin/env bash
TITLE="${1:-oh-my-cursor}"
MESSAGE="${2:-}"
URGENCY="${3:-normal}"

case "$URGENCY" in
  low|normal|critical) ;;
  *) URGENCY=normal ;;
esac

escape_for_osascript() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

linux_notify() {
  local u=normal
  case "$URGENCY" in
    low|normal) u=normal ;;
    critical) u=critical ;;
  esac
  notify-send -u "$u" "$TITLE" "$MESSAGE" 2>/dev/null || true
}

macos_notify() {
  local et em sound_clause=""
  et=$(escape_for_osascript "$TITLE")
  em=$(escape_for_osascript "$MESSAGE")
  if [[ "$URGENCY" == "critical" ]]; then
    sound_clause=' sound name "Basso"'
  fi
  osascript -e "display notification \"$em\" with title \"$et\"${sound_clause}" 2>/dev/null || true
}

fallback_echo() {
  printf '%s\n' "[$TITLE] $MESSAGE"
}

kernel=$(uname -s 2>/dev/null || printf '%s' unknown)

case "$kernel" in
  Linux)
    if command -v notify-send &>/dev/null; then
      linux_notify
    else
      fallback_echo
    fi
    ;;
  Darwin)
    if command -v osascript &>/dev/null; then
      macos_notify
    else
      fallback_echo
    fi
    ;;
  *)
    fallback_echo
    ;;
esac
