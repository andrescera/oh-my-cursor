# oh-my-cursor

Multi-agent orchestration for Cursor IDE. Ported from [oh-my-openagent](https://github.com/anomalyco/opencode).

11 specialized agents, persistent hook daemon, dynamic context injection, continuation loops, and a lightweight MCP sidecar -- all running natively in Cursor.

## Quick Start

```bash
# Install to user scope (applies to all Cursor projects)
bash install.sh

# Install to current project only
bash install.sh --project

# Preview changes
bash install.sh --dry-run

# Uninstall
bash install.sh --uninstall
```

## What Gets Installed

| Component | Count | Description |
|-----------|-------|-------------|
| Agents | 11 + protocol | Specialized subagents with model routing |
| Rules | 4 | Orchestrator + coding standards |
| Commands | 9 | Slash commands (/plan, /refactor, /ralph-loop, etc.) |
| Skills | 6 | Domain expertise (git, frontend, browser, review) |
| Hooks | 1 daemon | Persistent Bun HTTP server for all 17 hook events |
| MCP | 4 servers | websearch, context7, grep_app + sidecar |

## Architecture

```
You (root thread)
  └── orchestrator.mdc (always-apply rule)
       │
       ├── Intent Gate: what did the user ask?
       │
       ├── Task(explore) ──── Codebase search (fast, readonly, background)
       ├── Task(librarian) ── External docs search (fast, readonly, background)
       ├── Task(sisyphus) ─── Complex multi-file work (opus-max-thinking)
       ├── Task(hephaestus) ─ Sustained deep work (sonnet-medium-thinking)
       ├── Task(atlas) ────── Plan execution via delegation (sonnet-medium-thinking)
       ├── Task(prometheus) ─ Strategic planning (opus-max-thinking)
       ├── Task(oracle) ───── Architecture consultation (opus-high-thinking, readonly)
       ├── Task(metis) ────── Pre-planning gap analysis (opus-max-thinking, readonly)
       ├── Task(momus) ────── Plan review (opus-max-thinking, readonly)
       ├── Task(sisyphus-junior) ── Quick focused tasks (sonnet-medium-thinking)
       └── Task(multimodal-looker) ── Visual analysis (inherit, readonly)
```

## Agents

| Agent | Model | Role |
|-------|-------|------|
| **sisyphus** | claude-4.6-opus-max-thinking | Main orchestrator + deep worker |
| **hephaestus** | claude-4.6-sonnet-medium-thinking | Autonomous deep worker |
| **atlas** | claude-4.6-sonnet-medium-thinking | Todo-list orchestrator |
| **prometheus** | claude-4.6-opus-max-thinking | Strategic planner |
| **oracle** | claude-4.6-opus-high-thinking | Architecture consultant (readonly) |
| **metis** | claude-4.6-opus-max-thinking | Pre-planning analysis (readonly) |
| **momus** | claude-4.6-opus-max-thinking | Plan reviewer (readonly) |
| **explore** | fast | Codebase search (readonly, background) |
| **librarian** | fast | External docs search (readonly, background) |
| **sisyphus-junior** | claude-4.6-sonnet-medium-thinking | Quick task executor |
| **multimodal-looker** | inherit | Visual file analysis (readonly) |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/plan` | Create a strategic work plan with Prometheus |
| `/start-work` | Execute an existing plan with Atlas |
| `/refactor` | Intelligent refactoring with LSP + AST-grep |
| `/init-deep` | Generate hierarchical AGENTS.md files |
| `/ralph-loop` | Self-referential loop until task completion |
| `/cancel-ralph` | Cancel active Ralph loop |
| `/stop-continuation` | Stop all continuation mechanisms |
| `/handoff` | Create context summary for new session |
| `/remove-ai-slops` | Remove AI code smells from branch changes |

## Hook Daemon

All hooks run through a persistent Bun HTTP server (clooks pattern) for zero subprocess overhead.

**Features:**
- Session state tracking (in-memory)
- Ralph loop auto-continuation (loop_limit: null)
- Subagent dispatch limits (max 5 explore, max 8 workers)
- Dynamic .mdc context injection
- Dangerous command blocking
- Sensitive file access guards
- Long thinking block logging

**Start manually:** `bun run hooks/daemon.ts`
**Auto-start:** The daemon launches automatically on first `sessionStart` via `hooks/scripts/start-daemon.sh`

## MCP Sidecar

3 tools not available in Cursor's built-in tool set:

- **look_at** -- Visual file analysis (images, PDFs, diagrams)
- **interactive_bash** -- Persistent tmux session management
- **skill_mcp** -- Skill-embedded MCP server management

**Start:** `bun run hooks/mcp-sidecar.ts`

## Coverage vs OpenCode

This plugin achieves ~92-95% of oh-my-openagent's functionality using Cursor's native APIs.

**What works natively:** Agents, model routing with thinking variants, sub-agent orchestration, background agents, skills, commands, rules, context injection, continuation loops, session management via ACP, Cloud Agent automations.

**Irreducible gap (~5-8%):** Provider-level config, fine-grained per-request effort control, session tree opacity, programmatic model switching mid-session.

## Credits

Ported from [oh-my-openagent](https://github.com/anomalyco/opencode) (OpenCode plugin).
Inspired by [oh-my-cursor](https://github.com/tmcfarlane/oh-my-cursor) orchestration patterns.

## License

MIT
