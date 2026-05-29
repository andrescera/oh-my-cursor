# Hooks Empirical Evidence Summary — Cursor 3.5.38

> **PROXY NOTICE**: This file contains empirical findings from Cursor **3.5.38** hook captures,
> used as the closest available proxy for the 3.6.21 re-audit. There are **ZERO 3.6.21 hook
> records** in the corpus; a live 3.6.21 fire-capture is still pending. All empirical claims
> here are labeled 3.5.38 and must not be presented as 3.6.21 confirmed facts.

---

## Provenance

| Field | Value |
|---|---|
| Cursor version captured | **3.5.38** (100% of records; 0 records are 3.6.21) |
| Capture dates | 2026-05-27 – 2026-05-29 |
| Corpus header `cursor_version` | 3.6.21 (experiment session label only; NOT the runtime version of the hook payloads) |
| Metadata records (non-content) | **32,561** |
| Content sidecar files | 16,652 |
| Mined | 2026-05-29 by experiment-logger-v2 mining script |
| Redaction method | **`bun run redact.ts` (automated)** — replaces emails→`<email>`, `$HOME`→`<home>`, Stripe/GitHub/AWS keys |
| Target doc | `docs/internal/reaudit-3621/hooks-evidence-3.5.38-summary.md` |

### 3.6.21 Confirmation

```
rg '"CURSOR_VERSION": "3.6.21"' /tmp/cursor-hooks-evidence --glob '!content-*' --count
# → 0 (zero matches across all 32,561 metadata files)
```

**Finding: CONFIRMED — 0 records carry `CURSOR_VERSION: 3.6.21`. All 32,561 records are `3.5.38`.**

---

## Event Distribution

| Hook Event | Count (3.5.38) | Count (v1/3.1.15) | Status |
|---|---:|---:|---|
| `preToolUse` | **12,824** | 81 | Firing ✓ |
| `postToolUse` | **12,438** | 66 | Firing ✓ |
| `beforeReadFile` | **2,425** | 18 | Firing ✓ |
| `beforeShellExecution` | **1,392** | 42 | Firing ✓ |
| `afterShellExecution` | **1,375** | 30 | Firing ✓ |
| `afterAgentThought` | **1,335** | 0 | **NEW — now firing** |
| `afterFileEdit` | **563** | 3 | Firing ✓ |
| `subagentStart` | **125** | 3 | Firing ✓ |
| `afterAgentResponse` | **45** | 0 | **NEW — now firing** |
| `afterMCPExecution` | **18** | 6 | Firing ✓ |
| `beforeMCPExecution` | **18** | 6 | Firing ✓ |
| `postToolUseFailure` | **3** | 9 | Firing ✓ |
| `subagentStop` | **0** | 3 | Not observed (no 3.5.38 records) |
| `sessionStart` | 0 | 0 | Not observed |
| `sessionEnd` | 0 | 0 | Not observed |
| `stop` | 0 | — | Not observed |
| `preCompact` | 0 | — | Not observed |
| `beforeSubmitPrompt` | 0 | — | Not observed |
| `afterTabFileEdit` | 0 | — | Not observed |
| `beforeTabFileRead` | 0 | — | Not observed |
| `workspaceOpen` | 0 | — | Not observed |

---

## Per-Event Payload Schema (3.5.38)

### Common Fields (present in ALL fired events)

Every hook payload contains these fields:

| Field | Type | Notes |
|---|---|---|
| `conversation_id` | `string` (UUID or `""`) | Empty string when fired outside active conversation |
| `generation_id` | `string` (UUID or `""`) | Empty when no active generation |
| `model` | `string` | AI model slug; empty `""` in some pre-conversation contexts |
| `session_id` | `string` (UUID or `""`) | |
| `hook_event_name` | `string` | Redundant copy of the event name |
| `cursor_version` | `string` | `"3.5.38"` in all records |
| `workspace_roots` | `array[1]` | Always length 1 in corpus |
| `user_email` | `string` | Redacted in excerpts |
| `transcript_path` | `string \| null` | Path to `.jsonl` transcript; null for non-agent contexts |

---

### `preToolUse`

**Count**: 12,824 | **Sampled**: 50

| Field | Type | Notes |
|---|---|---|
| `tool_name` | `string` | e.g. `"Shell"`, `"Read"`, `"Write"`, `"Grep"` |
| `tool_input` | `object` | Tool-specific input dict (keys vary by tool) |
| `tool_use_id` | `string` | 30–84 chars; format varies by provider (Anthropic: `toolu_...`; others: UUID) |
| `cwd` | `string \| absent` | Present (~50% of records) for Shell and cwd-aware tools; absent for Read/Write |
| *(common fields)* | | |

**Delta vs v1 (3.1.15)**: No schema change. `cwd` was already listed in v1. `tool_output` absent (as expected — this is pre-use).

**Redacted excerpt:**
```json
{
  "model": "claude-4.6-sonnet-medium-thinking",
  "tool_name": "Shell",
  "tool_input": {
    "command": "grep -n -B2 -A2 \"synthetic-envspec\" mcp-ui/src/bin/cli.test.ts ...",
    "cwd": "/mnt/development/<project-path>",
    "timeout": 30000
  },
  "tool_use_id": "ff48b4cf-2271-4422-8e81-66cfdbdb9261",
  "cwd": "/mnt/development/<project-path>",
  "hook_event_name": "preToolUse",
  "cursor_version": "3.5.38",
  "user_email": "<email>",
  "transcript_path": null
}
```

---

### `postToolUse`

**Count**: 12,438 | **Sampled**: 50

| Field | Type | Notes |
|---|---|---|
| `tool_name` | `string` | |
| `tool_input` | `object` | Same as preToolUse |
| `tool_output` | `string` | **JSON-encoded string** containing tool result; for Shell: `{"output":"...","exitCode":N}` |
| `duration` | `float` | Milliseconds |
| `tool_use_id` | `string` | 30–84 chars |
| `cwd` | `string \| absent` | Present in ~50% of records (tool-dependent) |
| *(common fields)* | | |

**Delta vs v1 (3.1.15)**: No schema change. **Note**: `tool_output` for Shell calls contains JSON with `exitCode` key — this is how shell exit codes are accessible (via `postToolUse.tool_output.exitCode`), not via `afterShellExecution` (see below).

---

### `postToolUseFailure`

**Count**: 3 | **Sampled**: 3 (all)

| Field | Type | Notes |
|---|---|---|
| `tool_name` | `string` | All 3 records: `"Shell"` |
| `tool_input` | `object` | |
| `error_message` | `string` | Error description |
| `failure_type` | `string` | e.g. `"timeout"`, `"error"` |
| `duration` | `float \| integer` | |
| `tool_use_id` | `string` | |
| `is_interrupt` | `boolean` | |
| `cwd` | `string` | |
| *(common fields)* | | |

**Delta vs v1 (3.1.15)**: No schema change.

---

### `beforeShellExecution`

**Count**: 1,392 | **Sampled**: 50

| Field | Type | Notes |
|---|---|---|
| `command` | `string` | The shell command |
| `cwd` | `string` | Working directory (may be `""`) |
| `sandbox` | `boolean` | Whether sandboxed |
| *(common fields)* | | |

**Delta vs v1 (3.1.15)**: No schema change.

---

### `afterShellExecution` ⚠️ TARGETED VERIFICATION

**Count**: 1,375 | **Sampled**: 100

| Field | Type | Notes |
|---|---|---|
| `command` | `string` | The shell command that ran |
| `output` | `string` | Combined stdout+stderr output |
| `duration` | `float` | Milliseconds |
| `sandbox` | `boolean` | |
| *(common fields)* | | |

**`exit_code` field**: **ABSENT** — 0/100 samples contained `exit_code`. The schema is identical to v1.

> **Finding**: `afterShellExecution` does **NOT** carry `exit_code` in 3.5.38. Exit code is only accessible via `postToolUse.tool_output` (JSON-encoded: `{"output":"...","exitCode":N}`) when the tool is `Shell`. Shell exit code is present in `postToolUse` in 100% of Shell call samples (76/76 Shell records sampled).

**Redacted excerpt:**
```json
{
  "model": "claude-opus-4-7-thinking-xhigh",
  "command": "cd /mnt/development/<project-path>/mcp-ui && pnpm typecheck 2>&1 | tail -15",
  "output": "<truncated shell output>...",
  "duration": 242.215,
  "sandbox": false,
  "hook_event_name": "afterShellExecution",
  "cursor_version": "3.5.38",
  "user_email": "<email>",
  "transcript_path": null
}
```

---

### `beforeReadFile` ⚠️ TARGETED VERIFICATION

**Count**: 2,425 | **Sampled**: 50 + 30 (content-type check)

| Field | Type | Notes |
|---|---|---|
| `content` | `string` | **Actual file content** (raw text of the file being read) |
| `file_path` | `string` | Absolute path to the file |
| `attachments` | `array` | Always `[]` in corpus (empty) |
| *(common fields)* | | |

**`content` field type verification**: 30/30 sampled records contained non-JSON-parseable text (raw file content: TypeScript, Python, Svelte, markdown, terminal output, etc.). **Zero records** contained a JSON conversation blob.

> **Finding**: `beforeReadFile.content` = **actual file content being read**, NOT a conversation JSON blob. The file path varies widely (source code, terminal files, docs, etc.). This contradicts the hypothesis that `content` was a conversation snapshot.

---

### `afterFileEdit`

**Count**: 563 | **Sampled**: 50

| Field | Type | Notes |
|---|---|---|
| `file_path` | `string` | Absolute path to edited file |
| `edits` | `array` | Array of edit objects |
| `edits[n].old_string` | `string` | Original text (StrReplace-style) |
| `edits[n].new_string` | `string` | Replacement text |
| *(common fields)* | | |

**Delta vs v1 (3.1.15)**: No schema change to top-level keys. `edits` structure confirmed as `{old_string, new_string}` objects.

---

### `afterAgentThought` ⭐ NEW EVENT

**Count**: 1,335 | **Sampled**: 50

> This event was **not firing** in v1 (3.1.15). Now fires prolifically (1,335 records, 2nd highest after tool events).

| Field | Type | Notes |
|---|---|---|
| `text` | `string` | Agent's internal thought/reasoning text |
| `duration_ms` | `integer` | Time taken for the thought generation |
| *(common fields)* | | |

**Delta vs v1**: **Fully new event**. Schema is net-new.

---

### `afterAgentResponse` ⭐ NEW EVENT

**Count**: 45 | **Sampled**: 45 (all)

> This event was **not firing** in v1 (3.1.15). Now fires (45 records).

| Field | Type | Notes |
|---|---|---|
| `text` | `string` | The full agent response text |
| `input_tokens` | `integer` | Input token count |
| `output_tokens` | `integer` | Output token count |
| `cache_read_tokens` | `integer` | Prompt cache read tokens |
| `cache_write_tokens` | `integer` | Prompt cache write tokens |
| *(common fields)* | | |

**Delta vs v1**: **Fully new event** with token-accounting fields. High-value for cost attribution hooks.

**Redacted excerpt:**
```json
{
  "model": "claude-opus-4-7-thinking-xhigh",
  "text": "Here are the four demos in one shot — pick a port pair per d...<redacted-blob>",
  "input_tokens": 111219,
  "output_tokens": 488,
  "cache_read_tokens": 107909,
  "cache_write_tokens": 3304,
  "hook_event_name": "afterAgentResponse",
  "cursor_version": "3.5.38",
  "user_email": "<email>",
  "transcript_path": "<home>/.cursor/projects/<project>/agent-transcripts/<uuid>/<uuid>.jsonl"
}
```

---

### `subagentStart` ⚠️ TARGETED VERIFICATION

**Count**: 125 | **Sampled**: 125 (all)

| Field | Type | Notes |
|---|---|---|
| `subagent_id` | `string` | 30–83 chars; matches tool call ID format |
| `subagent_type` | `string` | e.g. `"sisyphus-junior"`, `"explore"`, `"generalPurpose"` |
| `task` | `string` | **Full task prompt text** — NON-EMPTY in all 125 records |
| `parent_conversation_id` | `string` (UUID) | |
| `tool_call_id` | `string` | Same value as `subagent_id` |
| `subagent_model` | `string` | **NEW vs v1** — the model assigned to the subagent |
| `is_parallel_worker` | `boolean` | |
| *(common fields)* | | |

**`task` field**: **125/125 non-empty** (task text lengths range from 51 to 15,308 chars). The v1/N8 finding of `task = ""` (empty string) is **invalidated for 3.5.38**. The `task` field now reliably carries the full delegated task prompt.

**`subagent_model` (NEW)**: Present in 125/125 records. Contains the model slug assigned to the subagent (may differ from the parent `model` field). Not present in v1.

**`transcript_path`**: Non-null in 125/125 records (was null in v1). Points to the subagent's own `.jsonl` transcript.

**Delta vs v1 (3.1.15)**:
- ADDED: `subagent_model` (string)
- CHANGED: `task` now populated (was empty in v1)
- CHANGED: `transcript_path` now non-null (was null in v1)

**Redacted excerpt:**
```json
{
  "model": "composer-2.5-fast",
  "subagent_id": "toolu_01QR1aq6BNkJoPRy8SAAAxrN",
  "subagent_type": "sisyphus-junior",
  "task": "TASK: Reroute the inner `_list_one` of `parallel_list_environments` to use the new paginated API...<redacted-blob>",
  "parent_conversation_id": "<uuid>",
  "tool_call_id": "toolu_01QR1aq6BNkJoPRy8SAAAxrN",
  "subagent_model": "composer-2.5-fast",
  "is_parallel_worker": false,
  "hook_event_name": "subagentStart",
  "cursor_version": "3.5.38",
  "user_email": "<email>",
  "transcript_path": "<home>/.cursor/projects/<project>/agent-transcripts/<uuid>/<uuid>.jsonl"
}
```

---

### `subagentStop` — Still Unknown

**Count in 3.5.38 corpus**: **0 records**

The `agent_transcript_path` field (targeted re-verification item) **cannot be confirmed** — there are no `subagentStop` records in the 3.5.38 corpus.

> **Status**: `subagentStop.agent_transcript_path` — **still-unknown (no 3.5.38 records; requires 3.6.21 live capture)**. The v1 schema showed `agent_transcript_path: NoneType` (null). Unresolved.

---

### `beforeMCPExecution` ⚠️ TARGETED VERIFICATION

**Count**: 18 | **Sampled**: 18 (all)

| Field | Type | Notes |
|---|---|---|
| `tool_name` | `string` | The MCP tool name (e.g. `"query-docs"`, `"resolve-library-id"`, `"UpdateCurrentStep"`, `"noop"`) |
| `tool_input` | `string` | JSON-encoded string of tool arguments |
| `mcp_server_name` | `string` | **NEW vs v1** — MCP server name (e.g. `"context7"`, `"oh-my-cursor"`) |
| `command` | `string` | **= `mcp_server_name`** (same value, always); NOT a shell command path |
| *(common fields)* | | |

**`command` vs `mcp_server_name`**: Identical values in 18/18 records. `command` contains the MCP server name (e.g. `"context7"`, `"oh-my-cursor"`), not a binary path. Both fields are present and redundant.

**Matcher note from v1**: The v1 matcher probe configured for `"websearch"` did not fire for `"web_search_exa"` payloads — implies `command` matches on server name, not tool name. Confirmed: the matcher-relevant field is `command` (== server name).

**`mcp_server_name`**: **NEW field vs v1** (not present in 3.1.15 schema). High value for server-specific matchers.

**Delta vs v1 (3.1.15)**: ADDED `mcp_server_name` field.

**Redacted excerpt:**
```json
{
  "model": "composer-2.5-fast",
  "tool_name": "query-docs",
  "tool_input": "{\"libraryId\":\"/huntabyte/bits-ui\",\"query\":\"DatePicker Content portal...\"}",
  "mcp_server_name": "context7",
  "command": "context7",
  "hook_event_name": "beforeMCPExecution",
  "cursor_version": "3.5.38",
  "user_email": "<email>",
  "transcript_path": null
}
```

---

### `afterMCPExecution`

**Count**: 18 | **Sampled**: 18 (all)

| Field | Type | Notes |
|---|---|---|
| `tool_name` | `string` | Same as beforeMCPExecution |
| `tool_input` | `string` | JSON-encoded string |
| `result_json` | `string` | JSON-encoded string of tool result |
| `duration` | `float` | Seconds (not milliseconds) |
| `mcp_server_name` | `string` | **NEW vs v1** — server name |
| *(common fields)* | | |

**Delta vs v1 (3.1.15)**: ADDED `mcp_server_name` field.

---

## Targeted Re-Verification Findings

### T-V1: `afterShellExecution.exit_code`

| Metric | Result |
|---|---|
| Field present in corpus | **0/100 sampled records** |
| Field absent in corpus | **100/100 sampled records** |
| Field type if present | N/A |
| v1 schema | `command`, `output`, `duration`, `sandbox` (no `exit_code`) |
| 3.5.38 schema | `command`, `output`, `duration`, `sandbox` (no `exit_code`) |

**Answer**: `afterShellExecution` does **NOT** carry `exit_code` in 3.5.38. Schema is unchanged from v1. The exit code is accessible only via `postToolUse.tool_output` when `tool_name == "Shell"` (JSON `{"output":"...","exitCode":N}`).

---

### T-V2: `subagentStart.task` — Empty String?

| Metric | Result |
|---|---|
| `task == ""` | **0/125 records** |
| `task != ""` | **125/125 records** (100%) |
| Observed task lengths | 51 – 15,308 chars |

**Answer**: `subagentStart.task` is **NOT empty** in 3.5.38. All 125 records carry the full task prompt text. The v1/N8 "empty string" finding is invalidated — the field was likely empty only in 3.1.15 or was never a reliable 3.1.15 observation.

---

### T-V3: `subagentStop.agent_transcript_path`

**Answer**: **Still-unknown** — 0 `subagentStop` records in the 3.5.38 corpus. Cannot verify whether `agent_transcript_path` carries a real path or null. Requires 3.6.21 live-fire capture.

---

### T-V4: `beforeReadFile.content` — File content or conversation blob?

| Metric | Result |
|---|---|
| Non-JSON parseable (raw file text) | **30/30 sampled records** |
| JSON-parseable (conversation blob) | **0/30 sampled records** |

**Answer**: `beforeReadFile.content` contains the **actual file content** of the file being read — raw text (TypeScript, Python, markdown, terminal output, etc.). It is NOT a conversation JSON blob. This is the opposite of the previously hypothesized finding.

---

### T-V5: `beforeMCPExecution` — `command` vs `tool_name` for matchers

| Metric | Result |
|---|---|
| `command == mcp_server_name` | **18/18 records** (always equal) |
| `tool_name` | Actual MCP tool function (e.g. `"query-docs"`, `"noop"`) |
| `mcp_server_name` | Server name (e.g. `"context7"`, `"oh-my-cursor"`) |

**Answer**: To match on MCP server name, use `command` or `mcp_server_name` (both carry the server name, always equal). To match on specific tool function, use `tool_name`. The v1 note about `"websearch"` matcher not firing for `"web_search_exa"` is consistent: `command` = server name, not tool name.

---

### T-V6: `preToolUse` / `postToolUse` Core Schema

**Confirmed** in 50-record samples:
- `preToolUse`: `tool_name`, `tool_input` (object), `tool_use_id`, `cwd` (optional). No `tool_output`.
- `postToolUse`: adds `tool_output` (string, JSON-encoded), `duration` (float). No schema regressions.
- `tool_use_id` format: varies by AI provider (Anthropic: `toolu_bdrk_...` 84 chars; others: UUID 30–36 chars).

---

## Schema Delta Summary: 3.1.15 → 3.5.38

| Event | Field | Change |
|---|---|---|
| `afterAgentThought` | (entire event) | **NEW EVENT** — now firing (0→1,335 records) |
| `afterAgentResponse` | (entire event) | **NEW EVENT** — now firing (0→45 records) |
| `afterAgentResponse` | `text`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` | **NEW FIELDS** |
| `subagentStart` | `subagent_model` | **ADDED** |
| `subagentStart` | `task` | **CHANGED** — now populated (was `""` in v1) |
| `subagentStart` | `transcript_path` | **CHANGED** — now non-null (was null in v1) |
| `beforeMCPExecution` | `mcp_server_name` | **ADDED** |
| `afterMCPExecution` | `mcp_server_name` | **ADDED** |
| `afterShellExecution` | `exit_code` | **NOT ADDED** — still absent (v1 gap persists) |
| `subagentStop` | `agent_transcript_path` | **UNKNOWN** — no 3.5.38 records |
| All events | `cursor_version` in payload | **Confirmed** as `"3.5.38"` (string field in payload, not just env) |

---

## Notes on Corpus Multiplicity

Several events (notably `beforeMCPExecution`, `afterMCPExecution`) show exactly 3× duplication per unique call. This reflects the experiment-logger-v2 setup: multiple logger hooks (experiment IDs `W-C-*` and `W-AB-*`) fired per event. The 3× factor is an artifact of the capture harness, not of Cursor's dispatch behavior.

---

## Open Items for 3.6.21 Live Capture

1. **`subagentStop`**: Zero records — `agent_transcript_path` value unknown.
2. **`afterShellExecution.exit_code`**: Still absent in 3.5.38. Needs live 3.6.21 capture to confirm if added.
3. **`sessionStart` / `sessionEnd`**: Never observed in any version — trigger condition unclear.
4. **`beforeSubmitPrompt` / `preCompact`**: Zero records in corpus — trigger condition may require specific user actions.
5. **`workspaceOpen`**: Zero records — may only fire on workspace initialization, not captured in chat sessions.
