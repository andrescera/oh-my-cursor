# oh-my-cursor

Multi-agent orchestration for Cursor IDE. Fork of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent).

## Quick Start

Prerequisites: **bun** (required), **python3** or **jq** (recommended for JSON merge during install).

```bash
bash install.sh
```

See [INSTALL.md](INSTALL.md) for all options, Windows, and AI-assisted install.

View slow-handler trips and circuit-breaker state (default sidecar port):

```bash
curl http://localhost:27847/metrics | jq
```

## What It Does

11 specialized agents with dynamic model routing, dispatched through a single orchestrator rule. Models are resolved at dispatch time via `agent_overrides` config and runtime introspection of the Cursor bundle — no hardcoded slugs in the orchestrator. Context that can't be delivered via broken channels (`postToolUse.additional_context`) is piggybacked onto the next Task's `preToolUse.updated_input` prompt via the central composer. The root thread's persona changes based on Cursor's mode:

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
       ├── Task(explore) ──── Codebase search (composer-2-fast, readonly, background)
       ├── Task(librarian) ── External docs search (composer-2-fast, readonly, background)
       ├── Task(sisyphus) ─── Complex multi-file work (claude-opus-4-7-thinking-xhigh)
       ├── Task(hephaestus) ─ Sustained deep work (gpt-5.5-extra-high)
       ├── Task(atlas) ────── Plan execution via delegation (claude-4.6-sonnet-medium-thinking)
       ├── Task(prometheus) ─ Strategic planning (claude-opus-4-7-thinking-xhigh)
       ├── Task(oracle) ───── Architecture consultation (gpt-5.5-extra-high, readonly)
       ├── Task(metis) ────── Pre-planning gap analysis (gpt-5.4-medium, readonly)
       ├── Task(momus) ────── Plan review (gpt-5.5-extra-high, readonly)
       ├── Task(sisyphus-junior) ── Quick focused tasks (composer-2-fast)
       └── Task(multimodal-looker) ── Visual analysis (gemini-3.1-pro, readonly)
```

A persistent **hook daemon** (Bun HTTP server) handles 19 wired hook events (of 21 canonical; 2 are Tab-UI-only) through 30+ handlers -- session tracking, context injection, dangerous command blocking, dispatch limits, and continuation control. Minimal per-event overhead (shell script to persistent daemon).

An **MCP sidecar** adds 8 tools not in Cursor's built-in set (visual file analysis, persistent tmux sessions, dispatch stats, transcript search, daemon logs, session log, status dashboard).

A live **dashboard UI** (Vite 8 + React 19 + Tailwind v4 + shadcn/ui + Zustand 5) ships under [`hooks/dashboard-ui/`](hooks/dashboard-ui/). The installer builds it (`vite build`), the daemon serves the bundle from `GET /dashboard/assets/*`, and `GET /dashboard` plus the MCP resource `ui://oh-my-cursor/dashboard` both return a thin shell HTML that boots the SPA. Tabs cover status, hooks, background tasks, events, sessions, agents, config, **Models & Routing** (hotkey 8 — live agent override table, fallback chain, introspection source), and **Hook Channel Status** (embedded in the Hooks tab — working vs broken response fields at the current Cursor version) — all wired through a typed REST client and an SSE stream from the daemon. See [`hooks/dashboard-ui/README.md`](hooks/dashboard-ui/README.md) for the contributor guide.

Three **continuation loops**: Ralph (self-referential until done), Ultrawork/ULW (with Oracle verification gate), and Boulder (continuation with backoff and stagnation detection — effectiveness depends on Cursor's hook coverage for TodoWrite; see [sharp edges](docs/cursor/19-known-sharp-edges.md)).

## Agents

| Agent | Model | Role |
|-------|-------|------|
| **sisyphus** | claude-opus-4-7-thinking-xhigh | Main orchestrator + deep worker |
| **hephaestus** | gpt-5.5-extra-high | Autonomous deep worker |
| **atlas** | claude-4.6-sonnet-medium-thinking | Todo-list orchestrator |
| **prometheus** | claude-opus-4-7-thinking-xhigh | Strategic planner |
| **oracle** | gpt-5.5-extra-high | Architecture consultant (readonly) |
| **metis** | gpt-5.4-medium | Pre-planning analysis (readonly) |
| **momus** | gpt-5.5-extra-high | Plan reviewer (readonly) |
| **explore** | composer-2-fast | Codebase search (readonly, background) |
| **librarian** | composer-2-fast | External docs search (readonly, background) |
| **sisyphus-junior** | composer-2-fast | Quick task executor |
| **multimodal-looker** | gemini-3.1-pro | Visual file analysis (readonly) |

These are valid Cursor Task model slugs. See `rules/orchestrator.mdc` for the canonical routing table.

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
| `/introspect` | Show live model introspection results from the Cursor bundle (`GET /introspection`) |

## Coverage

See [Known Limitations](#known-limitations) below and the [adoption matrix](docs/cursor/18-adoption-matrix.md) for detailed feature coverage. For Cursor-specific hook and tool constraints, see [Known Sharp Edges](docs/cursor/19-known-sharp-edges.md).

### Known Limitations

- No provider-level config -- API keys and endpoints managed by Cursor
- No per-request effort/thinking control from hooks
- Session tree opaque -- cannot inspect sibling subagent state
- Model switching is per-dispatch via `agent_overrides` config, not mid-turn -- a running subagent keeps its assigned model for the duration of that call
- Hook latency -- shell-to-HTTP-to-daemon bridge adds ~50-200ms per hook event
- Context window pressure -- MCP tool definitions consume tokens proportional to server count
- Subagent parallelism -- Cursor controls scheduling; instructions suggest counts but don't guarantee them
- Hook tool coverage -- not all Cursor tools fire hook events. See [Known Sharp Edges](docs/cursor/19-known-sharp-edges.md#hook-tool-coverage) for the full list.
- `postToolUse.additional_context` is broken at Cursor 3.7.x -- context is delivered instead via Task `preToolUse` prompt piggyback (composer). No `additional_context` field is emitted by any handler.

## Configuration

Two-layer JSONC: `~/.config/oh-my-cursor/config.jsonc` (user) and `.cursor/oh-my-cursor.jsonc` (project). Project config merges over user config.

See `config.default.jsonc` for all options. Run `/config` to view the active merged config.

### Dynamic model routing

Override the model for any agent, with an ordered fallback chain if the primary slug is unavailable:

```jsonc
"agent_overrides": {
  "explore": {
    "model": "gpt-5.4-medium",
    "fallback_models": ["composer-2-fast"]
  },
  "sisyphus": {
    "model": "claude-opus-4-7-thinking-xhigh"
  }
}
```

Group agents under a shared routing policy with `categories`:

```jsonc
"categories": {
  "quick": {
    "model": "composer-2-fast",
    "fallback_models": ["composer-2"],
    "description": "Fast, cheap tasks"
  }
}
```

The daemon introspects the Cursor bundle at startup to validate slugs (`GET /introspection`). Unknown slugs log a warning but are applied anyway. Regenerate the routing table after config changes:

```bash
bun scripts/config-generator.ts --sync-rules
```

## Documentation

| Document | Description |
|----------|-------------|
| [INSTALL.md](INSTALL.md) | Install, update, uninstall, AI-assisted install |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, flows, and mermaid diagrams |
| [hooks/dashboard-ui/README.md](hooks/dashboard-ui/README.md) | Dashboard UI contributor guide (dev, test, build modes, layout) |
| [docs/cursor-features.md](docs/cursor-features.md) | Native Cursor features used by the plugin |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guidelines |
| [docs/cursor/19-known-sharp-edges.md](docs/cursor/19-known-sharp-edges.md) | Operational gotchas and Cursor-specific constraints |
| [docs/cursor/18-adoption-matrix.md](docs/cursor/18-adoption-matrix.md) | Feature-by-feature adoption status |

## Credits

Fork of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) by YeonGyu Kim.

SUL-1.0. See [LICENSE.md](LICENSE.md).

