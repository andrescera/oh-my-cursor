#!/usr/bin/env bash
set -euo pipefail

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

if [[ "$SCOPE" == "user" ]]; then
  DEST="$HOME/.cursor"
else
  DEST=".cursor"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "$UNINSTALL" == "true" ]]; then
  echo "Uninstalling oh-my-cursor..."
  rm -rf "$DEST/agents/sisyphus.md" "$DEST/agents/hephaestus.md" "$DEST/agents/oracle.md" \
    "$DEST/agents/librarian.md" "$DEST/agents/explore.md" "$DEST/agents/multimodal-looker.md" \
    "$DEST/agents/metis.md" "$DEST/agents/momus.md" "$DEST/agents/atlas.md" \
    "$DEST/agents/prometheus.md" "$DEST/agents/sisyphus-junior.md" \
    "$DEST/agents/protocols/coordinator.md" \
    "$DEST/rules/orchestrator.mdc" "$DEST/rules/coding-standards.mdc" \
    "$DEST/rules/anti-patterns.mdc" "$DEST/rules/modular-code-enforcement.mdc" \
    "$DEST/hooks/daemon.ts" "$DEST/hooks/mcp-sidecar.ts" "$DEST/hooks.json" "$DEST/hooks/scripts/"
  echo "Done. oh-my-cursor files removed."
  exit 0
fi

copy_file() {
  local src="$1" dst="$2"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] Would copy: $src -> $dst"
    return
  fi
  if [[ -f "$dst" && "$FORCE" != "true" ]]; then
    echo "[skip] $dst already exists (use --force to overwrite)"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "[ok] $dst"
}

echo "Installing oh-my-cursor (scope: $SCOPE)..."
echo ""

echo "==> Agents"
for agent in sisyphus hephaestus oracle librarian explore multimodal-looker metis momus atlas prometheus sisyphus-junior; do
  copy_file "$SCRIPT_DIR/agents/$agent.md" "$DEST/agents/$agent.md"
done
copy_file "$SCRIPT_DIR/agents/protocols/coordinator.md" "$DEST/agents/protocols/coordinator.md"

echo ""
echo "==> Rules"
for rule in orchestrator coding-standards anti-patterns modular-code-enforcement; do
  copy_file "$SCRIPT_DIR/rules/$rule.mdc" "$DEST/rules/$rule.mdc"
done

echo ""
echo "==> Commands"
for cmd in ralph-loop start-work refactor init-deep handoff stop-continuation remove-ai-slops plan cancel-ralph; do
  copy_file "$SCRIPT_DIR/commands/$cmd.md" "$DEST/commands/$cmd.md"
done

echo ""
echo "==> Skills"
for skill in git-master frontend-ui-ux dev-browser agent-browser review-work ai-slop-remover; do
  if [[ -d "$SCRIPT_DIR/skills/$skill" ]]; then
    mkdir -p "$DEST/skills/$skill"
    cp -r "$SCRIPT_DIR/skills/$skill/"* "$DEST/skills/$skill/" 2>/dev/null || true
    echo "[ok] $DEST/skills/$skill/"
  fi
done

echo ""
echo "==> Hooks"
copy_file "$SCRIPT_DIR/hooks/daemon.ts" "$DEST/hooks/daemon.ts"
copy_file "$SCRIPT_DIR/hooks/hooks.json" "$DEST/hooks.json"
mkdir -p "$DEST/hooks/scripts"
copy_file "$SCRIPT_DIR/hooks/scripts/start-daemon.sh" "$DEST/hooks/scripts/start-daemon.sh"
copy_file "$SCRIPT_DIR/hooks/scripts/context-injector.ts" "$DEST/hooks/scripts/context-injector.ts"
chmod +x "$DEST/hooks/scripts/start-daemon.sh" 2>/dev/null || true

echo ""
echo "==> MCP Sidecar"
copy_file "$SCRIPT_DIR/hooks/mcp-sidecar.ts" "$DEST/hooks/mcp-sidecar.ts"

echo ""
echo "==> Config"
if [[ "$SCOPE" == "project" ]]; then
  copy_file "$SCRIPT_DIR/mcp.json" ".cursor/mcp.json"
  copy_file "$SCRIPT_DIR/sandbox.json" ".cursor/sandbox.json"
fi

echo ""
echo "oh-my-cursor installed successfully!"
echo ""
echo "Next steps:"
echo "  1. Open a project in Cursor"
echo "  2. The orchestrator rule will activate automatically"
echo "  3. Try: /plan add authentication to my app"
echo "  4. Try: @sisyphus fix the failing tests"
