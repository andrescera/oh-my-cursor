# Install

Install oh-my-cursor in any Cursor IDE project.

## Prerequisites

- **bun** (required) — hook daemon and MCP sidecar runtime
- **python3** or **jq** (recommended) — JSON merge during install
- **curl** (Linux/macOS install)

## Linux / macOS

```bash
git clone https://github.com/andrescera/oh-my-cursor.git
cd oh-my-cursor
./install.sh
```

Default: user scope under `~/.cursor/`. Project-only:

```bash
./install.sh --project
```

| Flag | Effect |
|------|--------|
| `--project` | Install to `.cursor/` in the current working directory |
| `--dry-run` | Print planned actions; no writes |
| `--force` | Fresh install over existing |
| `--uninstall` | Remove oh-my-cursor |
| `--version` | Installed version |
| `--check-update` | Installed version vs this checkout |

Installer merges MCP entries for `websearch`, `context7`, `grep_app`, `oh-my-cursor` into the target `mcp.json` without dropping unrelated servers.

## Windows

```powershell
git clone https://github.com/andrescera/oh-my-cursor.git
cd oh-my-cursor
.\install.ps1
```

| Switch | Effect |
|--------|--------|
| `-Scope user` | Default; user-level Cursor config |
| `-Scope project` | `.cursor/` in the current directory |
| `-DryRun` | Preview only |
| `-Force` | Fresh install |
| `-Uninstall` | Remove oh-my-cursor |
| `-Version` | Installed version |
| `-CheckUpdate` | Compare to this checkout |

## For AI Assistants

If you are an AI coding assistant installing oh-my-cursor for a user, follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/andrescera/oh-my-cursor.git /tmp/oh-my-cursor
   ```
2. Run the installer:
   ```bash
   bash /tmp/oh-my-cursor/install.sh
   ```
3. The daemon starts automatically on the next Cursor session via the `sessionStart` hook.
4. Verify the install by running `/status` in Cursor chat.
5. Try `/help` for an overview of available agents and commands.
6. Try `/plan add authentication to my app` to see planning in action.

## Uninstall

```bash
./install.sh --uninstall
```

## Configuration

Two-layer JSONC config, merged in order: defaults → user → project.

- User config: `~/.config/oh-my-cursor/config.jsonc`
- Project config: `.cursor/oh-my-cursor.jsonc`

See `config.default.jsonc` for all options, or run `/config` in Cursor to view the active merged config.
