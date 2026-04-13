# oh-my-cursor

Multi-agent orchestration for Cursor IDE. Fork of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent).

## Quick Start

Prerequisites: **bun** (required), **python3** or **jq** (recommended for JSON merge during install).

```bash
bash install.sh
```

See [INSTALL.md](INSTALL.md) for all options, Windows, and AI-assisted install.

## What It Does

11 specialized agents with dynamic model routing, dispatched through a single orchestrator rule. The root thread's persona changes based on Cursor's mode:

- **Plan Mode** -- Root becomes Prometheus (strategic planner)
- **Agent Mode** -- Root becomes Orchestrator/Atlas (dispatch and verify)
- **Debug Mode** -- Root becomes diagnostic specialist (read-only)
- **Ask Mode** -- Root becomes Oracle/Advisor (read-only)

Agent dispatch tree:

```
You (root thread)
  └── orchestrator.mdc (always-apply rule)
       │
       ├── Intent Gate: what did the user ask?
       │
       ├── Task(explore) ──── Codebase search (gemini-3-flash, readonly, background)
       ├── Task(librarian) ── External docs search (fast, readonly, background)
       ├── Task(sisyphus) ─── Complex multi-file work (dynamic: sonnet / opus by complexity)
       ├── Task(hephaestus) ─ Sustained deep work (gpt-5.4-high)
       ├── Task(atlas) ────── Plan execution via delegation (sonnet-medium-thinking)
       ├── Task(prometheus) ─ Strategic planning (opus-max-thinking)
       ├── Task(oracle) ───── Architecture consultation (gpt-5.4-high, readonly)
       ├── Task(metis) ────── Pre-planning gap analysis (gpt-5.4-medium, readonly)
       ├── Task(momus) ────── Plan review (gpt-5.4-high, readonly)
       ├── Task(sisyphus-junior) ── Quick focused tasks (sonnet-medium-thinking)
       └── Task(multimodal-looker) ── Visual analysis (gemini-3.1-pro, readonly)
```

A persistent **hook daemon** (Bun HTTP server) handles 18 hook events through 30+ handlers -- session tracking, context injection, dangerous command blocking, dispatch limits, and continuation control. Zero subprocess overhead per event.

An **MCP sidecar** adds 8 tools not in Cursor's built-in set (visual file analysis, persistent tmux sessions, dispatch stats, transcript search, daemon logs, session log, status dashboard).

Three **continuation loops**: Ralph (self-referential until done), Ultrawork/ULW (with Oracle verification gate), and Boulder (state-based todo tracking with backoff and stagnation detection).

## Agents

| Agent | Model | Role |
|-------|-------|------|
| **sisyphus** | dynamic (sonnet / opus by complexity) | Main orchestrator + deep worker |
| **hephaestus** | gpt-5.4-high | Autonomous deep worker |
| **atlas** | claude-4.6-sonnet-medium-thinking | Todo-list orchestrator |
| **prometheus** | claude-4.6-opus-max-thinking | Strategic planner |
| **oracle** | gpt-5.4-high | Architecture consultant (readonly) |
| **metis** | gpt-5.4-medium | Pre-planning analysis (readonly) |
| **momus** | gpt-5.4-high | Plan reviewer (readonly) |
| **explore** | gemini-3-flash | Codebase search (readonly, background) |
| **librarian** | fast | External docs search (readonly, background) |
| **sisyphus-junior** | claude-4.6-sonnet-medium-thinking | Quick task executor |
| **multimodal-looker** | gemini-3.1-pro | Visual file analysis (readonly) |

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Create a strategic work plan with Prometheus |
| `/start-work` | Execute an existing plan with Atlas |
| `/refactor` | Intelligent refactoring with LSP + AST-grep |
| `/briareus` | Massive parallelism: decompose into micro-tasks and run many workers at once |
| `/init-deep` | Generate hierarchical AGENTS.md files |
| `/ralph-loop` | Self-referential loop until task completion |
| `/ulw-loop` | Ultrawork loop with Oracle verification gate |
| `/cancel-ralph` | Cancel active Ralph loop |
| `/stop-continuation` | Stop all continuation mechanisms |
| `/handoff` | Create context summary for new session |
| `/remove-ai-slops` | Remove AI code smells from branch changes |
| `/status` | System health: daemon uptime, sessions, tool calls, sidecar status |
| `/agents` | List all agents with models, roles, and capabilities |
| `/help` | Overview of agents, commands, skills, and usage patterns |
| `/config` | Display the current merged oh-my-cursor configuration |
| `/cloud-agents` | Dispatch and manage agents via cloud API (experimental) |

## Coverage and Limitations

| Area | Coverage |
|------|----------|
| Agents | ~95% |
| Tools | ~70% |
| Hooks | ~85% |
| Skills | ~95% |
| Commands | ~95% |
| MCPs | ~100% |
| Context injection | ~85% |
| Continuation | ~90% |

### Known Limitations

- No provider-level config -- API keys and endpoints managed by Cursor
- No per-request effort/thinking control from hooks
- Session tree opaque -- cannot inspect sibling subagent state
- No programmatic model switching mid-session
- Hook latency -- shell-to-HTTP-to-daemon bridge adds ~50-200ms per hook event
- Context window pressure -- MCP tool definitions consume tokens proportional to server count
- Subagent parallelism -- Cursor controls scheduling; instructions suggest counts but don't guarantee them

## Configuration

Two-layer JSONC: `~/.config/oh-my-cursor/config.jsonc` (user) and `.cursor/oh-my-cursor.jsonc` (project). Project config merges over user config.

See `config.default.jsonc` for all options. Run `/config` to view the active merged config.

## Documentation

| Document | Description |
|----------|-------------|
| [INSTALL.md](INSTALL.md) | Install, update, uninstall, AI-assisted install |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, flows, and mermaid diagrams |
| [docs/cursor-features.md](docs/cursor-features.md) | Native Cursor features used by the plugin |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guidelines |

## Credits

Fork of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) by YeonGyu Kim.

SUL-1.0. See [LICENSE.md](LICENSE.md).

