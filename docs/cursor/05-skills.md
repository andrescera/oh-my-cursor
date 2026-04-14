# Skills

> Cursor 3.0.16. Evidence tags per claim.

## Overview

**Agent Skills** are reusable workflow instructions. They differ from **rules**: skills target multi-step or complex workflows; rules are short, always-on guidelines. [official-doc]

## Paths (searched in order)

Cursor discovers skills from these locations, in order: [official-doc]

- `.cursor/skills/`
- `.agents/skills/`
- `~/.cursor/skills/`
- **Compatibility:** `.claude/skills/`, `.codex/skills/`

## SKILL.md format

- **YAML frontmatter** (fields documented by Cursor): `name` (required), `description` (required), `license`, `compatibility`, `metadata`, `disable-model-invocation` [official-doc]
- **Optional subdirectories:** `scripts/`, `references/`, `assets/` [official-doc]
- **Invocation:** `/skill-name` or `@skill-name` [official-doc]

## Cursor-shipped skills

Shipped skill bundles live under `~/.cursor/skills-cursor/<skill-id>/`, each with a `SKILL.md`. [repro-local]

Observed skill ids on disk (same tree): `babysit`, `create-hook`, `create-rule`, `create-skill`, `create-subagent`, `migrate-to-skills`, `shell`, `statusline`, `update-cli-config`, `update-cursor-settings`. [repro-local]

**Manifest:** `~/.cursor/skills-cursor/.cursor-managed-skills-manifest.json` — JSON object with `builtinSkillIds` and `managedSkillIds`. Which ids appear in each array can differ by install/version; it does not necessarily enumerate every folder under `skills-cursor/`. [repro-local]

## Migration

Use the **`/migrate-to-skills`** command (Cursor 2.4+). [official-doc]

## UI

**Cursor Settings → Rules → Agent Decides** controls skill visibility to the model. Skills can be installed from GitHub via **Remote Rule**. [official-doc]

## skill_mcp

The **oh-my-cursor** MCP sidecar exposes a **`skill_mcp`** tool that loads skill content for the agent (see `hooks/mcp-sidecar.ts` in this repo). [repro-local]

## oh-my-cursor usage

The **oh-my-cursor** plugin ships **seven** skills under `~/.cursor/plugins/local/oh-my-cursor/skills/` (when installed from this project): `agent-browser`, `ai-slop-remover`, `dev-browser`, `frontend-ui-ux`, `git-master`, `playwright`, `review-work`. [repro-local]
