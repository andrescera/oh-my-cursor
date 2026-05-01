#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="oh-my-cursor"
DEFAULT_DAEMON_PORT=27847
DEFAULT_MCP_PORT=27848
LOCK_FILE="/tmp/oh-my-cursor-install.lock"

TEMP_FILES=(
  /tmp/oh-my-cursor-daemon.pid
  /tmp/oh-my-cursor-daemon.port
  /tmp/oh-my-cursor-sidecar.port
  /tmp/oh-my-cursor-heartbeat
  /tmp/oh-my-cursor-restart-count
  /tmp/oh-my-cursor-ports.json
)

MCP_KEYS=("websearch" "context7" "grep_app" "oh-my-cursor")

SCOPE="user"
FORCE=false
DRY_RUN=false
MODE="auto"
DASHBOARD_BUILD_SKIPPED=false
DASHBOARD_BUILD_FAILED=false
BUILD_OK=0

# --- CLI parsing ---

usage() {
  cat <<'USAGE'
oh-my-cursor installer

Usage:
  ./install.sh                    Auto: fresh install or update
  ./install.sh --force            Force fresh install (nuke existing)
  ./install.sh --uninstall        Complete removal
  ./install.sh --version          Print installed version
  ./install.sh --check-update     Compare installed vs source version
  ./install.sh --dry-run          Preview mode (combinable with above)
  ./install.sh --project          Project-scoped install
  ./install.sh --skip-dashboard-build  Install without building the dashboard UI
  ./install.sh --help             This help text

Options:
  --force                 Force fresh install even if already installed
  --uninstall             Remove oh-my-cursor completely
  --version               Show installed version
  --check-update          Check if an update is available
  --dry-run               Show what would happen without making changes
  --project               Install to .cursor/ in current directory instead of ~/.cursor/
  --skip-dashboard-build  Do not build hooks/dashboard-ui; preserves any existing dist on update.
                          On fresh/force, /dashboard/assets/* will return 503 until next install.
  --help                  Show this help message

Environment variables:
  OH_MY_CURSOR_PORT       Daemon port (default: 27847)
  OH_MY_CURSOR_MCP_PORT   MCP sidecar port (default: 27848)
USAGE
}

# --- Output helpers ---

log()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[0;33m%s\033[0m\n' "$*" >&2; }
err()  { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }

# --- Prerequisites ---

check_prerequisites() {
  local missing=()
  if ! command -v bun &>/dev/null; then
    missing+=("bun (required for daemon)")
  fi
  if ! command -v python3 &>/dev/null && ! command -v jq &>/dev/null; then
    missing+=("python3 or jq (required for JSON manipulation)")
  fi
  if ! command -v curl &>/dev/null; then
    missing+=("curl (required for health checks)")
  fi
  if (( ${#missing[@]} > 0 )); then
    err "Missing prerequisites:"
    for m in "${missing[@]}"; do
      err "  - $m"
    done
    exit 1
  fi
}

# --- Version helpers ---

get_source_version() {
  local manifest="$SCRIPT_DIR/.cursor-plugin/plugin.json"
  if [[ ! -f "$manifest" ]]; then
    echo "unknown"
    return
  fi
  if command -v python3 &>/dev/null; then
    python3 -c "import json; print(json.load(open('$manifest'))['version'])" 2>/dev/null || echo "unknown"
  elif command -v jq &>/dev/null; then
    jq -r '.version' "$manifest" 2>/dev/null || echo "unknown"
  else
    echo "unknown"
  fi
}

get_installed_version() {
  local vfile="$PLUGIN_DIR/.version"
  if [[ -f "$vfile" ]]; then
    cat "$vfile"
  else
    echo "none"
  fi
}

write_version_file() {
  local ver
  ver="$(get_source_version)"
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would write version $ver to $PLUGIN_DIR/.version"
    return
  fi
  echo "$ver" > "$PLUGIN_DIR/.version"
}

# --- Daemon lifecycle ---

stop_daemon() {
  local port
  port="$(cat /tmp/oh-my-cursor-daemon.port 2>/dev/null || echo "$DEFAULT_DAEMON_PORT")"

  # Graceful shutdown via HTTP
  if curl -s --max-time 3 -X POST "http://localhost:${port}/shutdown" &>/dev/null; then
    sleep 1
  fi

  # Kill daemon by PID
  local pidfile="/tmp/oh-my-cursor-daemon.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile" 2>/dev/null || echo "")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      local waited=0
      while kill -0 "$pid" 2>/dev/null && (( waited < 5 )); do
        sleep 1
        (( waited++ )) || true
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
  fi

  # Kill supervisor wrapper and wait for all daemon processes to exit
  pkill -f "oh-my-cursor.*daemon.ts" 2>/dev/null || true
  local waited=0
  while pgrep -f "oh-my-cursor.*daemon.ts" >/dev/null 2>&1 && (( waited < 5 )); do
    sleep 1
    (( waited++ )) || true
  done
  if pgrep -f "oh-my-cursor.*daemon.ts" >/dev/null 2>&1; then
    pkill -9 -f "oh-my-cursor.*daemon.ts" 2>/dev/null || true
    sleep 0.5
  fi

  # Kill sidecar and wait for it to exit
  local mcp_port
  mcp_port="$(cat /tmp/oh-my-cursor-sidecar.port 2>/dev/null || echo "$DEFAULT_MCP_PORT")"
  curl -s --max-time 3 -X POST "http://localhost:${mcp_port}/shutdown" &>/dev/null || true
  pkill -f "mcp-sidecar" 2>/dev/null || true
  waited=0
  while pgrep -f "mcp-sidecar" >/dev/null 2>&1 && (( waited < 3 )); do
    sleep 1
    (( waited++ )) || true
  done
  if pgrep -f "mcp-sidecar" >/dev/null 2>&1; then
    pkill -9 -f "mcp-sidecar" 2>/dev/null || true
    sleep 0.5
  fi

  # Clean up temp files
  for f in "${TEMP_FILES[@]}"; do
    rm -f "$f" 2>/dev/null || true
  done

  # Verify ports are free before returning
  waited=0
  while (( waited < 3 )); do
    local daemon_free=true sidecar_free=true
    if curl -s --max-time 1 "http://localhost:${port}/health" &>/dev/null; then
      daemon_free=false
    fi
    if curl -s --max-time 1 "http://localhost:${mcp_port}/health" &>/dev/null; then
      sidecar_free=false
    fi
    if $daemon_free && $sidecar_free; then
      break
    fi
    sleep 1
    (( waited++ )) || true
  done
}

start_daemon() {
  local starter="$PLUGIN_DIR/hooks/scripts/start-daemon.sh"
  if [[ ! -f "$starter" ]]; then
    warn "Daemon start script not found at $starter"
    return 1
  fi
  chmod +x "$starter"
  echo '{}' | "$starter" >/dev/null
  local port
  port="$(cat /tmp/oh-my-cursor-daemon.port 2>/dev/null || echo "$DEFAULT_DAEMON_PORT")"
  local attempt=0
  local max_attempts=8
  while (( attempt < max_attempts )); do
    if curl -s --max-time 2 "http://localhost:${port}/health" &>/dev/null; then
      log "Daemon healthy on port $port"
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  warn "Daemon did not become healthy within 8s — check /tmp/oh-my-cursor-daemon.log"
  return 1
}

verify_installation() {
  local ok=true
  if [[ ! -d "$PLUGIN_DIR" ]]; then
    err "Plugin directory missing: $PLUGIN_DIR"
    ok=false
  fi
  if [[ ! -f "$PLUGIN_DIR/.version" ]]; then
    warn "Version file missing"
  fi
  local port
  port="$(cat /tmp/oh-my-cursor-daemon.port 2>/dev/null || echo "$DEFAULT_DAEMON_PORT")"
  if ! curl -s "http://localhost:${port}/health" &>/dev/null; then
    warn "Daemon health check failed on port $port"
  fi
  if [[ "$ok" == "false" ]]; then
    return 1
  fi
}

# --- Backup / Restore ---

backup_installation() {
  if [[ -d "$PLUGIN_DIR.bak" ]]; then
    rm -rf "$PLUGIN_DIR.bak"
  fi
  if [[ -d "$PLUGIN_DIR" ]]; then
    cp -r "$PLUGIN_DIR" "$PLUGIN_DIR.bak"
  fi
}

restore_backup() {
  if [[ -d "$PLUGIN_DIR.bak" ]]; then
    rm -rf "$PLUGIN_DIR"
    mv "$PLUGIN_DIR.bak" "$PLUGIN_DIR"
    warn "Restored backup"
  fi
}

# --- MCP config management ---

merge_mcp_config() {
  local target="$MCP_CONFIG"
  local source="$SCRIPT_DIR/mcp.json"

  if [[ ! -f "$source" ]]; then
    warn "Source mcp.json not found at $source"
    return
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would merge MCP servers into $target"
    return
  fi

  if command -v python3 &>/dev/null; then
    python3 - "$target" "$source" "$FORCE" <<'PYEOF'
import sys, json, os, re

target_path, source_path, force_str = sys.argv[1], sys.argv[2], sys.argv[3]
force = force_str.lower() == "true"

with open(source_path) as f:
    source = json.load(f)

source_servers = source.get("mcpServers", {})

if os.path.exists(target_path):
    with open(target_path) as f:
        raw = f.read()
    try:
        target = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: strip JSONC comments outside of quoted strings
        cleaned = re.sub(r'(?<!["\w:])//.*$', '', raw, flags=re.MULTILINE)
        cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
        cleaned = cleaned.strip()
        target = json.loads(cleaned) if cleaned else {}
else:
    target = {}

target.setdefault("mcpServers", {})

added = []
skipped = []
for key, val in source_servers.items():
    if key in target["mcpServers"] and not force:
        skipped.append(key)
    else:
        target["mcpServers"][key] = val
        added.append(key)

os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
with open(target_path, "w") as f:
    json.dump(target, f, indent=2)
    f.write("\n")

if added:
    print(f"[ok] Added MCP servers: {', '.join(added)}")
if skipped:
    print(f"[skip] Already present: {', '.join(skipped)}")
PYEOF
  elif command -v jq &>/dev/null; then
    if [[ ! -f "$target" ]]; then
      mkdir -p "$(dirname "$target")"
      cp "$source" "$target"
      log "[ok] Created $target from source"
      return
    fi
    local merged
    if [[ "$FORCE" == "true" ]]; then
      merged="$(jq -s '.[0] * .[1]' "$target" "$source")"
    else
      merged="$(jq -s '.[0].mcpServers as $existing | .[1].mcpServers as $new | .[0] | .mcpServers = ($new + $existing)' "$target" "$source")"
    fi
    echo "$merged" > "$target"
    log "[ok] Merged MCP config (jq)"
  fi
}

unmerge_mcp_config() {
  local target="$MCP_CONFIG"

  if [[ ! -f "$target" ]]; then
    return
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would remove our MCP servers from $target"
    return
  fi

  if command -v python3 &>/dev/null; then
    python3 - "$target" <<'PYEOF'
import sys, json, os, re

target_path = sys.argv[1]
keys_to_remove = ["websearch", "context7", "grep_app", "oh-my-cursor"]

if not os.path.exists(target_path):
    sys.exit(0)

with open(target_path) as f:
    raw = f.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    cleaned = re.sub(r'(?<!["\w:])//.*$', '', raw, flags=re.MULTILINE)
    cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
    cleaned = cleaned.strip()
    if not cleaned:
        sys.exit(0)
    data = json.loads(cleaned)
servers = data.get("mcpServers", {})
removed = []
for key in keys_to_remove:
    if key in servers:
        del servers[key]
        removed.append(key)

with open(target_path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

if removed:
    print(f"[ok] Removed MCP servers: {', '.join(removed)}")
PYEOF
  elif command -v jq &>/dev/null; then
    local tmp
    tmp="$(jq 'del(.mcpServers.websearch, .mcpServers.context7, .mcpServers.grep_app, .mcpServers["oh-my-cursor"])' "$target")"
    echo "$tmp" > "$target"
    log "[ok] Removed our MCP servers (jq)"
  fi
}

# --- Legacy cleanup ---

cleanup_legacy_loose_files() {
  # Invariant: this function must NEVER touch `hooks/dashboard-ui/dist/`. It is
  # a build artifact managed by build_dashboard_ui — not a legacy loose file.
  # The scans below are restricted to agents/, commands/, rules/, skills/ and
  # two specific legacy hook files; none of those paths overlap with
  # dashboard-ui/dist/, but keep this guarantee in mind when editing.
  local cursor_home="$HOME/.cursor"
  local dirs_to_scan=("agents" "commands" "rules" "skills")

  for dir in "${dirs_to_scan[@]}"; do
    local src="$SCRIPT_DIR/$dir"
    local target="$cursor_home/$dir"
    if [[ -d "$src" ]] && [[ -d "$target" ]]; then
      while IFS= read -r -d '' relpath; do
        relpath="${relpath#./}"
        local loose_file="$target/$relpath"
        if [[ -e "$loose_file" ]]; then
          if [[ "$DRY_RUN" == "true" ]]; then
            log "[dry-run] Would remove legacy file: $loose_file"
          else
            rm -f "$loose_file"
            log "[cleanup] Removed $loose_file"
          fi
        fi
      done < <(cd "$src" && find . -type f -print0)

      if [[ "$DRY_RUN" != "true" ]]; then
        find "$target" -type d -empty -delete 2>/dev/null || true
      fi
    fi
  done

  local legacy_hooks=("$cursor_home/hooks/daemon.ts" "$cursor_home/hooks/mcp-sidecar.ts")
  for f in "${legacy_hooks[@]}"; do
    if [[ -e "$f" ]]; then
      if [[ "$DRY_RUN" == "true" ]]; then
        log "[dry-run] Would remove legacy hook: $f"
      else
        rm -f "$f"
        log "[cleanup] Removed $f"
      fi
    fi
  done

  if [[ -d "$cursor_home/hooks/scripts" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      log "[dry-run] Would remove legacy hooks/scripts/"
    else
      rm -rf "$cursor_home/hooks/scripts"
      log "[cleanup] Removed $cursor_home/hooks/scripts/"
    fi
  fi
}

# --- File operations ---

copy_plugin_files() {
  if [[ "$DRY_RUN" == "true" ]]; then
    if [[ "$DASHBOARD_BUILD_SKIPPED" == "true" ]]; then
      log "[dry-run] Would copy plugin files to $PLUGIN_DIR (skipping hooks/dashboard-ui/dist/)"
    else
      log "[dry-run] Would copy plugin files to $PLUGIN_DIR"
    fi
    return
  fi

  mkdir -p "$PLUGIN_DIR"

  local dirs=(.cursor-plugin agents commands rules skills hooks scripts automations docs)
  for dir in "${dirs[@]}"; do
    local src="$SCRIPT_DIR/$dir"
    [[ -d "$src" ]] || continue
    if [[ "$dir" == "hooks" ]] && [[ "$DASHBOARD_BUILD_SKIPPED" == "true" ]]; then
      copy_hooks_skip_dashboard_dist "$src" "$PLUGIN_DIR/hooks"
      log "[ok] Copied $dir/ (skipped dashboard-ui/dist/)"
    else
      cp -r "$src" "$PLUGIN_DIR/"
      log "[ok] Copied $dir/"
    fi
  done

  local files=(mcp.json sandbox.json worktrees.json README.md ARCHITECTURE.md CONTRIBUTING.md)
  for file in "${files[@]}"; do
    local src="$SCRIPT_DIR/$file"
    if [[ -f "$src" ]]; then
      cp "$src" "$PLUGIN_DIR/"
      log "[ok] Copied $file"
    fi
  done

  write_version_file
  seed_user_config
}

# Copy $src (a hooks/ source tree) into $dest, excluding dashboard-ui/dist/.
# Prefers rsync --exclude; falls back to a find-based enumeration that copies
# every entry whose path does not start with dashboard-ui/dist.
copy_hooks_skip_dashboard_dist() {
  local src="$1" dest="$2"
  mkdir -p "$dest"

  if command -v rsync &>/dev/null; then
    rsync -a \
      --exclude='dashboard-ui/dist' \
      --exclude='dashboard-ui/dist/' \
      "$src/" "$dest/"
    return
  fi

  local entry rel
  while IFS= read -r -d '' entry; do
    rel="${entry#"$src"/}"
    case "$rel" in
      dashboard-ui/dist|dashboard-ui/dist/*) continue ;;
    esac
    if [[ -d "$entry" && ! -L "$entry" ]]; then
      mkdir -p "$dest/$rel"
    else
      mkdir -p "$(dirname "$dest/$rel")"
      cp -P "$entry" "$dest/$rel"
    fi
  done < <(find "$src" -mindepth 1 -print0)
}

seed_user_config() {
  local config_dir="$HOME/.config/oh-my-cursor"
  local config_file="$config_dir/config.jsonc"
  local template="$SCRIPT_DIR/config.default.jsonc"

  if [[ ! -f "$template" ]]; then
    return
  fi

  if [[ -f "$config_file" ]]; then
    log "[skip] User config already exists at $config_file"
    return
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would seed config to $config_file"
    return
  fi

  mkdir -p "$config_dir"
  cp "$template" "$config_file"
  log "[ok] Created config at $config_file"
}

remove_plugin_files() {
  if [[ "$DRY_RUN" == "true" ]]; then
    if [[ "$DASHBOARD_BUILD_SKIPPED" == "true" ]]; then
      log "[dry-run] Would remove $PLUGIN_DIR (preserving hooks/dashboard-ui/dist/)"
    else
      log "[dry-run] Would remove $PLUGIN_DIR"
    fi
    return
  fi

  if [[ "$DASHBOARD_BUILD_SKIPPED" == "true" ]] \
     && [[ -d "$PLUGIN_DIR/hooks/dashboard-ui/dist" ]]; then
    # Preserve hooks/dashboard-ui/dist/ by wiping every sibling path under $PLUGIN_DIR.
    find "$PLUGIN_DIR" -mindepth 1 -maxdepth 1 ! -name hooks -exec rm -rf {} +
    if [[ -d "$PLUGIN_DIR/hooks" ]]; then
      find "$PLUGIN_DIR/hooks" -mindepth 1 -maxdepth 1 ! -name dashboard-ui -exec rm -rf {} +
    fi
    if [[ -d "$PLUGIN_DIR/hooks/dashboard-ui" ]]; then
      find "$PLUGIN_DIR/hooks/dashboard-ui" -mindepth 1 -maxdepth 1 ! -name dist -exec rm -rf {} +
    fi
    log "[ok] Removed $PLUGIN_DIR contents (preserved hooks/dashboard-ui/dist/)"
  else
    rm -rf "$PLUGIN_DIR"
  fi
}

# --- Dashboard UI build ---
#
# build_dashboard_ui: runs `bun install --frozen-lockfile && bunx --bun vite build`
# in hooks/dashboard-ui/. Honors DRY_RUN (logs only) and DASHBOARD_BUILD_SKIPPED
# (no-op). On command failure, sets BUILD_OK=0 and returns non-zero; callers
# decide whether to abort (fresh/force) or continue with dist preserved (update).
build_dashboard_ui() {
  if [[ "$DASHBOARD_BUILD_SKIPPED" == "true" ]]; then
    log "Dashboard build skipped (--skip-dashboard-build)."
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would build dashboard-ui:"
    log "  cd \"$SCRIPT_DIR/hooks/dashboard-ui\" && bun install --frozen-lockfile && bunx --bun vite build"
    return 0
  fi

  if [[ ! -d "$SCRIPT_DIR/hooks/dashboard-ui" ]]; then
    warn "hooks/dashboard-ui not found at $SCRIPT_DIR/hooks/dashboard-ui — skipping build"
    BUILD_OK=0
    return 1
  fi

  log "Building dashboard-ui..."
  if ! ( cd "$SCRIPT_DIR/hooks/dashboard-ui" \
         && bun install --frozen-lockfile \
         && bunx --bun vite build ); then
    BUILD_OK=0
    return 1
  fi

  BUILD_OK=1
  return 0
}

# --- Lock management ---

acquire_lock() {
  if [[ -f "$LOCK_FILE" ]]; then
    local lock_pid
    lock_pid="$(cat "$LOCK_FILE" 2>/dev/null || echo "")"
    if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
      err "Another install is running (PID $lock_pid). If this is stale, remove $LOCK_FILE"
      exit 1
    fi
    rm -f "$LOCK_FILE"
  fi
  echo $$ > "$LOCK_FILE"
}

release_lock() {
  rm -f "$LOCK_FILE"
}

# --- Banners ---

print_success_banner() {
  local ver
  ver="$(get_source_version)"
  echo ""
  log "oh-my-cursor v${ver} installed successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Restart Cursor (Cmd+Shift+P > 'Reload Window' or full restart)"
  echo "  2. Try: /plan add authentication to my app"
  echo "  3. Try: @sisyphus fix the failing tests"
  echo ""
}

print_update_banner() {
  local old_ver="$1"
  local new_ver="$2"
  echo ""
  log "oh-my-cursor updated: v${old_ver} → v${new_ver}"
  echo ""
  echo "Next steps:"
  echo "  1. Restart Cursor (Cmd+Shift+P > 'Reload Window' or full restart)"
  echo ""
}

print_uninstall_banner() {
  echo ""
  log "oh-my-cursor has been completely removed."
  echo ""
}

print_dashboard_state_notice() {
  if [[ "$DASHBOARD_BUILD_FAILED" == "true" ]]; then
    warn "Dashboard build failed; existing dashboard preserved at $PLUGIN_DIR/hooks/dashboard-ui/dist/."
  elif [[ "$DASHBOARD_BUILD_SKIPPED" == "true" ]]; then
    warn "Dashboard build was skipped. /dashboard shell still loads, but /dashboard/assets/* will return 503 until next install."
  fi
}

# --- Trap for cleanup on failure ---

_install_failed=false

cleanup_on_exit() {
  if [[ "$_install_failed" == "true" ]]; then
    warn "Installation failed — attempting to restore backup..."
    restore_backup
  fi
  release_lock
}

# --- Main ---

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

while [[ $# -gt 0 ]]; do
  case $1 in
    --project)              SCOPE="project"; shift ;;
    --force)                FORCE=true; shift ;;
    --dry-run)              DRY_RUN=true; shift ;;
    --uninstall)            MODE="uninstall"; shift ;;
    --version)              MODE="version"; shift ;;
    --check-update)         MODE="check-update"; shift ;;
    --skip-dashboard-build) DASHBOARD_BUILD_SKIPPED=true; shift ;;
    --help|-h)              usage; exit 0 ;;
    *)                      err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ "$SCOPE" == "user" ]]; then
  PLUGIN_DIR="${OH_MY_CURSOR_PLUGIN_DIR:-$HOME/.cursor/plugins/local/$PLUGIN_NAME}"
  MCP_CONFIG="${OH_MY_CURSOR_MCP_CONFIG:-$HOME/.cursor/mcp.json}"
else
  PLUGIN_DIR="${OH_MY_CURSOR_PLUGIN_DIR:-.cursor/plugins/local/$PLUGIN_NAME}"
  MCP_CONFIG="${OH_MY_CURSOR_MCP_CONFIG:-.cursor/mcp.json}"
fi

# --- Mode: version ---

if [[ "$MODE" == "version" ]]; then
  ver="$(get_installed_version)"
  if [[ "$ver" == "none" ]]; then
    echo "oh-my-cursor is not installed"
    exit 1
  fi
  echo "oh-my-cursor v${ver}"
  exit 0
fi

# --- Mode: check-update ---

if [[ "$MODE" == "check-update" ]]; then
  installed="$(get_installed_version)"
  source_ver="$(get_source_version)"
  if [[ "$installed" == "none" ]]; then
    echo "Not installed. Source version: $source_ver"
    exit 1
  fi
  if [[ "$installed" == "$source_ver" ]]; then
    echo "Up to date: v${installed}"
    exit 0
  fi
  echo "Update available: v${installed} → v${source_ver}"
  exit 0
fi

# --- Mode: uninstall ---

if [[ "$MODE" == "uninstall" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would stop daemon"
    log "[dry-run] Would remove plugin dir: $PLUGIN_DIR"
    log "[dry-run] Would remove backup: $PLUGIN_DIR.bak"
    log "[dry-run] Would remove our MCP servers from $MCP_CONFIG"
    log "[dry-run] Would clean up legacy loose files"
    log "[dry-run] Would clean up /tmp/oh-my-cursor-* files"
    exit 0
  fi

  echo "Uninstalling $PLUGIN_NAME..."
  acquire_lock
  trap release_lock EXIT
  stop_daemon
  remove_plugin_files
  [[ -d "$PLUGIN_DIR.bak" ]] && rm -rf "$PLUGIN_DIR.bak"
  unmerge_mcp_config
  cleanup_legacy_loose_files
  # Clean leftover temp files
  rm -f /tmp/oh-my-cursor-* 2>/dev/null || true
  release_lock
  trap - EXIT
  print_uninstall_banner
  exit 0
fi

# --- Mode: auto (install or update) ---

check_prerequisites

if [[ -d "$PLUGIN_DIR" ]] && [[ "$FORCE" != "true" ]]; then
  # Update flow
  installed="$(get_installed_version)"
  source_ver="$(get_source_version)"

  if [[ "$installed" == "$source_ver" ]] && [[ "$FORCE" != "true" ]]; then
    log "oh-my-cursor v${installed} is already up to date."
    exit 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would update oh-my-cursor: v${installed} → v${source_ver}"
    build_dashboard_ui
    log "[dry-run] Would backup $PLUGIN_DIR"
    log "[dry-run] Would stop daemon"
    log "[dry-run] Would remove and re-copy plugin files"
    log "[dry-run] Would merge MCP config"
    log "[dry-run] Would start daemon"
    exit 0
  fi

  echo "Updating $PLUGIN_NAME (v${installed} → v${source_ver})..."
  acquire_lock
  trap cleanup_on_exit EXIT
  _install_failed=true

  # Build BEFORE any destructive operation so the user's existing dashboard
  # survives a failed build. On failure, flip the skip flag so remove/copy
  # both preserve the previously-built $PLUGIN_DIR/hooks/dashboard-ui/dist/.
  if ! build_dashboard_ui; then
    if [[ "$DASHBOARD_BUILD_SKIPPED" != "true" ]]; then
      DASHBOARD_BUILD_SKIPPED=true
      DASHBOARD_BUILD_FAILED=true
      warn "Dashboard build failed; existing dashboard preserved at $PLUGIN_DIR/hooks/dashboard-ui/dist/."
    fi
  fi

  backup_installation
  stop_daemon
  remove_plugin_files
  copy_plugin_files
  merge_mcp_config
  start_daemon || warn "Daemon start failed — plugin files are installed, daemon can be started manually"
  _install_failed=false
  verify_installation || true
  release_lock
  trap - EXIT
  print_update_banner "$installed" "$source_ver"
  print_dashboard_state_notice

elif [[ "$FORCE" == "true" ]] && [[ -d "$PLUGIN_DIR" ]]; then
  # Force reinstall
  source_ver="$(get_source_version)"

  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would force reinstall oh-my-cursor v${source_ver}"
    build_dashboard_ui
    log "[dry-run] Would stop daemon"
    log "[dry-run] Would remove existing $PLUGIN_DIR"
    log "[dry-run] Would clean up legacy loose files"
    log "[dry-run] Would copy plugin files"
    log "[dry-run] Would merge MCP config (force overwrite)"
    log "[dry-run] Would start daemon"
    exit 0
  fi

  echo "Force reinstalling $PLUGIN_NAME v${source_ver}..."
  acquire_lock
  trap cleanup_on_exit EXIT
  _install_failed=true

  # Build BEFORE any destructive operation — abort without touching the
  # existing install if the build fails.
  if ! build_dashboard_ui; then
    _install_failed=false
    release_lock
    trap - EXIT
    err "Dashboard build failed. Fix and re-run, or run with --skip-dashboard-build to install without dashboard."
    exit 1
  fi

  stop_daemon
  remove_plugin_files
  cleanup_legacy_loose_files
  copy_plugin_files
  merge_mcp_config
  start_daemon || warn "Daemon start failed — plugin files are installed, daemon can be started manually"
  _install_failed=false
  verify_installation || true
  release_lock
  trap - EXIT
  print_success_banner
  print_dashboard_state_notice

else
  # Fresh install
  source_ver="$(get_source_version)"

  if [[ "$DRY_RUN" == "true" ]]; then
    log "[dry-run] Would install oh-my-cursor v${source_ver}"
    build_dashboard_ui
    log "[dry-run] Would clean up legacy loose files"
    log "[dry-run] Would copy plugin files to $PLUGIN_DIR"
    log "[dry-run] Would merge MCP config into $MCP_CONFIG"
    log "[dry-run] Would start daemon"
    exit 0
  fi

  echo "Installing $PLUGIN_NAME v${source_ver} (scope: $SCOPE)..."
  acquire_lock
  trap cleanup_on_exit EXIT
  _install_failed=true

  # Build BEFORE any destructive operation — abort without touching
  # $PLUGIN_DIR if the build fails.
  if ! build_dashboard_ui; then
    _install_failed=false
    release_lock
    trap - EXIT
    err "Dashboard build failed. Fix and re-run, or run with --skip-dashboard-build to install without dashboard."
    exit 1
  fi

  cleanup_legacy_loose_files
  copy_plugin_files
  merge_mcp_config
  start_daemon || warn "Daemon start failed — plugin files are installed, daemon can be started manually"
  _install_failed=false
  verify_installation || true
  release_lock
  trap - EXIT
  print_success_banner
  print_dashboard_state_notice
fi
