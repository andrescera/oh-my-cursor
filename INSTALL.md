# Install

Install oh-my-cursor for your Cursor user profile.

## Prerequisites

- **bun** ≥ 1.1 (required) — hook daemon, MCP sidecar runtime, and the dashboard UI build
- **python3** or **jq** (recommended) — JSON merge during install
- **curl** (Linux/macOS install)

## Dashboard UI build

The installer compiles the dashboard SPA in `hooks/dashboard-ui/` (Vite 8 + React 19 + Tailwind v4 + shadcn/ui + Zustand 5) before copying plugin files. The build runs `bun install --frozen-lockfile && bunx --bun vite build` in `hooks/dashboard-ui/` and produces `dist/assets/dashboard.js`, `dist/assets/dashboard.css`, and a chunked vendor bundle. The daemon serves these from `GET /dashboard/assets/*`; the MCP resource `ui://oh-my-cursor/dashboard` and `GET /dashboard` return a thin shell HTML that loads them.

| Flag | Switch | Effect |
|------|--------|--------|
| `--skip-dashboard-build` | `-SkipDashboardBuild` | Skip the build step entirely. On fresh / `--force` installs, `/dashboard/assets/*` returns **503 "Dashboard assets not built"** and `GET /dashboard` shows a "not built" page until the next install. On updates, any existing `hooks/dashboard-ui/dist/` under the install directory is **preserved** so the previous build keeps serving. |

The build runs **before** any destructive install action; if it fails (fresh / force), the installer aborts without touching the existing install. On updates, a build failure is non-fatal — the installer keeps going and the previously-installed `dist/` continues to serve.

### Troubleshooting

- **`bun: command not found`** — install Bun (`curl -fsSL https://bun.sh/install | bash`) and retry, or use `--skip-dashboard-build` / `-SkipDashboardBuild` to defer the build.
- **`Dashboard build failed.`** — re-run `bun install --frozen-lockfile && bunx --bun vite build` inside `hooks/dashboard-ui/` to see the underlying error. Lockfile drift is the most common cause; run `bun install` (without `--frozen-lockfile`) once and commit `bun.lock`.
- **`/dashboard` shows "Dashboard assets not built"** — you ran the installer with `--skip-dashboard-build` and there is no pre-existing `dist/`. Re-run the installer without the flag.
- **Hot reload while developing** — `cd hooks/dashboard-ui && bun run dev` (Vite dev server). See [`hooks/dashboard-ui/README.md`](hooks/dashboard-ui/README.md).

## Linux / macOS

```bash
git clone https://github.com/andrescera/oh-my-cursor.git
cd oh-my-cursor
./install.sh
```

| Flag | Effect |
|------|--------|
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

See [Known Sharp Edges](docs/cursor/19-known-sharp-edges.md) for Cursor-specific operational constraints.
