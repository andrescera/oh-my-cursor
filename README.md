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
| Commands | 11 | Slash commands (/deep-plan, /ulw-loop, /refactor, /ralph-loop, etc.) |
| Skills | 7 | Domain expertise (git, frontend, browser, review, playwright) |
| Hooks | 1 daemon | Persistent Bun HTTP server; 30+ hook handlers in daemon |
| MCP | 4 servers | websearch, context7, grep_app + sidecar |

## Architecture

```
You (root thread)
  └── orchestrator.mdc (always-apply rule)
       │
       ├── Intent Gate: what did the user ask?
       │
       ├── Task(explore) ──── Codebase search (gemini-3-flash, readonly, background)
       ├── Task(librarian) ── External docs search (fast / latest Composer, readonly, background)
       ├── Task(sisyphus) ─── Complex multi-file work (opus-max-thinking)
       ├── Task(hephaestus) ─ Sustained deep work (gpt-5.4)
       ├── Task(atlas) ────── Plan execution via delegation (sonnet-medium-thinking)
       ├── Task(prometheus) ─ Strategic planning (opus-max-thinking)
       ├── Task(oracle) ───── Architecture consultation (gpt-5.4, readonly)
       ├── Task(metis) ────── Pre-planning gap analysis (opus-max-thinking, readonly)
       ├── Task(momus) ────── Plan review (gpt-5.4, readonly)
       ├── Task(sisyphus-junior) ── Quick focused tasks (sonnet-medium-thinking)
       └── Task(multimodal-looker) ── Visual analysis (gemini-3.1-pro, readonly)
```

## Agents

| Agent | Model | Role |
|-------|-------|------|
| **sisyphus** | claude-4.6-opus-max-thinking | Main orchestrator + deep worker |
| **hephaestus** | gpt-5.4-high | Autonomous deep worker |
| **atlas** | claude-4.6-sonnet-medium-thinking | Todo-list orchestrator |
| **prometheus** | claude-4.6-opus-max-thinking | Strategic planner |
| **oracle** | gpt-5.4-medium | Architecture consultant (readonly) |
| **metis** | claude-4.6-opus-max-thinking | Pre-planning analysis (readonly) |
| **momus** | gpt-5.4-medium | Plan reviewer (readonly) |
| **explore** | gemini-3-flash | Codebase search (readonly, background) |
| **librarian** | fast (latest Composer) | External docs search (readonly, background) |
| **sisyphus-junior** | claude-4.6-sonnet-medium-thinking | Quick task executor |
| **multimodal-looker** | gemini-3.1-pro | Visual file analysis (readonly) |

## MCP Integration

oh-my-cursor ships with 3 remote MCP servers and 1 local sidecar, configured in `mcp.json`:

| Server | Capabilities |
|--------|-------------|
| websearch | Web search via Exa/Tavily |
| context7 | Library documentation lookup |
| grep_app | Code search across repositories |
| oh-my-cursor | Local sidecar (look_at, interactive_bash, skill_mcp) |

Agents also discover and use any MCP servers you have configured in Cursor (e.g., Linear, Notion, GitKraken) via `CallMcpTool`.

## Worktrees

oh-my-cursor supports git worktrees for isolated parallel execution via the `best-of-n-runner` agent.

**How it works:**
- Each `best-of-n-runner` gets its own git worktree and branch
- Worktree configuration is in `worktrees.json`
- Cursor's built-in worktree support handles directory isolation

**Configuration:**
The `worktrees.json` file defines worktree settings. The `best-of-n-runner` agent automatically creates and manages worktrees when dispatched for parallel solution attempts.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/deep-plan` | Create a strategic work plan with Prometheus |
| `/start-work` | Execute an existing plan with Atlas |
| `/refactor` | Intelligent refactoring with LSP + AST-grep |
| `/briareus` | Massive parallelism: decompose into micro-tasks and run many sisyphus-junior workers at once |
| `/init-deep` | Generate hierarchical AGENTS.md files |
| `/ralph-loop` | Self-referential loop until task completion |
| `/ulw-loop` | Ultrawork loop with Oracle verification gate |
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

| Area | Coverage (approx.) |
|------|---------------------|
| Agents | ~98% |
| Tools | ~65% |
| Hooks | ~85% |
| Skills | ~95% |
| Commands | ~95% |
| MCPs | ~100% |
| Context injection | ~90% |
| Continuation / loops | ~95% |
| **Overall** | **~92-95%** |

**What works natively:** Agents, model routing with thinking variants, sub-agent orchestration, background agents, skills, commands, rules, context injection, continuation loops, session management via ACP, Cloud Agent automations.

**Irreducible gap (~5-8%):** Provider-level config, fine-grained per-request effort control, session tree opacity, programmatic model switching mid-session.

## Credits

Ported from [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (OpenCode plugin by YeonGyu Kim).

## License

Sustainable Use License 1.0 (SUL-1.0). See [LICENSE.md](LICENSE.md) for full text.
