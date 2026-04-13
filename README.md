# oh-my-cursor

Multi-agent orchestration for Cursor IDE. Ported from [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent).

11 specialized agents, persistent hook daemon, dynamic context injection, continuation loops, and a lightweight MCP sidecar -- all running natively in Cursor.

## Quick Start

### Prerequisites

- **bun** — required (hook daemon and MCP sidecar)
- **python3** or **jq** — recommended for JSON merge operations during install

### Install (Linux / macOS)

User scope (applies to all Cursor projects):

```bash
bash install.sh
# or
./install.sh
```

If oh-my-cursor is already installed, re-running `./install.sh` detects the existing install, backs up the current plugin directory, and performs an update.

Current project only:

```bash
./install.sh --project
```

Preview changes without writing files:

```bash
./install.sh --dry-run
```

Overwrite an existing plugin install:

```bash
./install.sh --force
```

Remove the plugin and clean up Cursor-side files:

```bash
./install.sh --uninstall
```

Print installer version:

```bash
./install.sh --version
```

Check whether a newer release is available:

```bash
./install.sh --check-update
```

**MCP config:** `mcp.json` is merged into your existing Cursor MCP configuration — it is not replaced wholesale, so your other servers stay intact.

### Install (Windows)

From PowerShell in the repo root:

```powershell
.\install.ps1                          # user scope
.\install.ps1 -Scope project           # current project only
.\install.ps1 -DryRun                  # preview
.\install.ps1 -Force                   # overwrite existing plugin dir
.\install.ps1 -Uninstall               # remove plugin + cleanup
.\install.ps1 -Version                 # print installed version
.\install.ps1 -CheckUpdate             # check for updates
```

## What Gets Installed

| Component | Count | Description |
|-----------|-------|-------------|
| Agents | 11 + protocol | Specialized subagents with model routing |
| Rules | 6 | Orchestrator, orchestrator reference, coding standards, anti-patterns, tool restrictions, modular enforcement |
| Commands | 16 | Slash commands (/plan, /ulw-loop, /refactor, /ralph-loop, etc.) |
| Skills | 7 | Domain expertise (git, frontend, browser, review, playwright) |
| Hooks | 1 daemon | Persistent Bun HTTP server; 30+ hook handlers in daemon |
| MCP | 4 servers | websearch, context7, grep_app + sidecar |

## Architecture

Mode-Based Routing:
  Plan Mode  → Root = Prometheus persona (research, plan writing)
  Agent Mode → Root = Orchestrator/Atlas (dispatch, verify, coordinate)
  Debug Mode → Root = Diagnostic specialist (read-only)
  Ask Mode   → Root = Oracle/Advisor (read-only)

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

## MCP Integration

oh-my-cursor ships with 3 remote MCP servers and 1 local sidecar, configured in `mcp.json`:

| Server | Capabilities |
|--------|-------------|
| websearch | Web search via Exa/Tavily |
| context7 | Library documentation lookup |
| grep_app | Code search across repositories |
| oh-my-cursor | Local sidecar with 8 tools (see [MCP Sidecar](#mcp-sidecar)) |

Agents also discover and use any MCP servers you have configured in Cursor (e.g., Linear, Notion, GitKraken) via `CallMcpTool`.

## Worktrees

`best-of-n-runner` is Cursor's built-in `subagent_type` for parallel solution attempts in separate git worktrees — not a custom agent file shipped by oh-my-cursor.

`worktrees.json` defines the setup steps for those worktrees. Cursor isolates each attempt in its own directory and branch.

## Slash Commands

| Command | Description |
|---------|-------------|
| `/plan` | Create a strategic work plan with Prometheus |
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
| `/status` | System health: daemon uptime, sessions, tool calls, sidecar status |
| `/agents` | List all agents with models, roles, and capabilities |
| `/help` | Overview of agents, commands, skills, and usage patterns |
| `/config` | Display the current merged oh-my-cursor configuration |
| `/cloud-agents` | Dispatch and manage agents via cloud API (experimental) |

## Hook Daemon

All hooks run through a persistent Bun HTTP server (clooks pattern) for zero subprocess overhead.

**Features:**
- Session state tracking (in-memory)
- Ralph loop auto-continuation (loop_limit: null)
- Subagent dispatch limits (max 6 explore, max 8 workers)
- Dynamic .mdc context injection
- Dangerous command blocking
- Sensitive file access guards
- Long thinking block logging

**Start manually:** `bun run hooks/daemon.ts`
**Auto-start:** The daemon launches automatically on first `sessionStart` via `hooks/scripts/start-daemon.sh`

## Flow Improvements (v2)

- **Auto-Continuation:** Plan flow auto-advances between steps. Boulder continuation uses state-based todo tracking with cooldown, exponential backoff, and stagnation detection.
- **Momus Review Loop:** Plans auto-reviewed up to 3 times. After 3 rejections, asks user.
- **Adaptive Explore Dispatch:** 0 explores for trivial, 2-6+ for complex. 7 prompt templates.
- **Keyword Modes:** ultrawork, analyze, search, think — detected and injected as context.
- **Session State Persistence:** Active plans tracked in `.cursor/state/active-plan.json`.
- **Error Classification:** Rate limit, model unavailable, timeout, generic — with specific recovery advice.
- **Unstable Agent Detection:** 3+ consecutive failures trigger warnings and fallback suggestions.

## Configuration

```jsonc
{
  "continuation": { "cooldown_ms": 5000, "max_failures": 5, "backoff_multiplier": 2 },
  "momus": { "max_iterations": 3 },
  "model_routing": { "retry_on_errors": [429, 500, 502, 503, 504], "max_retry_attempts": 3 }
}
```

## MCP Sidecar

8 tools not available in Cursor's built-in tool set, served via a local MCP server on `localhost:47848`:

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `look_at` | Visual file analysis for images, PDFs, and diagrams that can't be read as plain text | `file_path`, `goal` |
| `interactive_bash` | Persistent tmux session for long-running or interactive commands with state across calls | `command`, `session_name` |
| `skill_mcp` | Manage skill-embedded MCP servers (start, stop, list, status) | `action`, `skill_name` |
| `get_dispatch_stats` | Current session dispatch statistics -- explore/worker counts, tool calls, active agents | -- |
| `session_transcripts` | List recent agent transcripts or search within them for specific content | `action` (list/search), `query`, `limit` |
| `daemon_logs` | View recent oh-my-cursor daemon log output for debugging hook behavior | `lines` |
| `session_log` | Query the session event log -- recent events, summaries, filtered search, or export path | `action` (recent/summary/search/export), `event_filter`, `action_filter` |
| `oh_my_cursor_status` | Interactive status dashboard (MCP App) showing daemon health, hooks, background tasks, and event log | -- |

### Status Dashboard

The sidecar includes an interactive HTML dashboard rendered inline in the Cursor conversation via the MCP Apps spec (`ui://oh-my-cursor/dashboard`). It has 4 tabs:

- **Status** -- Session ID, daemon connectivity, uptime, tool call counts, explore/worker dispatch counters, Ralph loop status, and recent errors.
- **Hooks** -- Lists all enabled and disabled hook handlers with live configuration from the daemon.
- **Background** -- Active background tasks with model, name, and status.
- **Event Log** -- Filterable real-time event stream (all / tools / dispatches / errors / denies) with expandable JSON detail per event, JSONL export, and clipboard copy.

The dashboard auto-refreshes every 5 seconds and pulls data from the daemon's `/health`, `/config`, `/backgroundTasks`, and `/session-log` endpoints.

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

## Documentation

oh-my-cursor includes comprehensive architecture and integration documentation:

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture with mermaid flow diagrams |
| [docs/cursor-integration.md](docs/cursor-integration.md) | Every native Cursor feature the plugin uses |
| [docs/agent-nativeness-audit.md](docs/agent-nativeness-audit.md) | Agent-to-native-tool mapping and recommendations |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup and contribution guidelines |

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed diagrams and data flow documentation.

## Credits

Ported from [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (OpenCode plugin by YeonGyu Kim).

## License

Sustainable Use License 1.0 (SUL-1.0). See [LICENSE.md](LICENSE.md) for full text.
