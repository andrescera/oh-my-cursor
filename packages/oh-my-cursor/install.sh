#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="oh-my-cursor"
PLUGIN_ID="${PLUGIN_NAME}@local"
DEFAULT_PORT=47847

SCOPE="user"
FORCE=false
DRY_RUN=false
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) SCOPE="project"; shift ;;
    --force) FORCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --uninstall) UNINSTALL=true; shift ;;
    *) shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "$SCOPE" == "user" ]]; then
  PLUGIN_DIR="$HOME/.cursor/plugins/local/$PLUGIN_NAME"
else
  PLUGIN_DIR=".cursor/plugins/local/$PLUGIN_NAME"
fi

CLAUDE_PLUGINS="$HOME/.claude/plugins/installed_plugins.json"
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

OLD_AGENT_FILES=(
  "$HOME/.cursor/agents/sisyphus.md"
  "$HOME/.cursor/agents/hephaestus.md"
  "$HOME/.cursor/agents/oracle.md"
  "$HOME/.cursor/agents/librarian.md"
  "$HOME/.cursor/agents/explore.md"
  "$HOME/.cursor/agents/multimodal-looker.md"
  "$HOME/.cursor/agents/metis.md"
  "$HOME/.cursor/agents/momus.md"
  "$HOME/.cursor/agents/atlas.md"
  "$HOME/.cursor/agents/prometheus.md"
  "$HOME/.cursor/agents/sisyphus-junior.md"
  "$HOME/.cursor/agents/protocols/coordinator.md"
  "$HOME/.cursor/rules/orchestrator.mdc"
  "$HOME/.cursor/rules/coding-standards.mdc"
  "$HOME/.cursor/rules/anti-patterns.mdc"
  "$HOME/.cursor/rules/modular-code-enforcement.mdc"
  "$HOME/.cursor/commands/cancel-ralph.md"
  "$HOME/.cursor/commands/handoff.md"
  "$HOME/.cursor/commands/init-deep.md"
  "$HOME/.cursor/commands/deep-plan.md"
  "$HOME/.cursor/commands/ralph-loop.md"
  "$HOME/.cursor/commands/refactor.md"
  "$HOME/.cursor/commands/remove-ai-slops.md"
  "$HOME/.cursor/commands/start-work.md"
  "$HOME/.cursor/commands/stop-continuation.md"
  "$HOME/.cursor/hooks.json"
  "$HOME/.cursor/hooks/daemon.ts"
  "$HOME/.cursor/hooks/mcp-sidecar.ts"
)

OLD_SKILL_DIRS=(
  "$HOME/.cursor/skills/agent-browser"
  "$HOME/.cursor/skills/ai-slop-remover"
  "$HOME/.cursor/skills/dev-browser"
  "$HOME/.cursor/skills/frontend-ui-ux"
  "$HOME/.cursor/skills/git-master"
  "$HOME/.cursor/skills/review-work"
)

cleanup_old_files() {
  for f in "${OLD_AGENT_FILES[@]}"; do
    [[ -e "$f" ]] && rm -f "$f" && echo "[cleanup] Removed $f"
  done
  [[ -d "$HOME/.cursor/hooks/scripts" ]] && rm -rf "$HOME/.cursor/hooks/scripts" && echo "[cleanup] Removed ~/.cursor/hooks/scripts/"
  for d in "${OLD_SKILL_DIRS[@]}"; do
    [[ -d "$d" ]] && rm -rf "$d" && echo "[cleanup] Removed $d/"
  done
}

if [[ "$UNINSTALL" == "true" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] Would remove plugin dir: $PLUGIN_DIR"
    echo "[dry-run] Would remove entry from $CLAUDE_PLUGINS"
    echo "[dry-run] Would remove entry from $CLAUDE_SETTINGS"
    echo "[dry-run] Would clean up legacy loose files"
    exit 0
  fi

  echo "Uninstalling $PLUGIN_NAME..."

  [[ -d "$PLUGIN_DIR" ]] && rm -rf "$PLUGIN_DIR" && echo "[ok] Removed $PLUGIN_DIR"

  if [[ -f "$CLAUDE_PLUGINS" ]]; then
    python3 - "$CLAUDE_PLUGINS" "$PLUGIN_ID" <<'EOF'
import sys, json

path, plugin_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)

if "plugins" in data and plugin_id in data["plugins"]:
    del data["plugins"][plugin_id]
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[ok] Removed {plugin_id} from installed_plugins.json")
EOF
  fi

  if [[ -f "$CLAUDE_SETTINGS" ]]; then
    python3 - "$CLAUDE_SETTINGS" "$PLUGIN_ID" <<'EOF'
import sys, json

path, plugin_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)

enabled = data.get("enabledPlugins", {})
if plugin_id in enabled:
    del enabled[plugin_id]
    data["enabledPlugins"] = enabled
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[ok] Removed {plugin_id} from settings.json enabledPlugins")
EOF
  fi

  cleanup_old_files
  echo "Done."
  exit 0
fi

if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required but not found." >&2
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] Would clean up legacy loose files"
  echo "[dry-run] Would install plugin to: $(cd "$(dirname "$PLUGIN_DIR")" 2>/dev/null && pwd || echo "$PLUGIN_DIR" | xargs dirname)/$(basename "$PLUGIN_DIR")"
  echo "[dry-run] Would register in: $CLAUDE_PLUGINS"
  echo "[dry-run] Would enable in: $CLAUDE_SETTINGS"
  exit 0
fi

echo "Installing $PLUGIN_NAME (scope: $SCOPE)..."
echo ""

echo "==> Step 1: Cleaning up legacy loose files"
cleanup_old_files

echo ""
echo "==> Step 2: Copying plugin package"

PLUGIN_DIR_ABS="$(python3 -c "import os; print(os.path.abspath('$PLUGIN_DIR'))")"

if [[ -d "$PLUGIN_DIR_ABS" ]]; then
  if [[ "$FORCE" == "true" ]]; then
    rm -rf "$PLUGIN_DIR_ABS"
    echo "[ok] Removed existing plugin dir (--force)"
  fi
fi

mkdir -p "$PLUGIN_DIR_ABS"

for dir in .cursor-plugin agents commands rules skills hooks scripts automations; do
  src="$SCRIPT_DIR/$dir"
  if [[ -d "$src" ]]; then
    cp -r "$src" "$PLUGIN_DIR_ABS/"
    echo "[ok] Copied $dir/"
  fi
done

for file in mcp.json sandbox.json README.md DEEPLINKS.md worktrees.json; do
  src="$SCRIPT_DIR/$file"
  if [[ -f "$src" ]]; then
    cp "$src" "$PLUGIN_DIR_ABS/"
    echo "[ok] Copied $file"
  fi
done

echo ""
echo "==> Step 3: Registering in installed_plugins.json"

mkdir -p "$(dirname "$CLAUDE_PLUGINS")"

python3 - "$CLAUDE_PLUGINS" "$PLUGIN_ID" "$PLUGIN_DIR_ABS" "$SCOPE" <<'EOF'
import sys, json, os

path, plugin_id, install_path, scope = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

if os.path.exists(path):
    with open(path) as f:
        content = f.read().strip()
    data = json.loads(content) if content else {}
else:
    data = {}

data.setdefault("version", 2)
data.setdefault("plugins", {})

data["plugins"][plugin_id] = [{"scope": scope, "installPath": install_path}]

with open(path, "w") as f:
    json.dump(data, f, indent=2)

print(f"[ok] Registered {plugin_id} in installed_plugins.json")
EOF

echo ""
echo "==> Step 4: Enabling in settings.json"

python3 - "$CLAUDE_SETTINGS" "$PLUGIN_ID" <<'EOF'
import sys, json, os

path, plugin_id = sys.argv[1], sys.argv[2]

if os.path.exists(path):
    with open(path) as f:
        content = f.read().strip()
    data = json.loads(content) if content else {}
else:
    data = {}

data.setdefault("enabledPlugins", {})
data["enabledPlugins"][plugin_id] = True

with open(path, "w") as f:
    json.dump(data, f, indent=2)

print(f"[ok] Enabled {plugin_id} in settings.json")
EOF

echo ""
echo "oh-my-cursor installed successfully!"
echo ""
echo "Next steps:"
echo "  1. Restart Cursor (Cmd+Shift+P > \"Reload Window\" or full restart)"
echo "  2. Enable \"Include third-party Plugins\" in Settings > Features (if not already on)"
echo "  3. Try: /deep-plan add authentication to my app"
echo "  4. Try: @sisyphus fix the failing tests"
