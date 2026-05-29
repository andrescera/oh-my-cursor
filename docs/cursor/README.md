# Cursor 3.x Native Features Reference

All documentation targets **Cursor 3.6.21** (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10). Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

## Evidence taxonomy

Statements in this documentation may be tagged by source type:

- **[official-doc]** — Published Cursor documentation or product copy.
- **[changelog]** — Release notes or changelog entries.
- **[staff-forum]** — Staff or maintainer statements in forums, Discord, or similar channels.
- **[repro-local]** — Verified locally in this version (reproducible setup).
- **[binary-only]** — Inferred from shipped binaries or bundles; not guaranteed as a supported or documented API. **Not a stable feature.**
- **[community]** — Third-party reports, reverse engineering, or unverified community claims. **Not a stable feature.**

Items tagged **[binary-only]** or **[community]** are exploratory or implementation-detail territory. Do not treat them as contractual product behavior.

## How to read

Pages are grouped by feature area. Each page explains what the capability is, how oh-my-cursor uses it today, and what related options or surfaces exist beyond that usage.

## Feature index

| # | Page | Topic |
|---|------|-------|
| 01 | [Modes & Switching](01-modes-and-switching.md) | Mode switching matrix (UI, CLI, ACP, SwitchMode tool) |
| 02 | [Agent System](02-agent-system.md) | Agents, subagents, Task tool, custom agents |
| 03 | [Hooks](03-hooks.md) | Hook events, lifecycle, configuration, sharp edges |
| 04 | [Rules & AGENTS.md](04-rules-and-agentsmd.md) | Rule types, precedence, team rules, remote rules |
| 05 | [Skills](05-skills.md) | Skill system, paths, YAML frontmatter, migration |
| 06 | [Commands](06-commands.md) | Slash commands, /worktree, /best-of-n |
| 07 | [MCP](07-mcp.md) | MCP transports, Apps, OAuth, permissions.json |
| 08 | [Plan System](08-plan-system.md) | Plan files, cursorPlan URI, plan UI integration |
| 09 | [CLI](09-cli.md) | CLI flags, agent acp, print mode, cloud |
| 10 | [ACP](10-acp.md) | Agent Control Protocol methods and schemas |
| 11 | [Cloud Agents API](11-cloud-agents-api.md) | HTTP API endpoints, auth, webhooks |
| 12 | [Plugin System](12-plugin-system.md) | .cursor-plugin manifest, sandbox, directory layout |
| 13 | [Agents Window](13-agents-window.md) | Agents Window, Design Mode, Agent Tabs, voice |
| 14 | [Extension API](14-extension-api.md) | Cursor vscode.d.ts additions, API proposals, extensions |
| 15 | [Settings & Flags](15-settings-and-flags.md) | cursor.* settings, feature flags, Statsig |
| 16 | [Binary Analysis](16-binary-analysis.md) | .asar unpacking, internal modules, build flags |
| 17 | [Community Discoveries](17-community-discoveries.md) | RPC reverse engineering, proxy techniques (non-normative) |
| 18 | [Adoption Matrix](18-adoption-matrix.md) | Feature x oh-my-cursor status matrix |
| 19 | [Known Sharp Edges](19-known-sharp-edges.md) | Bugs, gotchas, version-dependent behavior |

## Quick adoption summary

oh-my-cursor currently uses: custom agents, hooks (18 events), slash commands, rules (.mdc), skills, MCP sidecar, native tools (AskQuestion, TodoWrite, SwitchMode), plan system, and plugin manifest. See [Adoption Matrix](18-adoption-matrix.md) for the full breakdown.

## Related docs

- [Subagent latency research](../internal/subagent-latency-research.md) — separate from this reference; covers orchestration and latency, not Cursor 3.x surface documentation.
