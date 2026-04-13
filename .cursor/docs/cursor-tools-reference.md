# Cursor Tools & Hooks Reference

Definitive reference for oh-my-cursor development. Maps native Cursor capabilities so hook development leverages platform features instead of building workarounds.

---

## 1. Agent Tools

| Tool | Purpose | Key Parameters | Returns |
|------|---------|----------------|---------|
| **Shell** | Execute terminal commands | `command`, `working_directory`, `block_until_ms`, `required_permissions` | stdout/stderr, exit code, task_id (if backgrounded) |
| **Read** | Read file contents (text, images, PDFs) | `path`, `offset`, `limit` | Numbered lines (`LINE_NUMBER\|CONTENT`), or image/PDF content |
| **Write** | Create or overwrite a file | `path`, `contents` | Success/failure confirmation |
| **StrReplace** | Exact string replacement in files | `path`, `old_string`, `new_string`, `replace_all` | Success/failure; fails if `old_string` not unique |
| **Delete** | Delete a file | `path` | Success/failure |
| **Glob** | Find files by glob pattern | `glob_pattern`, `target_directory` | Sorted file paths (by mtime) |
| **Grep** | Ripgrep-based content search | `pattern`, `path`, `glob`, `type`, `output_mode`, `-A/-B/-C`, `multiline`, `head_limit`, `offset` | Matching lines, file paths, or counts (capped output) |
| **Task** | Launch subagent for complex work | `prompt`, `subagent_type`, `model`, `description`, `run_in_background`, `resume`, `readonly`, `attachments` | Subagent completion message or output_file path |
| **TodoWrite** | Manage structured task lists | `todos[]` (id, content, status), `merge` | Updated todo state |
| **SwitchMode** | Change interaction mode | `target_mode_id` ("plan"\|"agent"), `explanation` | Mode switch request (requires user consent) |
| **WebSearch** | Search the web for real-time info | `search_term`, `explanation` | Summarized results with URLs |
| **WebFetch** | Fetch URL content as markdown | `url` | Markdown-rendered page content |
| **ReadLints** | Read linter diagnostics | `paths[]` | Linter errors/warnings per file |
| **EditNotebook** | Edit Jupyter notebook cells | `target_notebook`, `cell_idx`, `is_new_cell`, `cell_language`, `old_string`, `new_string` | Updated cell content |
| **GenerateImage** | Generate image from text | `description`, `filename`, `reference_image_paths[]` | Generated image file |
| **Await** | Poll background shell/subagent | `task_id`, `block_until_ms`, `pattern` | Job status, output content |
| **CallMcpTool** | Call MCP server tool | `server`, `toolName`, `arguments` | MCP tool response |
| **FetchMcpResource** | Read MCP server resource | `server`, `uri`, `downloadPath` | Resource content or file download |

**Notes:**
- Shell commands persist cwd/env across calls within a session.
- Grep output is capped; reports "at least" counts when truncated.
- Task `model` parameter only accepts `"fast"` or omit to inherit parent model.
- Write overwrites existing files. StrReplace fails on non-unique matches unless `replace_all: true`.

---

## 2. Hook Events

### Lifecycle Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **sessionStart** | Agent session begins | `composer_mode` ("agent"\|"ask"\|"edit"), session metadata | `env` (inject environment variables) |
| **sessionEnd** | Agent session ends | `reason` (completed/aborted/error/window_close/user_close), `duration_ms` | *(fire-and-forget, no outputs)* |

- `sessionStart`: fire-and-forget — agent does NOT wait for hook completion. Supports `env` injection into session environment.
- `sessionEnd`: fire-and-forget. `reason` enum covers all termination paths.

### Tool Lifecycle Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **preToolUse** | Before a tool executes | `tool_name`, `tool_input` (full params) | `permission` (approve/deny), `additional_context`, `updated_input` |
| **postToolUse** | After successful tool execution | `tool_name`, `tool_input`, `tool_output` | `additional_context`, `updated_mcp_tool_output` (MCP only) |
| **postToolUseFailure** | After tool execution fails | `tool_name`, `tool_input`, `failure_type` ("timeout"\|"error"\|"permission_denied") | *(fire-and-forget, NO output fields)* |

- `preToolUse`: `updated_input` **replaces** the entire input object (does NOT merge). `"ask"` permission is accepted by schema but NOT enforced at runtime.
- `postToolUse`: `modified_output` is NOT official. The official field is `updated_mcp_tool_output`, which only works for MCP tool calls.
- `postToolUseFailure`: strictly fire-and-forget; cannot modify agent behavior.

### Shell Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **beforeShellExecution** | Before a shell command runs | `command`, `working_directory` | `permission`, `additional_context`, `updated_input` |
| **afterShellExecution** | After shell command completes | `command`, `exit_code`, `stdout`, `stderr` | `additional_context` |

### MCP Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **beforeMCPExecution** | Before an MCP tool call | `server`, `tool_name`, `arguments` | `permission`, `additional_context`, `updated_input` |
| **afterMCPExecution** | After MCP tool completes | `server`, `tool_name`, `result` | `additional_context`, `updated_mcp_tool_output` |

### File Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **beforeReadFile** | Before reading a file | `content` (full file), `attachments` [{type, file_path}] | `additional_context` |
| **afterFileEdit** | After a file is modified | `file_path`, `changes` | `additional_context` |

- `beforeReadFile` matchers: `TabRead`, `Read`.
- `afterFileEdit` matchers: `TabWrite`, `Write`.

### Subagent Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **subagentStart** | Subagent launches | `subagent_model`, `is_parallel_worker`, subagent metadata | `additional_context` |
| **subagentStop** | Subagent completes | `summary`, `duration_ms`, `modified_files`, `agent_transcript_path`, `message_count`, `tool_call_count`, `loop_count` | `additional_context` |

### Agent Response Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **afterAgentResponse** | After agent sends a message | Response content | *(fire-and-forget, no outputs)* |
| **afterAgentThought** | After agent internal reasoning | Thought content | *(fire-and-forget, no outputs)* |

### Context & Control Events

| Event | Fires When | Key Inputs | Supported Outputs |
|-------|-----------|------------|-------------------|
| **preCompact** | Before context compaction | `context_usage_percent`, `context_tokens`, `messages_to_compact`, `is_first_compaction`, `context_window_size`, `trigger` ("auto"\|"manual") | `additional_context` |
| **stop** | When agent is about to stop | Stop reason | `followup_message`, `decision` ("block"), `reason` |
| **beforeSubmitPrompt** | Before user prompt is sent to agent | User message content | `continue`, `user_message` |

- `beforeSubmitPrompt`: `additional_context` is NOT officially supported (may work but undocumented). Official outputs are only `continue` + `user_message`.
- `stop`: `decision: "block"` prevents the agent from stopping.

---

## 3. Hook Response Capabilities

| Response Field | Where Supported | Behavior | Status |
|----------------|----------------|----------|--------|
| `permission` ("deny"\|"approve") | preToolUse, beforeShellExecution, beforeMCPExecution | Approve or block tool execution | Verified |
| `additional_context` | preToolUse, postToolUse, beforeShellExecution, afterShellExecution, beforeMCPExecution, afterMCPExecution, beforeReadFile, afterFileEdit, subagentStart, subagentStop, preCompact | Inject text into agent context | Verified |
| `updated_input` | preToolUse, beforeShellExecution, beforeMCPExecution | **Replace** (not merge) tool input | Verified |
| `updated_mcp_tool_output` | postToolUse (MCP only), afterMCPExecution | Modify MCP tool output seen by agent | Verified |
| `user_message` | beforeSubmitPrompt | Modify/replace the user message | Verified |
| `continue` | beforeSubmitPrompt | Boolean — whether to proceed | Verified |
| `followup_message` | stop | Inject a message after stop | Verified |
| `decision` | stop | `"block"` prevents stop | Verified |
| `reason` | stop | Explain why stop was blocked | Verified |
| `env` | sessionStart | Inject environment variables | Verified |
| `agentMessage` | (unverified) | Inject as agent message | Unverified |
| `hookSpecificOutput` | (unverified) | Event-specific structured data | Unverified |

---

## 4. Hook Configuration

### hooks.json Format

```json
{
  "version": 1,
  "hooks": {
    "eventName": [
      {
        "command": "bash /path/to/script.sh",
        "matcher": "Shell|Write|Delete",
        "loop_limit": 5,
        "failClosed": false
      }
    ]
  }
}
```

### Key Configuration Fields

| Field | Description | Default |
|-------|-------------|---------|
| `command` | Shell command to execute | *(required)* |
| `type` | `"prompt"` for LLM-evaluated hooks | `"command"` (implicit) |
| `prompt` | Prompt text (when `type: "prompt"`); use `$ARGUMENTS` placeholder | — |
| `matcher` | Tool names separated by `\|`; use `MCP: <toolname>` for MCP tools | *(matches all)* |
| `loop_limit` | Max times hook fires per turn; `null` = unlimited | `5` |
| `failClosed` | If `true`, tool is blocked when hook errors | `false` |

### Matcher Syntax

- Pipe-separated tool names: `"Shell|Write|Delete|StrReplace"`
- MCP tools: `"MCP: search_docs|MCP: run_query"`
- Tab-context matchers: `"TabRead"`, `"TabWrite"` (for beforeReadFile/afterFileEdit)
- Omit matcher to match all tools for that event.

### Priority Order

Enterprise > Team > Project (`.cursor/hooks/`) > User (`~/.cursor/hooks/`)

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success; output JSON parsed for response fields |
| `2` | Deny (equivalent to `permission: "deny"`) |
| Non-zero (≠2) | Error; behavior depends on `failClosed` |

---

## 5. Task Tool Subagent Types

### Desktop (Cursor IDE) Types

| Type | Purpose |
|------|---------|
| `generalPurpose` | Full-capability agent for multi-step tasks with file modifications |
| `explore` | Fast, read-only codebase search and exploration |
| `shell` | Command execution specialist |
| `best-of-n-runner` | Isolated git worktree for parallel attempts |
| `atlas` | Todo-list orchestrator; delegates, never implements |
| `hephaestus` | Deep autonomous worker for complex single problems |
| `librarian` | External docs and OSS search; uses fast model |
| `metis` | Pre-planning gap analysis; read-only |
| `momus` | Plan reviewer and quality auditor; read-only |
| `multimodal-looker` | PDF/image/diagram interpreter |
| `oracle` | Strategic advisor with deep reasoning; read-only |
| `prometheus` | Strategic planning consultant; planning only |
| `sisyphus-junior` | Focused task executor; single-domain, no delegation |
| `sisyphus` | Main orchestrator + deep worker; plans and executes |
| `coordinator-protocol` | Shared protocol for coordinator-tier agents |

### ACP (Agent Communication Protocol) Types

| Type | Purpose |
|------|---------|
| `unspecified` | Default/generic |
| `computer_use` | Desktop/VM interaction |
| `explore` | Codebase exploration |
| `video_review` | Video content analysis |
| `browser_use` | Web browser automation |
| `shell` | Terminal operations |
| `vm_setup_helper` | VM environment setup |
| `{custom: string}` | User-defined agent type |

**Discrepancy note:** Desktop types are a superset of ACP types. ACP lacks atlas, hephaestus, librarian, metis, momus, oracle, prometheus, sisyphus variants. Desktop lacks computer_use, video_review, browser_use, vm_setup_helper.

---

## 6. Model Options

### Two-Tier Routing

1. **Definition-time** — `model` frontmatter in agent `.md` files sets a preferred model for that agent type.
2. **Dispatch-time** — `model` parameter on the Task tool call overrides at invocation.

### Task Tool Model Parameter

The Task tool `model` enum only accepts:
- `"fast"` — use the fastest available model (cost: 1/10, intelligence: 5/10)
- *(omit)* — inherit from parent agent

Agent routing table model names (e.g., "Opus 4.6", "Sonnet 4.5") are aspirational labels used in rule definitions. The Task tool's `model` parameter does NOT accept arbitrary model names — only `"fast"` or nothing.

### Model Hierarchy (Rules/Routing Context)

| Label | Tier | Use Case |
|-------|------|----------|
| Haiku 4.5 | Low | File reading, context gathering, simple edits, boilerplate |
| Sonnet 4.6 | Medium | 1-3 file features, standard refactors, test writing |
| Opus 4.5 | High | Multi-file architecture, subtle bugs, cross-cutting refactors |
| Opus 4.6 | Max | Deep reasoning, security audits, novel architecture |
| GPT-5.3 Codex (Fast/High/Extra High) | Variable | Alternative provider with matching tiers |

---

## 7. MCP Integration

### Tools

| Tool | Purpose |
|------|---------|
| `CallMcpTool` | Invoke any MCP server tool by server name + tool name |
| `FetchMcpResource` | Read MCP resource by URI; optionally download to disk |
| `ListMcpResources` | (unverified) Discover available resources from servers |

### MCP in Subagents

- Subagents inherit MCP server access from the parent session.
- MCP tool descriptors stored in `~/.cursor/projects/<workspace>/mcps/<server>/tools/`.
- Resource descriptors at `~/.cursor/projects/<workspace>/mcps/<server>/resources/`.

### Hook Integration

- `beforeMCPExecution` / `afterMCPExecution` — hook into MCP tool lifecycle.
- Matcher syntax for MCP: `"MCP: <toolname>"`.
- `updated_mcp_tool_output` — only output field that modifies MCP results.

### Configuration

- `mcp_allowlist` — restrict which MCP tools agents can call (unverified).
- Server-level `serverUseInstructions` — injected into agent context for server-specific guidance.
- `mcp_auth` tool — some servers require authentication via this tool before use.

---

## 8. Rules System Architecture

### Application Modes

| Mode | Behavior |
|------|----------|
| **Always** | Rule applied to every agent turn |
| **Intelligent** | Cursor decides relevance automatically |
| **Globs** | Applied only when matching file patterns are in context |
| **Manual** | User must explicitly reference via `@rule` |

### Rule Sources

| Source | Location | Priority |
|--------|----------|----------|
| Team rules | Cursor dashboard | Highest (with enforce toggle) |
| Project rules | `.cursor/rules/*.mdc` | High |
| User rules | `~/.cursor/rules/*.mdc` | Lower |

### Compatibility

- `AGENTS.md` / `CLAUDE.md` / `.cursorrules` files are recognized and loaded.
- `@file` references within rules pull in additional context.
- Remote rules can be imported from GitHub URLs.

### Scope Limitation

Rules apply to **Agent** and **Chat** modes only. They do NOT apply to Tab completion or Inline edits.

### Team Rules

- `enforce` toggle: when enabled, rule cannot be overridden by project/user rules.
- Glob scoping: team rules can target specific file patterns.

---

## 9. Skills System

### Discovery Paths (searched in order)

| Path | Scope |
|------|-------|
| `.cursor/skills/` | Project-local |
| `.agents/skills/` | Project-local (cross-tool) |
| `~/.cursor/skills/` | User-global |
| `~/.cursor/plugins/*/skills/` | Plugin-provided |
| `.claude/` | Compatibility |
| `.codex/` | Compatibility |

### Skill Configuration

- `disable-model-invocation` frontmatter: prevents automatic model selection (unverified).
- Progressive loading: skills can include `scripts/`, `references/`, `assets/` subdirectories.
- `/migrate-to-skills` CLI command converts legacy rules to skill format (unverified).
- GitHub skill import: install skills from remote repositories.

### Skill Structure

```
skill-name/
├── SKILL.md          # Entry point — read by agent
├── scripts/          # Executable scripts
├── references/       # Additional context files
└── assets/           # Static assets
```

---

## 10. Plugin Architecture

### plugin.json Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "rules": ["rules/*.mdc"],
  "skills": ["skills/*/SKILL.md"],
  "hooks": "hooks/hooks.json"
}
```

### Discovery

- **Default discovery**: scans `.cursor/plugins/` for `plugin.json` manifests.
- **Manifest paths**: explicit paths in plugin.json for rules, skills, hooks.
- **marketplace.json**: aggregates multiple plugins in a single repository.
- **VSCode API**: `vscode.cursor.plugins.registerPath()` for extension-based registration.
- **Local dev**: symlink into `~/.cursor/plugins/local/` for development.

---

## 11. CLI Reference

### Commands

| Command | Purpose |
|---------|---------|
| `/plan` | Switch to Plan mode |
| `/ask` | Switch to Ask mode |
| `/worktree` | Create isolated git worktree for experimentation |
| `/best-of-n` | Run N parallel attempts in worktrees |
| `/apply-worktree` | Merge worktree changes back |
| `/delete-worktree` | Clean up worktree |
| `/resume` | Resume a previous session |
| `/compress` | Compact context manually |
| `/mcp` | MCP server management |
| `/rules` | List/manage active rules |
| `/commands` | Show available commands |
| `/sandbox` | Configure sandbox settings |
| `/model` | Switch model |
| `/auto-run` | Toggle auto-run for tools |
| `/max-mode` | Toggle Max Mode (+20% pricing) |
| `/vim` | Toggle vim keybindings |
| `/help` | Show help |
| `/usage` | Show token usage stats |
| `/about` | Version and build info |
| `/feedback` | Submit feedback |

### Flags

| Flag | Purpose |
|------|---------|
| `-p` / `--print` | Print output without streaming |
| `--force` / `--yolo` | Skip confirmation prompts |
| `--stream-partial-output` | Stream partial results |
| `-c` / `--cloud` | Run on cloud agent |
| `--resume` / `--continue` | Continue previous session |

### CLI Permissions

Glob-based token system for auto-approving tool operations on matching paths.

---

## 12. Cloud Agents

| Feature | Details |
|---------|---------|
| **Execution** | Remote VM with full OS access |
| **Computer Use** | Desktop interaction via `computer_use` subagent type |
| **Artifacts** | File outputs downloadable from cloud runs |
| **CI Autofix** | Automatic PR fix suggestions from CI failures |
| **Signed Commits** | Ed25519 signatures for cloud-generated commits |
| **REST API** | Programmatic access to cloud agent capabilities |
| **Team Follow-ups** | Team members can resume cloud sessions |
| **MCP** | HTTP-based MCP servers only (no stdio in cloud) |
| **Network** | Configurable egress policy; known egress IPs |

---

## 13. Context Management

| Feature | Details |
|---------|---------|
| **Codebase Index** | Auto-indexes on open; ~5 min initial sync |
| **Max Mode** | +20% pricing for expanded context window |
| **@ Mentions** | `@codebase`, `@past chats`, `@docs`, `@web` for targeted context |
| **Checkpoints** | Auto-saved restore points for session state |
| **Message Queue** | Queue messages while agent is processing |
| **Tool Calls** | Unlimited per turn |
| **Context Compaction** | Automatic when context fills; `preCompact` hook fires |

---

## 14. Sandbox & Security

### sandbox.json Schema

```json
{
  "permissions": {
    "protected_paths": ["/etc", "/usr"],
    "writable_paths": ["./", "/tmp"],
    "enableSharedBuildCache": true
  }
}
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Protected paths** | Read-only; writes blocked by sandbox |
| **Writable paths** | Explicitly allowed for agent writes |
| **Shared build cache** | Allow access to build caches (npm, pip, etc.) |
| **Auto-run modes** | Configure which tools run without confirmation |
| **Network** | Common package managers/VCS allowed by default; `full_network` permission for broader access |
| **Sandbox bypass** | `required_permissions: ["all"]` disables sandbox entirely |

### Protection Toggles

Sandbox restricts: file writes outside workspace, USB access, certain syscalls. Network access is allowed for standard package managers and VCS providers.

---

## 15. Third-Party Hook Compatibility

### Claude Settings Locations

- `.claude/settings.json` — project-level
- `~/.claude/settings.json` — user-level

### Hook Name Mapping (Claude → Cursor)

| Claude Name | Cursor Name |
|-------------|-------------|
| `PreToolUse` | `preToolUse` |
| `PostToolUse` | `postToolUse` |
| `Stop` | `stop` |

### Unsupported Claude Events

| Event | Status |
|-------|--------|
| `Notification` | Not supported in Cursor |
| `PermissionRequest` | Not supported in Cursor |

### Tool Name Mapping (Claude → Cursor)

| Claude Tool | Cursor Tool | Notes |
|-------------|-------------|-------|
| `Bash` | `Shell` | Direct mapping |
| `Edit` | `Write` / `StrReplace` | Claude's Edit maps to Cursor's file modification tools |
| `Glob` | — | NOT mapped; Cursor has native `Glob` |
| `WebFetch` | — | NOT mapped; Cursor has native `WebFetch` |
| `WebSearch` | — | NOT mapped; Cursor has native `WebSearch` |

---

## 16. Agent Configuration & Frontmatter

### Model Frontmatter

Agent `.md` files can specify preferred model:

```yaml
---
model: fast
is_background: false
---
```

### Configuration Fields

| Field | Purpose | Values |
|-------|---------|--------|
| `model` | Preferred model for this agent | `"fast"`, or omit to inherit |
| `is_background` | Run agent in background | `true` / `false` |

### Nested Subagents

- Supported in Cursor 2.5+.
- Subagents can spawn their own subagents (depth limited by platform).
- Each subagent gets its own tool context and todo state.

### Built-in vs Configurable Agents

- **Built-in**: `generalPurpose`, `explore`, `shell` — always available.
- **Configurable**: Custom agent types defined in `.cursor/agents/` or plugins.

### Resume Mechanics

- Agent transcripts stored in `~/.cursor/subagents/` (unverified path).
- `resume` parameter on Task tool sends follow-up to existing agent.
- Agent retains full context from prior invocation.

### MCP Inheritance

Subagents inherit all MCP server connections from the parent session. MCP tool descriptors and resource descriptors are shared.
