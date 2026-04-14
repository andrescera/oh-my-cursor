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
    Prometheus -->|plan file| Plans[.cursor/plans/*.plan.md]
    Plans -->|/start-work| Atlas
    Atlas -->|delegates| SJ
    Atlas -->|search| Explore
    Atlas -->|consult| Oracle[oracle agent]
    Sisyphus -->|delegates| SJ
    Sisyphus -->|search| Explore
    Sisyphus -->|consult| Oracle
    Sisyphus -->|docs| Librarian
    Sisyphus -->|visual| ML[multimodal-looker]
```

### Mode-Based Routing (Native Mode)

Cursor's native mode system drives top-level routing: (Mode is detected via `detectPlanMode()` heuristics — hook payloads do not include a mode field. See [sharp edges](docs/cursor/19-known-sharp-edges.md#composer-mode-not-in-hook-payloads).) **Plan mode** activates the Prometheus persona (research + plan writing), while **Agent mode** activates the Orchestrator/Atlas persona (dispatch, verify, coordinate). Debug and Ask modes are read-only.

```mermaid
graph TD
    User[User Message] --> ModeCheck{Current Mode?}
    ModeCheck -->|Plan| PlanPersona["Root = Prometheus Persona"]
    ModeCheck -->|Agent| AgentPersona["Root = Orchestrator/Atlas"]
    ModeCheck -->|Debug| DebugPersona["Root = Diagnostic Specialist"]
    ModeCheck -->|Ask| AskPersona["Root = Read-Only Advisor"]
    PlanPersona -->|research| Explore["Task(explore)"]
    PlanPersona -->|external docs| Lib["Task(librarian)"]
    PlanPersona -->|gap analysis| Metis["Task(metis)"]
    PlanPersona -->|plan review| Momus["Task(momus)"]
    PlanPersona -->|writes directly| PlanFile[".cursor/plans/*.plan.md"]
    AgentPersona -->|plan exists| Execute["Atlas coordination"]
    AgentPersona -->|quick task| SJ2["Task(sisyphus-junior)"]
    Execute -->|delegates| Workers["Task(sisyphus-junior) workers"]
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

## Conversation Lifecycle

```mermaid
stateDiagram-v2
    [*] --> ConversationStart: sessionStart hook
    ConversationStart --> Active: env vars set
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
| Coordinator | sisyphus, hephaestus, atlas | Yes (see per-agent lists) | Via delegation only |
| Planner | prometheus | Yes in native mode (explore, librarian, metis, momus) | Never (markdown only) |
| Reviewer | metis, momus | No | Never (read-only) |
| Worker | sisyphus-junior | No | Yes (leaf executor) |
| Specialist | explore, librarian, oracle, multimodal-looker | No | Never (read-only) |

### Dispatch Worker Lists

| Agent | Workers |
|-------|---------|
| sisyphus | explore, oracle, librarian, sisyphus-junior, multimodal-looker |
| hephaestus | explore, sisyphus-junior |
| atlas | explore, oracle, sisyphus-junior |
| prometheus (native) | explore, librarian, metis, momus |

### Background Agents

- `explore`: `is_background: true` — fast codebase search, non-blocking
- `librarian`: `is_background: true` — external doc lookup, non-blocking

## Hook System

### Hook Tiers

| Tier | Value | Hooks | Purpose |
|------|-------|-------|---------|
| SESSION | 0 | sessionStart, sessionEnd, preCompact, subagentStart, subagentStop | Conversation lifecycle |
| TOOL_GUARD | 1 | preToolUse, postToolUse, postToolUseFailure, beforeShellExecution, afterShellExecution, beforeMCPExecution, afterMCPExecution, beforeReadFile, afterFileEdit | Tool safety and tracking |
| TRANSFORM | 2 | afterAgentResponse, afterAgentThought | Response transformation |
| CONTINUATION | 3 | stop, beforeSubmitPrompt | Continuation loops |
| SKILL | 4 | (skill-embedded MCP lifecycle) | Skill server management |

### Safety Hooks

- `beforeShellExecution`: `failClosed: true` — blocks dangerous shell commands (Note: malformed JSON in hook payloads has been reported to bypass fail-closed behavior. See [sharp edges](docs/cursor/19-known-sharp-edges.md#hooks).)
- `beforeMCPExecution`: `failClosed: true` — blocks unauthorized MCP servers

## MCP Integration

The MCP sidecar runs alongside the daemon, providing tools to Cursor agents via the Model Context Protocol. Port coordination is managed via `/tmp/oh-my-cursor-ports.json`.

## Configuration

Two-layer config with JSONC format:
1. User config: `~/.config/oh-my-cursor/config.jsonc`
2. Project config: `.cursor/oh-my-cursor.jsonc`

Merge order: defaults → user → project. Config cached 30s.

## Conversation Management

Conversations are tracked in-memory with periodic persistence to `/tmp/oh-my-cursor-state.json`. Each conversation tracks: tool calls, dispatch counts, Ralph/Boulder loop state, compaction epochs, and error counts.

## Continuation Loops

- **Ralph Loop**: Iterative task completion via `/ralph-loop` command
- **Ultrawork Loop**: Deep work with oracle check-ins via `/ulw-loop`
- **Boulder State**: Continuation with backoff and stagnation detection. Effectiveness depends on Cursor's hook coverage — see [sharp edges](docs/cursor/19-known-sharp-edges.md#hook-tool-coverage).

## System Behaviors

### Auto-Continuation
Plan flow auto-advances between steps without asking "should I continue?" Boulder continuation uses activity-based detection with cooldown (default 5000ms), exponential backoff, and stagnation detection.

### Momus Review Loop
Plans are auto-reviewed by Momus up to 3 times. After 3 rejections, the user is asked whether to continue iterating or accept the plan as-is.

### Adaptive Explore Dispatch
Explore dispatch count scales with task complexity: 0 for trivial tasks, 2 for mid-sized, 3-5+ for architecture or research. 7 prompt templates cover different explore intents (usage-mapping, test-coverage, similar-implementations, etc.).

### Keyword Modes
Detected keywords inject mode context: ultrawork, analyze, search, think. Sisyphus and other coordinators adjust their behavior based on the active keyword mode.

### Conversation State
Active plans tracked in `.cursor/state/active-plan.json`. Enables resume detection on `/start-work` and progress persistence across conversation boundaries.

### Error Classification
Hook daemon classifies errors into: rate limit (429), model unavailable (502/503), timeout, and generic. Each category has specific recovery advice injected into the conversation.

### Unstable Agent Detection
3+ consecutive failures from the same agent type trigger a warning and suggest fallback options (different model, different agent, manual intervention).

## See also

- [Known Sharp Edges](docs/cursor/19-known-sharp-edges.md) — operational gotchas and Cursor constraints
- [docs/cursor-features.md](docs/cursor-features.md) — native Cursor feature details

## Terminology

- **conversation**: One chat tab/thread in Cursor, keyed by `conversationId`
- **daemon session**: The daemon process lifetime (startup to shutdown)
- **EventEntry.sessionId**: Legacy wire format name for `conversationId` in JSONL log files

