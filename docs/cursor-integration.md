# Cursor Integration — Native Features Used by oh-my-cursor

This document catalogs every native Cursor feature the plugin leverages.

## Summary Table

| Feature | How We Use It | Key Files |
|---------|---------------|-----------|
| Custom Agents | 11 agents with frontmatter config | `agents/*.md` |
| Hook System | 18 hook events via daemon | `hooks/hooks.json` |
| Slash Commands | 15 commands for orchestration | `commands/*.md` |
| Rules (.mdc) | Always-apply and agent-requestable rules | `rules/*.mdc` |
| Skills | 7 skills with SKILL.md format | `skills/*/SKILL.md` |
| MCP Integration | Sidecar with 8 tools | `hooks/mcp-sidecar.ts` |
| Native Tools | AskQuestion, TodoWrite, SwitchMode | Agent prompts |
| Plan System | .cursor/plans/ integration | `agents/prometheus.md` |
| Plugin System | .cursor-plugin manifest | `.cursor-plugin/plugin.json` |

---

## a. Agent System

Custom agents defined via `.cursor/agents/*.md` with YAML frontmatter:

- **name**: Agent identifier
- **description**: One-line purpose
- **model**: LLM model to use
- **readonly**: Prevents mutation tools when true
- **is_background**: Non-blocking execution (explore, librarian)

Coordinator protocol enforces dispatch hierarchy: root → coordinators → workers.
Agent model routing table in `rules/orchestrator.mdc`.

## b. Hook System

All 18 hook events with daemon handlers:

| Event | Type | Purpose |
|-------|------|---------|
| sessionStart | Session | Initialize session, set env vars |
| sessionEnd | Session | Cleanup session state |
| preCompact | Session | Inject context on /summarize compaction |
| preToolUse | Guard | Track tool usage, dispatch counting |
| postToolUse | Guard | Context injection, AGENTS.md discovery |
| postToolUseFailure | Guard | Error recovery guidance |
| beforeShellExecution | Guard | Dangerous command blocking (failClosed) |
| afterShellExecution | Guard | Failure loop detection |
| beforeMCPExecution | Guard | Server allowlist check (failClosed) |
| afterMCPExecution | Guard | MCP call tracking |
| beforeReadFile | Guard | Sensitive file blocking |
| afterFileEdit | Guard | Excessive edit detection |
| afterAgentResponse | Transform | Periodic session pulse |
| afterAgentThought | Transform | Thinking block validation |
| subagentStart | Session | Agent tracking, context rule update |
| subagentStop | Session | Completion tracking, notifications |
| stop | Continuation | Ralph/Boulder loop management |
| beforeSubmitPrompt | Continuation | Ultrawork/Ralph detection |

Hook options used: `command`, `matcher`, `failClosed`, `loop_limit`, `type: "prompt"`.

`preCompact` fires when the user or Cursor invokes `/summarize` to compact the context window.

## c. Commands

Slash commands via `commands/*.md` organized by category:

- **Orchestration**: /deep-plan, /start-work, /briareus, /refactor, /init-deep, /handoff
- **Monitoring**: /status, /agents, /help
- **Configuration**: /config
- **Continuation**: /ralph-loop, /ulw-loop, /cancel-ralph, /stop-continuation, /remove-ai-slops

## d. Rules

`.cursor/rules/*.mdc` with YAML frontmatter:

- **alwaysApply**: Rule loaded for every agent invocation
- **globs**: File pattern matching for conditional loading
- **FETCH_RULES**: Dynamic rule loading based on description matching

Rule files: orchestrator, coding-standards, anti-patterns, modular-code-enforcement, agent-tool-restrictions.

## e. Skills

`skills/*/SKILL.md` format with YAML frontmatter triggers:

- agent-browser, ai-slop-remover, dev-browser, frontend-ui-ux, git-master, playwright, review-work
- Skills loaded via `skill_mcp` MCP tool or Cursor's native skill discovery

## f. MCP Integration

`mcp.json` configures the MCP sidecar with 8 tools:

- look_at, interactive_bash, skill_mcp, get_dispatch_stats
- session_transcripts, daemon_logs, session_log, oh_my_cursor_status

MCP Apps protocol: `ui://oh-my-cursor/dashboard` resource for status dashboard.
Progressive enhancement: falls back to text when Apps not supported.

## g. Native Agent Tools

| Tool | Used By | Purpose |
|------|---------|---------|
| AskQuestion | prometheus | Structured user interview |
| TodoWrite | atlas, sisyphus, hephaestus, prometheus | Progress tracking |
| SwitchMode(ask) | metis, momus, oracle | Enforce read-only |
| SwitchMode(debug) | sisyphus, hephaestus | Error investigation |
| FETCH_RULES | metis, momus, oracle, atlas | Dynamic rule loading |
| SEARCH_SYMBOLS | oracle | Type navigation |
| GenerateImage | multimodal-looker | Visual output |

## h. Plan System

- Plans saved to `.cursor/plans/*.md` — integrates with native plan UI
- Plan mode workflow: spec → review → build
- `cursor/create_plan` ACP method referenced for native integration
- Prometheus writes plans; Atlas executes them via /start-work

## i. Plugin System

`.cursor-plugin/plugin.json` manifest with:
- Version, description, keywords
- Directory references: agents, commands, skills, rules, hooks
- `sandbox.json` network policy with additionalReadwritePaths
