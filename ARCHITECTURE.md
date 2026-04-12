# oh-my-cursor Architecture

This document describes the system architecture of oh-my-cursor, a multi-agent orchestration plugin for Cursor IDE.

## Overview

oh-my-cursor provides 11 specialized agents, a persistent hook daemon, MCP sidecar, and continuation loops. The system intercepts Cursor's hook events via shell scripts that forward to a Bun-based HTTP daemon, which processes events and returns context injections.

## Agent Orchestration Flow

```mermaid
graph TD
    User[User Message] --> Root[Root Thread / Orchestrator]
    Root --> IntentGate{Intent Gate}
    IntentGate -->|search| Explore[explore agent]
    IntentGate -->|external docs| Librarian[librarian agent]
    IntentGate -->|plan needed| Prometheus[prometheus agent]
    IntentGate -->|plan exists| Atlas[atlas agent]
    IntentGate -->|complex work| Sisyphus[sisyphus agent]
    IntentGate -->|quick task| SJ[sisyphus-junior]
    Prometheus -->|plan file| Plans[.cursor/plans/*.md]
    Plans -->|/start-work| Atlas
    Atlas -->|delegates| SJ
    Sisyphus -->|delegates| SJ
```

## Hook Daemon Data Flow

```mermaid
sequenceDiagram
    participant C as Cursor IDE
    participant H as hooks.json
    participant E as ensure-daemon.sh
    participant D as Hook Daemon - Bun
    participant S as MCP Sidecar
    C->>H: Hook event triggered
    H->>E: Shell script execution
    E->>D: HTTP POST /hookName
    D->>D: Handler processing
    D-->>C: JSON response
    S->>D: Health polling every 30s
```

## Session Lifecycle

```mermaid
stateDiagram-v2
    [*] --> SessionStart: sessionStart hook
    SessionStart --> Active: env vars set
    Active --> ToolUse: preToolUse
    ToolUse --> Active: postToolUse
    Active --> Compaction: preCompact via /summarize
    Compaction --> Active: user_message injected
    Active --> [*]: sessionEnd / stop
```

## MCP Sidecar Architecture

```mermaid
graph LR
    Agent[Cursor Agent] --> MCP[MCP Sidecar - dynamic port]
    MCP --> LookAt[look_at]
    MCP --> Bash[interactive_bash]
    MCP --> Skill[skill_mcp]
    MCP --> Stats[get_dispatch_stats]
    MCP --> Trans[session_transcripts]
    MCP --> Logs[daemon_logs]
    MCP --> SLog[session_log]
    MCP --> Status[oh_my_cursor_status]
    MCP --> Daemon[Hook Daemon - dynamic port]
```

## Agent Architecture

### Agent Tiers

| Tier | Agents | Can Spawn Sub-agents | Can Edit Code |
|------|--------|---------------------|---------------|
| Coordinator | sisyphus, hephaestus, atlas | Yes (explore, sisyphus-junior) | Via delegation only |
| Planner | prometheus | No | Never (markdown only) |
| Reviewer | metis, momus | No | Never (read-only) |
| Worker | sisyphus-junior | No | Yes (leaf executor) |
| Specialist | explore, librarian, oracle, multimodal-looker | No | Never (read-only) |

### Background Agents

- `explore`: `is_background: true` — fast codebase search, non-blocking
- `librarian`: `is_background: true` — external doc lookup, non-blocking

## Hook System

### Hook Tiers

| Tier | Value | Hooks | Purpose |
|------|-------|-------|---------|
| SESSION | 0 | sessionStart, sessionEnd, preCompact, subagentStart, subagentStop | Session lifecycle |
| TOOL_GUARD | 1 | preToolUse, postToolUse, beforeShellExecution, beforeReadFile, etc. | Tool safety |
| TRANSFORM | 2 | afterAgentResponse, afterAgentThought | Response transformation |
| CONTINUATION | 3 | stop, beforeSubmitPrompt | Continuation loops |

### Safety Hooks

- `beforeShellExecution`: `failClosed: true` — blocks dangerous shell commands
- `beforeMCPExecution`: `failClosed: true` — blocks unauthorized MCP servers

## MCP Integration

The MCP sidecar runs alongside the daemon, providing tools to Cursor agents via the Model Context Protocol. Port coordination is managed via `/tmp/oh-my-cursor-ports.json`.

## Configuration

Two-layer config with JSONC format:
1. User config: `~/.config/oh-my-cursor/config.jsonc`
2. Project config: `.cursor/oh-my-cursor.jsonc`

Merge order: defaults → user → project. Config cached 30s.

## Session Management

Sessions are tracked in-memory with periodic persistence to `/tmp/oh-my-cursor-state.json`. Each session tracks: tool calls, dispatch counts, Ralph/Boulder loop state, compaction epochs, and error counts.

## Continuation Loops

- **Ralph Loop**: Iterative task completion via `/ralph-loop` command
- **Ultrawork Loop**: Deep work with oracle check-ins via `/ulw-loop`
- **Boulder State**: Automatic retry on tool failures with stagnation detection

See [docs/cursor-integration.md](docs/cursor-integration.md) for native Cursor feature details.
