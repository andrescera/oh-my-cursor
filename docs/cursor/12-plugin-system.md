# Plugin System

> Cursor 3.6.21 (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10). Evidence tags per claim. Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Overview

Cursor **plugins** bundle first-class project assets: **rules**, **skills**, **agents**, **commands**, **hooks**, and **MCP** definitions, distributed as a single installable unit. [official-doc]

## Manifest (`plugin.json`) — this repository

Path: `.cursor-plugin/plugin.json`. [repro-local]

```json
{
  "name": "oh-my-cursor",
  "version": "0.6.0",
  "description": "Multi-agent orchestration for Cursor. 11 specialized agents, persistent hook daemon, dynamic context injection, and continuation loops. Ported from oh-my-openagent.",
  "author": {
    "name": "oh-my-openagent contributors"
  },
  "repository": "https://github.com/andrescera/oh-my-cursor",
  "license": "SUL-1.0",
  "keywords": [
    "multi-agent",
    "orchestration",
    "hooks",
    "subagents",
    "planning",
    "daemon",
    "mcp",
    "health-monitoring",
    "auto-restart",
    "native-cursor"
  ],
  "agents": "./agents/",
  "commands": "./commands/",
  "skills": "./skills/",
  "rules": "./rules/",
  "hooks": "./hooks/hooks.json"
}
```

## Sandbox (`sandbox.json`) — this repository

Path: `sandbox.json` (workspace root). Declares **network allowlist** hosts and **additional read/write paths** for the plugin sandbox. No secrets are stored in this file. [repro-local]

```json
{
  "networking": {
    "allow": [
      "*.exa.ai",
      "mcp.context7.com",
      "mcp.grep.app",
      "api.anthropic.com",
      "api.openai.com"
    ]
  },
  "additionalReadwritePaths": [
    "/tmp/oh-my-cursor-*"
  ]
}
```

## Directory layout (this plugin)

Relative to the repo root (see manifest paths):

- `agents/` — bundled subagent definitions [repro-local]
- `commands/` — slash commands [repro-local]
- `skills/` — Agent Skills [repro-local]
- `rules/` — Cursor rules [repro-local]
- `hooks/hooks.json` — hook configuration entry [repro-local]
- `hooks/dashboard-ui/` — Vite + React + Tailwind + shadcn/ui dashboard SPA built during install; `dist/` is what the daemon serves [repro-local]

## Build-during-install

`install.sh` and `install.ps1` build [`hooks/dashboard-ui/`](../../hooks/dashboard-ui/) **before** any destructive install action by running `bun install --frozen-lockfile && bunx --bun vite build` inside that directory. The artefacts (`dist/assets/dashboard.js`, `dist/assets/dashboard.css`, chunked vendor bundles) are then copied alongside the rest of the plugin and served by the daemon at `GET /dashboard/assets/*`. The shell HTML at `GET /dashboard` and the MCP resource `ui://oh-my-cursor/dashboard` boot the bundle. [repro-local]

| Scenario | Behavior on build failure |
|----------|--------------------------|
| Fresh install / `--force` / `-Force` | Installer aborts before touching the existing install. |
| Update | Build failure is non-fatal; the previously-installed `hooks/dashboard-ui/dist/` keeps serving. |
| `--skip-dashboard-build` / `-SkipDashboardBuild` | Build step is skipped; on update, any existing `dist/` is preserved; on fresh / force, `/dashboard/assets/*` returns **503** until the next install. |

See [`INSTALL.md`](../../INSTALL.md#dashboard-ui-build) for the user-facing flag reference and [`hooks/dashboard-ui/README.md`](../../hooks/dashboard-ui/README.md) for the contributor build workflow. [repro-local]

## oh-my-cursor as a plugin

This project ships **oh-my-cursor** as a Cursor plugin (manifest above), extending the editor with orchestration commands, hooks, and MCP sidecar integration. [repro-local]

## Cursor 3.1 → 3.6 changes

> **last-verified: 3.6.21** — Re-audited 2026-05-29. Evidence tags per item. Source: `docs/internal/reaudit-3621/feature-discovery-3.1-3.6.md`. <!-- last-verified: 3.6.21 -->

### R-02 · Plugin bundle components + distribution modes `[official-doc]`

- **Version:** May 1, 2026 (between 3.2 and 3.3)
- Team Marketplace plugins can bundle any combination of: **MCP servers**, **skills**, **subagents**, **rules**, and **hooks**. Rules are now a first-class bundleable asset alongside the other plugin components already listed in the manifest format above.
- Three distribution modes control how bundled assets are applied to plugin recipients:
  - **Default Off** — assets are installed but inactive; individual users opt-in per-asset.
  - **Default On** — assets activate on install; individual users can opt-out.
  - **Required** — assets are enforced by the team admin and cannot be disabled locally.
