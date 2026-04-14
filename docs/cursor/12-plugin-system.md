# Plugin System

> Cursor 3.0.16. Evidence tags per claim.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Overview

Cursor **plugins** bundle first-class project assets: **rules**, **skills**, **agents**, **commands**, **hooks**, and **MCP** definitions, distributed as a single installable unit. [official-doc]

## Manifest (`plugin.json`) — this repository

Path: `.cursor-plugin/plugin.json`. [repro-local]

```json
{
  "name": "oh-my-cursor",
  "version": "0.3.0",
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

## oh-my-cursor as a plugin

This project ships **oh-my-cursor** as a Cursor plugin (manifest above), extending the editor with orchestration commands, hooks, and MCP sidecar integration. [repro-local]
