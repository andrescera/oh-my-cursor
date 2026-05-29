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

## Cursor 3.1 → 3.6 changes

### SK-01 · Pin Skills as Quick-Action Pills

- **Version:** 3.3 (May 7, 2026)
- **Evidence:** `[official-doc]`
- Skills can be pinned as quick-action pills above the chat input for one-click invocation. Pinned skills persist across sessions and projects, significantly improving discoverability for frequently used skills such as `create-hook`, `canvas`, `split-to-prs`, and similar oh-my-cursor skills.

### SK-02 · `/loop` Skill — Local Long-Running Agent Loop

- **Version:** 3.5 (May 20, 2026)
- **Evidence:** `[official-doc]`
- The `/loop` skill runs a prompt repeatedly on a local schedule. If no fixed interval is specified, the agent decides when/what event should wake it next. Examples: "check deploy status every 5 minutes", "work on this feature until tests pass." Directly corresponds to oh-my-cursor's own `loop` skill (`~/.cursor/skills-cursor/loop/SKILL.md`).

### SK-03 · `/update-cli-config` Skill

- **Version:** ~3.1 (Apr 14, 2026 CLI release)
- **Evidence:** `[official-doc]`
- Native skill that applies CLI configuration changes on behalf of the user from within a conversation. Referenced in the CLI changelog: "You can also ask Cursor to apply configuration changes for you using the /update-cli-config skill." The skill id `update-cli-config` is already present in the shipped skills bundle under `~/.cursor/skills-cursor/`.

### SK-04 · Cursor SDK `/sdk` Skill

- **Version:** Apr 29, 2026
- **Evidence:** `[official-doc]`
- A native `/sdk` skill helps users start building with `@cursor/sdk`. It bootstraps agent code from within Cursor, providing a guided entry point for programmatic agent automation outside the IDE. Closely related to the SDK launch (see `docs/cursor/11-cloud-agents-api.md`).
