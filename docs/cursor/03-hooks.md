# Cursor IDE Hooks — Canonical Reference

```
cursor_version:     3.1.15
binary_sha256:      29aa9ec0549fa55452794c29f50f6d3ad3c1d5b24c51b068fd371a0a2aec44ef
plugin_version:     0.5.0
git_sha:            bab260429411f0fc3156c0d045557b7fc4d0f085
experiments_count:  116
evidence_count:     459  (docs/internal/hooks-evidence-v2.jsonl)
as_of_date:         2026-04-17
```

---

## Overview

Cursor **3.6.21** exposes **21 canonical hook events** (enum `Iv` in `workbench.desktop.main.js`; this plugin wires **18 of 21** in `hooks/hooks.json` — `workspaceOpen` is canonical but not wired). The paragraph below retains the **3.1.15** empirical baseline (`bv` enum at line 28903, **20** events at that revision): of those 20, **14 are agent-triggerable** — they fire during the agent / Composer loop in response to tool calls, shell commands, MCP invocations, file reads, file edits, subagent lifecycle, agent thoughts, and loop termination. These 14 were empirically verified in that build through 459 hook-capture records and 116 experimental cells spanning 6 probe waves (C, D, AB, H, EK, F). The remaining **6 events** — `sessionStart`, `sessionEnd`, `beforeTabFileRead`, `afterTabFileEdit`, `beforeSubmitPrompt`, and `preCompact` — are either session-boundary or Tab-only events that require manual UI interaction to trigger and were out of scope for automated probing; they are documented by source-cite only. <!-- last-verified: 3.6.21 -->

---

## Event Taxonomy

> **last-verified: 3.6.21** — Enum existence re-confirmed 2026-05-29 from live 3.6.21 binary. **The canonical set is now 21 events** (enum `Iv` at offset 23,065,128, 21 keys; renamed from `bv` in 3.0.16). All 20 events from the 3.1.15/3.0.16 baseline are still present and unchanged; **+1 new event in 3.6.21: `workspaceOpen`** (row 21; defined-but-lightly-wired — no human-readable label yet). Empirical evidence rows (fires/status) for the original 20 remain at the 3.1.15 baseline below; behavioral re-testing is pending. [binary-only] [repro-local] <!-- last-verified: 3.6.21 -->

| # | Event | Category | Enforced output | Evidence fires | Status |
|---|-------|----------|----------------|---------------|--------|
| 1 | `sessionStart` | manual-UI / session | N/A | 0 | source-cited |
| 2 | `sessionEnd` | manual-UI / session | N/A | 0 | source-cited |
| 3 | `preToolUse` | agent-triggerable / guard | deny, allow, ask, updated_input | 171 | verified |
| 4 | `postToolUse` | agent-triggerable / transform | additional-context (logging; deny not enforced) | 136 | verified |
| 5 | `postToolUseFailure` | agent-triggerable / observe | not enforced | 7 | verified |
| 6 | `subagentStart` | agent-triggerable / guard | deny, allow | 1 | verified |
| 7 | `subagentStop` | agent-triggerable / observe | not enforced | 2 | verified |
| 8 | `beforeShellExecution` | agent-triggerable / guard | deny, allow, exit-2, user_message, agent_message | 63 | verified |
| 9 | `afterShellExecution` | agent-triggerable / observe | not enforced | 37 | verified |
| 10 | `beforeMCPExecution` | agent-triggerable / guard | deny, allow | 6 | verified |
| 11 | `afterMCPExecution` | agent-triggerable / observe | not enforced | 6 | verified |
| 12 | `beforeReadFile` | agent-triggerable / guard | deny | 3 | verified |
| 13 | `afterFileEdit` | agent-triggerable / observe | deny not enforced (fires post-edit) | 2 | verified |
| 14 | `beforeTabFileRead` | tab-specific / guard | N/A (Tab only) | 0 | source-cited |
| 15 | `afterTabFileEdit` | tab-specific / observe | N/A (Tab only) | 0 | source-cited |
| 16 | `stop` | agent-triggerable / continuation | followup_message | 5 | verified |
| 17 | `beforeSubmitPrompt` | manual-UI / continuation | N/A | 0 | source-cited |
| 18 | `afterAgentResponse` | agent-triggerable / observe | not enforced | 1 | verified |
| 19 | `afterAgentThought` | agent-triggerable / observe | not enforced | 19 | verified |
| 20 | `preCompact` | manual-UI / session | N/A | 0 | source-cited |
| 21 | `workspaceOpen` | binary-only / NEW 3.6.21 | N/A (no label yet) | 0 | binary-only (defined-but-lightly-wired) <!-- last-verified: 3.6.21 --> |

## Response fields — empirical status

Operator-facing response fields (what your hook returns) have been
empirically classified by the v2 experiments. See the per-event x per-field
catalog in [docs/internal/hook-response-fields.md](../internal/hook-response-fields.md).

Quick reference for the most-used fields:

| Event | Field | Status |
|---|---|---|
| stop | followup_message | TAKES-EFFECT |
| postToolUse | additional_context | TAKES-EFFECT |
| beforeShellExecution | permission=deny | TAKES-EFFECT |
| beforeShellExecution | permission=ask | ACCEPTED-BUT-IGNORED |
| beforeShellExecution | exit code 2 | TAKES-EFFECT (regardless of failClosed) |
| subagentStop | followup_message | UNCONFIRMED |
| afterAgentResponse | response payload field | UNCONFIRMED reliability |
| afterFileEdit | typed override | UNCONFIRMED |
| sessionStart | env / additional_context | UNCONFIRMED (no v2 records) |
| stop_hook_loop_limit (config) | DEPRECATED | warn-and-ignore |

See [docs/internal/hook-response-fields.md](../internal/hook-response-fields.md) for the full table with evidence IDs.

---

## Environment Variables

All hook processes receive the following `CURSOR_*` environment variables regardless of event type. These were consistently observed across all 459 evidence records.

| Variable | Value pattern | Always present | Notes |
|----------|---------------|---------------|-------|
| `CURSOR_PROJECT_DIR` | absolute path to workspace root | yes | e.g. `<repo>` |
| `CURSOR_EXTENSION_HOST_ROLE` | `always-local` | yes | Constant in this build |
| `CURSOR_WORKSPACE_LABEL` | workspace folder name | yes | e.g. `oh-my-openagent` |
| `CURSOR_LAYOUT` | `unifiedAgent` | yes | Constant in this build |
| `CURSOR_USER_EMAIL` | authenticated user email | yes | Redacted to `<email>` in evidence |
| `CURSOR_VERSION` | `3.1.15` | yes | Matches `cursor_version` in payload |
| `CLAUDE_PROJECT_DIR` | same as `CURSOR_PROJECT_DIR` | yes | Alias; both are set |

---

## Response Contract Overview

| Decision | JSON field | Enforced events | Not-enforced events | Notes |
|----------|-----------|----------------|--------------------|----|
| `allow` | `{"decision":"allow"}` | preToolUse, beforeShellExecution, beforeMCPExecution, subagentStart, beforeReadFile | — | Exit 0 with no body = allow on all guard events |
| `deny` | `{"decision":"deny"}` | preToolUse, beforeShellExecution, subagentStart | postToolUse, afterFileEdit, afterShellExecution | Denial on post-execution events has no effect |
| `ask` | `{"decision":"ask"}` | preToolUse (treated as deny) | beforeShellExecution (not enforced; see Appendix C) | Behaviour varies by event; see per-event sections |
| exit code 2 | — (no body) | beforeShellExecution | — | Equivalent to deny; simpler for shell scripts |
| `user_message` | `{"user_message":"..."}` | beforeShellExecution | — | Shown to user in Cursor UI alongside block message |
| `agent_message` | `{"agent_message":"..."}` | beforeShellExecution | — | Injected into agent context; agent reads it |
| `updated_input` | `{"updated_input":{...}}` | preToolUse | — | Replaces tool_input before execution |
| `additional-context` | `{"decision":"additional-context","context":"..."}` | postToolUse | — | Injects context into agent turn |
| `followup_message` | `{"followup_message":"..."}` | stop | — | Auto-submits message on loop end |
| malformed JSON + failClosed=true | — | beforeShellExecution | — | Treated as deny |
| malformed JSON + failClosed=false | — | — | beforeShellExecution | Treated as allow (silent) |

---

## 1. sessionStart

**Category:** manual-UI / session  
**Source cite:** `workbench.desktop.main.js:28903` (`bv` enum literal `sessionStart`)  
**Documentation:** [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)

Fires at the start of an agent session. Requires a manual session boundary (new conversation or session restart) to trigger; no automated probe was possible in this pass.

**Input schema (from docs, unverified):**

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `session_id` | string (uuid) | yes | Session identifier |
| `conversation_id` | string (uuid) | yes | Conversation identifier |
| `hook_event_name` | `"sessionStart"` | yes | Envelope field |
| `cursor_version` | string | yes | Envelope field |
| `workspace_roots` | string[] | yes | Envelope field |
| `user_email` | string | yes | Envelope field |

**Output:** Not empirically tested in this pass. Per docs, session hooks do not enforce a response contract.

**Status:** Untested in this pass; requires manual UI trigger. (See `docs/internal/hook-response-fields.md` for current status.)

---

## 2. sessionEnd

**Category:** manual-UI / session  
**Source cite:** `workbench.desktop.main.js:28903`  
**Documentation:** [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)

Fires at session end. Requires manual session termination.

**Input schema (from docs, unverified):**

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `session_id` | string (uuid) | yes | Session identifier |
| `conversation_id` | string (uuid) | yes | Envelope field |
| `hook_event_name` | `"sessionEnd"` | yes | Envelope field |
| `cursor_version` | string | yes | Envelope field |
| `workspace_roots` | string[] | yes | Envelope field |
| `user_email` | string | yes | Envelope field |

**Output:** Not empirically tested in this pass. Per docs, session hooks do not enforce a response contract.

**Status:** Untested in this pass; requires manual UI trigger. (See `docs/internal/hook-response-fields.md` for current status.)

---

## 3. preToolUse

**Category:** agent-triggerable / guard  
**Evidence fires:** 171 (6 distinct experiment IDs across waves C and AB)  
**Registry cells:** 12 (wave C: logger matrix; wave AB: logger, deny, allow, updated-input, user-message, agent-message, ask)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug of invoking agent, e.g. `composer-2-fast` |
| `hook_event_name` | `"preToolUse"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Redacted to `<email>` in evidence |
| `transcript_path` | string \| null | yes | Path to conversation JSONL; null observed |
| `session_id` | string (uuid) | yes | Matches `conversation_id` in observed records |
| `tool_name` | string | yes | e.g. `"Shell"`, `"Read"`, `"Write"`, `"MCP:server:tool"` |
| `tool_input` | object | yes | Tool-specific input object |
| `tool_use_id` | string | yes | Unique ID for this tool invocation |
| `cwd` | string | yes | Current working directory; may be empty string |

**Sample payload (W-C-preToolUse-logger-001):**
```json
{
  "model": "composer-2-fast",
  "tool_name": "Shell",
  "tool_input": {"command": "jq 'keys' ~/.cursor/hooks.json", "cwd": "", "timeout": 30000},
  "tool_use_id": "a0dc9ba3-5453-4096-a54b-b4fc9719d375",
  "cwd": ""
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `decision` | `"allow"\|"deny"\|"ask"` | yes | yes (allow/deny); ask = deny | Omit or `"allow"` = pass through |
| `user_message` | string | yes | untested | Shown to user on deny (See `docs/internal/hook-response-fields.md` for current status.) |
| `agent_message` | string | yes | untested | Injected into agent context (See `docs/internal/hook-response-fields.md` for current status.) |
| `updated_input` | object | yes | yes | Replaces `tool_input` before execution; registry cell W-AB-preToolUse-updated-input-004 |

### Matcher target

Matched against `tool_name`. For agent-invoked MCP tools, the tool_name takes the form `MCP:<server>:<tool>` (e.g. `MCP:websearch:ping`), confirmed by registry cell W-C-preToolUse-logger-005 with `matcher=^MCP:.*` firing.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `ask` decision: listed in registry (W-AB-preToolUse-ask-007) but enforcement not confirmed in this pass. Treat `ask` as `deny` until verified.

### Worked example

**experiment_id:** `W-C-preToolUse-logger-001`  
A no-op logger hook (exit 0, no JSON body) attached to all tool calls via `matcher=""` (matches unconditionally). Confirmed fires on every Shell, Read, Write, and MCP tool invocation. 171 total fires observed across the session. Response: exit 0 → tool proceeds normally. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-C-preToolUse-logger-001`).

---

## 4. postToolUse

**Category:** agent-triggerable / transform (observe + context injection)  
**Evidence fires:** 136 (8 distinct experiment IDs across waves C and AB)  
**Registry cells:** 12 (wave C: logger matrix; wave AB: logger, deny, allow, additional-context ×2; wave H: additional-context canary)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"postToolUse"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `tool_name` | string | yes | Tool name matching preToolUse |
| `tool_input` | object | yes | Same input sent to tool |
| `tool_output` | string | yes | JSON-encoded tool result, e.g. `{"output":"...","exitCode":0}` for Shell |
| `duration` | float | yes | Tool execution time in milliseconds |
| `tool_use_id` | string | yes | Matches preToolUse `tool_use_id` |
| `cwd` | string | yes | Working directory |

**Sample payload (W-AB-postToolUse-logger-008):**
```json
{
  "model": "composer-2-fast",
  "tool_name": "Shell",
  "tool_input": {"command": "jq 'keys' ~/.cursor/hooks.json", "cwd": "", "timeout": 30000},
  "tool_output": "{\"output\":\"[\\n  \\\"hooks\\\",\\n  \\\"version\\\"\\n]\\n1\\n14\\n\",\"exitCode\":0}",
  "duration": 79.238,
  "tool_use_id": "a0dc9ba3-5453-4096-a54b-b4fc9719d375",
  "cwd": ""
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `decision` | `"additional-context"` | yes | partially | Injects context into agent turn |
| `context` | string | yes | partially | Text injected when `decision="additional-context"` |
| `decision` | `"deny"` | likely yes | **no** | Tool has already executed; deny has no retrospective effect |

### Matcher target

Matched against `tool_name`. Same format as `preToolUse` — `"Shell"`, `"Read"`, `"Write"`, `"MCP:server:tool"`.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `deny` decision: registry cell W-AB-postToolUse-deny fires but the tool has already completed; denial is not retroactive.
- `additional-context` canary (W-H-postToolUse-additional-context-001): the LLM was expected to repeat an injected string in its next response. Enforcement of context injection was partially confirmed but not fully validated for all models.

### Worked example

**experiment_id:** `W-AB-postToolUse-logger-008`  
Logger hook attached to Shell tool via `matcher="^Shell$"`. Confirmed fires immediately after every Shell tool completes. `tool_output` contains the JSON-encoded result including `exitCode`. 136 total fires observed. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-AB-postToolUse-logger-008`).

---

## 5. postToolUseFailure

**Category:** agent-triggerable / observe  
**Evidence fires:** 7 (1 distinct experiment ID: W-AB-postToolUseFailure-logger-013)  
**Registry cells:** 1

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"postToolUseFailure"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `tool_name` | string | yes | e.g. `"Shell"` |
| `tool_input` | object | yes | Input that was passed to the tool |
| `error_message` | string | yes | Human-readable error; e.g. `"Command execution was blocked by a hook: denied by experiment"` |
| `failure_type` | string | yes | e.g. `"permission_denied"` |
| `duration` | float | yes | `0` when blocked before execution |
| `tool_use_id` | string | yes | Matches the failed tool invocation |
| `is_interrupt` | boolean | yes | `false` observed |
| `cwd` | string | yes | Working directory at failure time |

**Sample payload (W-AB-postToolUseFailure-logger-013):**
```json
{
  "model": "claude-opus-4-7",
  "tool_name": "Shell",
  "tool_input": {"command": "echo CURSOR_HOOK_V2_AB_BSH_020", "cwd": "<repo>", "timeout": 30000},
  "error_message": "Command execution was blocked by a hook: denied by experiment\n\nTo view or modify configured hooks, go to Cursor Settings > Hooks.\n\nAgent note: Do not suggest workarounds to the blocked tool.",
  "failure_type": "permission_denied",
  "duration": 0,
  "tool_use_id": "b3ac44b6-0259-40fa-b6ac-16baf75fbd91",
  "is_interrupt": false,
  "cwd": "<repo>"
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| — | — | — | no | Observation event; output is ignored |

### Matcher target

Matched against `tool_name`.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- The 7 fires in evidence were triggered as a downstream consequence of `beforeShellExecution` deny blocks; `postToolUseFailure` fires whenever any tool fails for any reason.
- `error_message` includes the `agent_message` text from the denying hook appended after the standard block notice.

### Worked example

**experiment_id:** `W-AB-postToolUseFailure-logger-013`  
A logger hook on Shell (matcher `^Shell$`) captured the failure payload that occurred when `W-AB-beforeShellExecution-deny-020` blocked a command. The `failure_type` was `"permission_denied"` and `duration` was 0, confirming the command never ran. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-AB-postToolUseFailure-logger-013`).

---

## 6. subagentStart

**Category:** agent-triggerable / guard  
**Evidence fires:** 1 (1 distinct experiment ID: W-C-subagentStart-logger-031)  
**Registry cells:** 10 (wave C: logger matrix; wave AB: deny, allow)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope (equals `conversation_id` in observed record) |
| `model` | string | yes | Parent model slug |
| `hook_event_name` | `"subagentStart"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string | yes | Parent conversation transcript path |
| `session_id` | string (uuid) | yes | Envelope |
| `subagent_id` | string | yes | Tool call ID of the subagent invocation, e.g. `toolu_01FPi5Rms9GkcQrRATjdTmWJ` |
| `subagent_type` | string | yes | e.g. `"general-purpose"` |
| `task` | string | yes | Task description; **observed empty string even when task was provided** (see Appendix C) |
| `parent_conversation_id` | string (uuid) | yes | Parent conversation ID |
| `tool_call_id` | string | yes | Identical to `subagent_id` in observed record |
| `is_parallel_worker` | boolean | yes | `false` observed |
| `subagent_model` | string | **no** | Documented in cursor.com/docs but **not present** in observed payload |

**Sample payload (W-C-subagentStart-logger-031):**
```json
{
  "model": "claude-opus-4-7",
  "subagent_id": "toolu_01FPi5Rms9GkcQrRATjdTmWJ",
  "subagent_type": "general-purpose",
  "task": "",
  "parent_conversation_id": "7b31b662-fabf-4de6-ae5b-7b72fd17c609",
  "tool_call_id": "toolu_01FPi5Rms9GkcQrRATjdTmWJ",
  "is_parallel_worker": false
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `decision` | `"allow"\|"deny"` | yes | yes | `deny` blocks subagent spawn |
| `decision` | `"ask"` | likely yes | **treated as deny** per cursor.com/docs | Not separately tested in this pass |

### Matcher target

Matcher target for `subagentStart` is untested in this pass. Based on registry cell patterns, likely matched against `subagent_type` or a literal string. Wave C logger cells used empty matcher (unconditional). (See `docs/internal/hook-response-fields.md` for current status.)

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `task` field is empty string in the observed payload despite the parent agent providing a task description to the Task tool. This is a known quirk in Cursor 3.1.15 (see Appendix C).
- `subagent_model` field is documented in cursor.com/docs but was absent from all observed payloads.

### Worked example

**experiment_id:** `W-C-subagentStart-logger-031`  
Logger hook (no matcher) captured the subagent spawn event when a general-purpose subagent was invoked from the parent orchestrator. Only 1 fire was observed in the session because subagents were used sparingly during wave C. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-C-subagentStart-logger-031`).

---

## 7. subagentStop

**Category:** agent-triggerable / observe  
**Evidence fires:** 2 (2 distinct experiment IDs: W-C-subagentStop-logger-036, W-AB-subagentStop-logger-042)  
**Registry cells:** 10 (wave C: logger matrix; wave AB: logger)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope (equals `conversation_id`) |
| `model` | string | yes | Parent model slug |
| `hook_event_name` | `"subagentStop"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string | yes | Parent conversation transcript path |
| `session_id` | string (uuid) | yes | Envelope |
| `subagent_id` | string | yes | Matches `subagentStart` subagent_id |
| `subagent_type` | string | yes | e.g. `"general-purpose"` |
| `status` | string | yes | e.g. `"completed"` |
| `duration_ms` | integer | yes | Wall-clock ms for subagent execution |
| `parent_conversation_id` | string (uuid) | yes | Parent conversation ID |
| `message_count` | integer | yes | Number of messages in subagent; `0` observed |
| `tool_call_count` | integer | yes | Number of tool calls; `0` observed |
| `loop_count` | integer | yes | Number of agent loop iterations; `0` observed |
| `task` | string | yes | Empty string (same quirk as subagentStart) |
| `description` | string | yes | Empty string observed |
| `agent_transcript_path` | string \| null | yes | `null` observed |

**Sample payload (W-C-subagentStop-logger-036):**
```json
{
  "model": "claude-opus-4-7",
  "subagent_id": "toolu_01LSxNsFuQZrnDDFWWZBMDXK",
  "subagent_type": "general-purpose",
  "status": "completed",
  "duration_ms": 53111,
  "parent_conversation_id": "7b31b662-fabf-4de6-ae5b-7b72fd17c609",
  "message_count": 0,
  "tool_call_count": 0,
  "loop_count": 0,
  "task": "",
  "description": "",
  "agent_transcript_path": null
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| — | — | — | no | Observation event; output is ignored |

### Matcher target

Likely matched against `subagent_type`. Wave C logger cells used empty matcher (unconditional).

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `message_count`, `tool_call_count`, and `loop_count` were all 0 in observed records even though the subagent performed work. These counters may not propagate correctly in this build.
- `agent_transcript_path` was `null`; the transcript was accessible via the parent `transcript_path` but the subagent-specific path was not populated.

### Worked example

**experiment_id:** `W-C-subagentStop-logger-036`  
Logger hook captured completion of a general-purpose subagent. `duration_ms` was 53111ms (53 seconds), confirming the timing reflects actual subagent wall-clock time. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-C-subagentStop-logger-036`).

---

## 8. beforeShellExecution

**Category:** agent-triggerable / guard  
**Evidence fires:** 63 (19 distinct experiment IDs across waves C, D, and AB)  
**Registry cells:** 33 — the most extensively probed event: allow/deny/malformed-json/exit-2 × failClosed variants, timeout variants, user_message, agent_message, ask, prompt-type hooks

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"beforeShellExecution"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `command` | string | yes | The full shell command string as passed to the Shell tool |
| `cwd` | string | yes | Working directory; may be empty string |
| `sandbox` | boolean | yes | Whether command runs in sandbox; `true` observed |

**Sample payload (W-AB-beforeShellExecution-deny-020):**
```json
{
  "model": "claude-opus-4-7",
  "command": "echo \"CURSOR_HOOK_V2_AB_BSH_020\" 2>&1",
  "cwd": "<repo>",
  "sandbox": true
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `decision` | `"deny"` | yes | **yes** | Blocks the shell command; confirmed W-AB-beforeShellExecution-deny-020 |
| `decision` | `"allow"` | yes | yes | Explicitly allows; indistinguishable from exit 0 with no body |
| `decision` | `"ask"` | yes | **no** (not enforced) | Hook fires but command runs anyway; see Appendix C |
| `user_message` | string | yes | yes | Appended to the block message shown in Cursor UI |
| `agent_message` | string | yes | yes | Injected into agent context; agent reads and responds to it |
| exit code 2 | — | — | **yes** | Alternative to JSON deny; script exits with code 2 to block |
| malformed JSON + failClosed=true | — | — | yes (deny) | Silent deny; see Appendix C |
| malformed JSON + failClosed=false | — | — | yes (allow) | Silent allow; see Appendix C |

### Matcher target

Matched against the full `command` string (substring match). When the matcher pattern appears anywhere in the command text, the entire command is blocked. Confirmed by W-AB-beforeShellExecution-deny-020 where a sentinel substring in the command triggered the deny hook.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `ask` decision is not enforced on `beforeShellExecution` in Cursor 3.1.15: hook fires and Cursor proceeds with the command as if `allow` was returned (see Appendix C).
- Malformed JSON with `failClosed=false` silently allows the command without any user notification — a known risk for security-critical deployments (forum 152669).
- Prompt-type hooks (`type: "prompt"`) do not invoke the `command` shell script; Cursor evaluates the prompt internally via LLM (see Appendix C).

### Worked example

**experiment_id:** `W-AB-beforeShellExecution-deny-020`  
Deny hook scoped to sentinel `CURSOR_HOOK_V2_AB_BSH_020` with `user_message="denied by experiment"` and `agent_message="Do not suggest workarounds to the blocked tool."` The agent's Shell invocation was blocked. Observed in Cursor UI: `"Rejected: Command execution was blocked by a hook: denied by experiment."` Agent received the agent_message and acknowledged it. This was the pre-flight probe that confirmed response-contract observability for all subsequent waves. Evidence: `docs/internal/hooks-evidence-v2.jsonl` + `docs/internal/_preflight.json`.

---

## 9. afterShellExecution

**Category:** agent-triggerable / observe  
**Evidence fires:** 37 (3 distinct experiment IDs: W-C-afterShellExecution-logger-016/017/019)  
**Registry cells:** 6 (wave C: logger matrix)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"afterShellExecution"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `command` | string | yes | The shell command that was executed |
| `output` | string | yes | Combined stdout+stderr output of the command |
| `duration` | float | yes | Execution time in milliseconds |
| `sandbox` | boolean | yes | Sandbox flag; `true` observed |
| `exit_code` | integer | **not observed** | Documented in cursor.com/docs but absent from 37 observed payloads |

**Sample payload (W-C-afterShellExecution-logger-016):**
```json
{
  "model": "composer-2-fast",
  "command": "jq 'keys' ~/.cursor/hooks.json",
  "output": "[\n  \"hooks\",\n  \"version\"\n]\n",
  "duration": 79.238,
  "sandbox": true
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| — | — | — | no | Observation event; command has already executed |

### Matcher target

Matched against the `command` string (same as `beforeShellExecution`).

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `exit_code` field documented at cursor.com/docs was **not present** in any of the 37 observed `afterShellExecution` payloads. Hooks cannot directly inspect the shell exit code from this event's payload in Cursor 3.1.15.
- The `output` field appears to contain only stdout in observed records; stderr separation is not confirmed.

### Worked example

**experiment_id:** `W-C-afterShellExecution-logger-016`  
Unconditional logger hook captured shell command output including `exitCode` embedded in the `output` string (as text). Confirmed that `duration` reflects actual wall-clock time (79ms). 37 total fires across the session. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-C-afterShellExecution-logger-016`).

---

## 10. beforeMCPExecution

**Category:** agent-triggerable / guard  
**Evidence fires:** 6 (3 distinct experiment IDs: W-C-beforeMCPExecution-logger-021/025, W-AB-beforeMCPExecution-logger-026)  
**Registry cells:** 11 (wave C: logger matrix; wave AB: logger, deny, allow, ask, user-message, agent-message)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"beforeMCPExecution"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `tool_name` | string | yes | MCP tool name, e.g. `"ping"` |
| `tool_input` | string | yes | JSON-encoded input for the MCP tool, e.g. `"{}"` (note: string, not object) |
| `command` | string | yes | MCP server name, e.g. `"websearch"` |

**Sample payload (W-C-beforeMCPExecution-logger-021):**
```json
{
  "model": "claude-opus-4-7",
  "tool_name": "ping",
  "tool_input": "{}",
  "command": "websearch"
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `decision` | `"deny"\|"allow"` | yes | partially tested | Deny cells exist in registry; enforcement not confirmed in this pass |
| `decision` | `"ask"` | yes | untested | Registry cell W-AB-beforeMCPExecution-ask-029 (See `docs/internal/hook-response-fields.md` for current status.) |
| `user_message` | string | yes | untested | Registry cell W-AB-beforeMCPExecution-user-message-030 |
| `agent_message` | string | yes | untested | Registry cell W-AB-beforeMCPExecution-agent-message-031 |

### Matcher target

Matched against a string of the form `MCP:<server>:<tool>` (e.g. `MCP:websearch:ping`). This is confirmed by registry cell W-C-beforeMCPExecution-logger-025 with `matcher=^MCP:.*` firing 6 times. The `command` field (server name) and `tool_name` are concatenated into this synthetic match target by Cursor.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- Deny enforcement on `beforeMCPExecution` was not directly confirmed in this pass (only logger cells fired). Treat deny as likely-enforced based on pattern parity with `beforeShellExecution`.
- `tool_input` is a JSON string (not a parsed object) unlike `preToolUse.tool_input` which is an object.

### Worked example

**experiment_id:** `W-C-beforeMCPExecution-logger-021`  
Unconditional logger hook captured an MCP `ping` call to the `websearch` server. The `command` field contains the server name, while `tool_name` holds the MCP tool name. 6 total fires observed (all from MCP calls during wave C and AB). Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-C-beforeMCPExecution-logger-021`).

---

## 11. afterMCPExecution

**Category:** agent-triggerable / observe  
**Evidence fires:** 6 (3 distinct experiment IDs: W-C-afterMCPExecution-logger-026/027, W-AB-afterMCPExecution-logger-032)  
**Registry cells:** 6 (wave C: logger matrix; wave AB: logger)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"afterMCPExecution"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `tool_name` | string | yes | MCP tool name, e.g. `"ping"` |
| `tool_input` | string | yes | JSON-encoded input (same as `beforeMCPExecution`) |
| `result_json` | string | yes | JSON-encoded MCP tool result, e.g. `"{}"` |
| `duration` | float | yes | Execution time in milliseconds |

**Sample payload (W-C-afterMCPExecution-logger-026):**
```json
{
  "model": "claude-opus-4-7",
  "tool_name": "ping",
  "tool_input": "{}",
  "result_json": "{}",
  "duration": 7910.998
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| — | — | — | no | Observation event; MCP call has already returned |

### Matcher target

Same `MCP:<server>:<tool>` format as `beforeMCPExecution`. The `command` field (server name) is absent from `afterMCPExecution` payload — matcher must rely on `tool_name` alone or the synthetic MCP prefix.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `command` (server name) field is absent from `afterMCPExecution` payload, unlike `beforeMCPExecution`. Cannot distinguish which server ran the tool from the payload alone.

### Worked example

**experiment_id:** `W-C-afterMCPExecution-logger-026`  
Unconditional logger captured MCP result after a `ping` call to `websearch`. `duration` was 7910ms (7.9 seconds), reflecting actual MCP round-trip latency. `result_json` was `"{}"` for this particular probe. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-C-afterMCPExecution-logger-026`).

---

## 12. beforeReadFile

**Category:** agent-triggerable / guard  
**Evidence fires:** 3 (1 distinct experiment ID: W-AB-beforeReadFile-logger-033)  
**Registry cells:** 5 (wave AB: logger, deny, ask, and variants)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"beforeReadFile"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `file_path` | string | yes | Absolute path of the file being read |
| `content` | string | yes | **The file content is pre-read and included in the payload** (see note) |
| `attachments` | array | yes | `[]` observed; purpose unclear |

**Important:** `content` contains the actual file content at the moment the hook fires. The file is read before the hook executes; the hook can inspect content but cannot prevent the physical disk read — only the agent's receipt of the content.

**Sample payload (W-AB-beforeReadFile-logger-033):**
```json
{
  "model": "composer-2-fast",
  "file_path": "/tmp/cursor-hooks-evidence/_install-preregister.json",
  "content": "{\n  \"ts\": \"2026-04-17T15:24:16Z\",\n  \"mega_config_bytes\": 29086,\n  \"event_count\": 14\n}\n",
  "attachments": []
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `decision` | `"deny"` | yes | partially tested | Registry cell W-AB-beforeReadFile-deny-034; enforcement not confirmed in this pass |
| `decision` | `"ask"` | yes | untested | Registry cell W-AB-beforeReadFile-ask-037 (See `docs/internal/hook-response-fields.md` for current status.) |

### Matcher target

Matched against the tool name `"Read"` (the Cursor Read tool). Confirmed by registry cells using `matcher=^Read$`. The matcher does NOT appear to match against `file_path`; sentinel-scoping in the `file_path` mentioned in the registry expected-outcome refers to a test design choice, not a matcher feature.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `beforeReadFile` fires for the Cursor `Read` tool, not for raw filesystem reads from shell commands. Shell `cat` or `grep` commands are covered by `beforeShellExecution`, not this event.
- Only 3 fires were observed because the experiment session used the Read tool sparingly. Most file reads in the session were via shell commands.

### Worked example

**experiment_id:** `W-AB-beforeReadFile-logger-033`  
Logger hook with `matcher=^Read$` captured a Read tool invocation on a JSON evidence file. The full file content was present in the payload `content` field, confirming pre-read behavior. 3 total fires. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-AB-beforeReadFile-logger-033`).

---

## 13. afterFileEdit

**Category:** agent-triggerable / observe  
**Evidence fires:** 2 (1 distinct experiment ID: W-AB-afterFileEdit-logger-038)  
**Registry cells:** 3 (wave AB: logger `^Write$`, deny `^Write$`, and a variant)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"afterFileEdit"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `file_path` | string | yes | Absolute path of the edited file |
| `edits` | array of objects | yes | Each object has `old_string` and `new_string` |

**Sample payload (W-AB-afterFileEdit-logger-038):**
```json
{
  "model": "claude-opus-4-7",
  "file_path": "/tmp/cursor-hooks-evidence/_preflight.json",
  "edits": [
    {
      "old_string": "",
      "new_string": "{\n  \"passed\": true,\n  \"experiment_id\": \"W-AB-beforeShellExecution-deny-020\"\n}\n"
    }
  ]
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `decision` | `"deny"` | likely yes | **no** | File has already been edited; deny is retrospective and has no effect. Registry cell W-AB-afterFileEdit-deny-039 was a "negative control" to confirm this. |

### Matcher target

Matched against `tool_name` (the Write/StrReplace/etc. tool name), NOT against `file_path`. Registry cells use `matcher=^Write$`.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- Deny is not enforced: the edit has already been written to disk when this hook fires.
- Only 2 fires because the session used the Write tool rarely (most writes were via shell commands).

### Worked example

**experiment_id:** `W-AB-afterFileEdit-logger-038`  
Logger hook on `^Write$` captured a Write-tool invocation that created the `_preflight.json` evidence file. The `edits` array showed the exact diff (empty `old_string`, full JSON content as `new_string`). Confirmed that `edits` reflects the actual content written. 2 total fires. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-AB-afterFileEdit-logger-038`).

---

## 14. beforeTabFileRead

**Category:** tab-specific / guard  
**Source cite:** `workbench.desktop.main.js:28903`  
**Documentation:** [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)

Tab-only event. Fires before the Cursor Tab feature reads a file for context. **Does not fire for agent Read tool invocations** — those are covered by `beforeReadFile`. No automated probe was possible; requires manual Tab trigger.

**Status:** Untested in this pass; requires manual UI trigger via Tab feature.

**Input schema (from docs, unverified):**

| Field | Type | Notes |
|-------|------|-------|
| `file_path` | string | Path of file Tab is about to read |
| (standard envelope fields) | — | conversation_id, session_id, etc. |

---

## 15. afterTabFileEdit

**Category:** tab-specific / observe  
**Source cite:** `workbench.desktop.main.js:28903`  
**Documentation:** [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)

Tab-only event. Fires after the Cursor Tab feature edits a file. **Does not fire for agent Write/StrReplace tool invocations** — those are covered by `afterFileEdit`. No automated probe was possible; requires manual Tab trigger.

**Status:** Untested in this pass; requires manual UI trigger via Tab feature.

**Input schema (from docs, unverified):**

| Field | Type | Notes |
|-------|------|-------|
| `file_path` | string | Path of file Tab edited |
| `edits` | array | Edit objects with old/new content |
| (standard envelope fields) | — | |

---

## 16. stop

**Category:** agent-triggerable / continuation  
**Evidence fires:** 5 (5 distinct experiment IDs: W-AB-stop-logger-041, W-EK-stop-followup-message-001/002/003/004)  
**Registry cells:** 5 (wave AB: logger; wave EK: followup-message with loop_limit variants null/1/3/omit)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"stop"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string | yes | Path to conversation JSONL transcript |
| `session_id` | string (uuid) | yes | Envelope |
| `status` | string | yes | e.g. `"completed"` |
| `loop_count` | integer | yes | Number of agent loop iterations in the turn |
| `input_tokens` | integer | yes | Total input tokens consumed |
| `output_tokens` | integer | yes | Total output tokens generated |
| `cache_read_tokens` | integer | yes | Prompt cache read tokens |
| `cache_write_tokens` | integer | yes | Prompt cache write tokens |

**Sample payload (W-EK-stop-followup-message-001):**
```json
{
  "model": "claude-opus-4-7",
  "status": "completed",
  "loop_count": 0,
  "input_tokens": 1003983,
  "output_tokens": 11466,
  "cache_read_tokens": 741992,
  "cache_write_tokens": 261987
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| `followup_message` | string | yes | **yes** | Auto-submits the string as the next user message |
| `loop_limit` | integer \| null | (hook config) | yes | In hook definition, not stdout; controls max re-fires |

### Matcher target

Registry cells used `matcher="Stop"` (literal substring) and it fired. The exact target string matched is unclear — possibly the `status` field value `"completed"` contains no "Stop", suggesting the matcher may match against the hook_event_name `"stop"` or a synthetic label. Wave AB logger used empty matcher (unconditional).

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- `loop_limit: null` (no limit) on a `followup_message` hook creates an **infinite auto-submit loop**. This was triggered accidentally in the session and caused repeated message submissions. Stop hooks were removed mid-session as a safety measure (backup: `/tmp/hooks.json.megapatch-pre-stop-removal-20260417T152548Z`).
- Multiple `stop` hooks with `followup_message` merge their messages into a single auto-submitted message (not multiple separate submissions).
- `loop_count` was `0` in observed records even during a session with many tool calls. This counter may not reflect the parent conversation's loop count.

### Worked example

**experiment_id:** `W-EK-stop-followup-message-001`  
Followup-message hook with `loop_limit=null` and `matcher="Stop"`. Fired when the agent turn completed. The hook response caused Cursor to auto-submit a followup message in the next turn. **This triggered a loop** because `loop_limit=null` means no cap. The session had to be interrupted by removing the stop hook from `~/.cursor/hooks.json`. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-EK-stop-followup-message-001`).

---

## 17. beforeSubmitPrompt

**Category:** manual-UI / continuation  
**Source cite:** `workbench.desktop.main.js:28903`  
**Documentation:** [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)

Fires before the user submits a prompt in the Cursor UI. Requires manual prompt submission; does not fire for agent-generated follow-up messages in the automated loop. No automated probe was possible.

**Status:** Untested in this pass; requires manual UI trigger. (See `docs/internal/hook-response-fields.md` for current status.)

**Input schema (from docs, unverified):**

| Field | Type | Notes |
|-------|------|-------|
| `prompt` | string | The prompt text about to be submitted |
| (standard envelope fields) | — | |

---

## 18. afterAgentResponse

**Category:** agent-triggerable / observe  
**Evidence fires:** 1 (1 distinct experiment ID: W-AB-afterAgentResponse-logger-043)  
**Registry cells:** 1 (wave AB: logger)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"afterAgentResponse"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `text` | string | yes | Full text of the agent's final response for the turn |
| `input_tokens` | integer | yes | Total input tokens for the turn |
| `output_tokens` | integer | yes | Total output tokens for the turn |
| `cache_read_tokens` | integer | yes | Prompt cache read tokens |
| `cache_write_tokens` | integer | yes | Prompt cache write tokens |

**Sample payload (W-AB-afterAgentResponse-logger-043):**
```json
{
  "model": "claude-opus-4-7",
  "text": "Mega-config is installed at `~/.cursor/hooks.json` — 14 events, 116 hook entries...",
  "input_tokens": 1003983,
  "output_tokens": 11466,
  "cache_read_tokens": 741992,
  "cache_write_tokens": 261987
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| — | — | — | no | Observation event; response already delivered to user |

### Matcher target

No matcher was applied in evidence (empty matcher, unconditional). Likely matches against `hook_event_name` or a synthetic label if matcher is used.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- Only 1 fire observed, corresponding to the one turn where the hook was active. Hook fires once per agent turn completion, not once per streaming chunk.

### Worked example

**experiment_id:** `W-AB-afterAgentResponse-logger-043`  
Logger captured the full text of the agent's installation-confirmation response (>500 words). Token counts matched the `stop` event payload from the same turn, confirming `afterAgentResponse` and `stop` share token accounting. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-AB-afterAgentResponse-logger-043`).

---

## 19. afterAgentThought

**Category:** agent-triggerable / observe  
**Evidence fires:** 19 (1 distinct experiment ID: W-AB-afterAgentThought-logger-044)  
**Registry cells:** 1 (wave AB: logger)

### Input schema

| Field | Type | Always present? | Notes |
|-------|------|----------------|-------|
| `conversation_id` | string (uuid) | yes | Envelope |
| `generation_id` | string (uuid) | yes | Envelope |
| `model` | string | yes | Model slug |
| `hook_event_name` | `"afterAgentThought"` | yes | Envelope |
| `cursor_version` | string | yes | Envelope |
| `workspace_roots` | string[] | yes | Envelope |
| `user_email` | string | yes | Envelope |
| `transcript_path` | string \| null | yes | Envelope |
| `session_id` | string (uuid) | yes | Envelope |
| `text` | string | yes | The agent's internal reasoning / thinking text |
| `duration_ms` | integer | yes | Time taken to generate the thought in milliseconds |
| `model` | string | yes | Model slug (also in envelope; same value) |

**Sample payload (W-AB-afterAgentThought-logger-044):**
```json
{
  "model": "claude-opus-4-7",
  "text": "Mega-config is now installed at the user level with 14 events and 116 hook entries, baselines are backed up, and the plugin path remains untouched. I need to pause here and have the user restart Cursor...",
  "duration_ms": 3893
}
```

### Output schema

| Field | Type | Accepted by parser? | Enforced? | Notes |
|-------|------|--------------------|---------|----|
| — | — | — | no | Observation event; thought already generated |

### Matcher target

No matcher applied in evidence (unconditional). The event fires for every internal reasoning step the model takes; 19 fires observed in a single session with `claude-opus-4-7`.

### Env vars

All common `CURSOR_*` env vars — see § Environment Variables.

### Known regressions

- The `text` field contains raw internal reasoning — this is thinking/scratchpad content, not the final response. Care is needed when logging this in production (privacy implications).
- `duration_ms` reflects generation latency for the thought, not wall-clock time since previous thought.

### Worked example

**experiment_id:** `W-AB-afterAgentThought-logger-044`  
Unconditional logger captured 19 reasoning steps during a single agent turn. The `text` fields showed the model's step-by-step reasoning about hook installation, restart coordination, and pre-flight planning. `duration_ms` ranged from ~1000ms to ~5000ms per thought. Evidence: `docs/internal/hooks-evidence-v2.jsonl` (filter `experiment_id` = `W-AB-afterAgentThought-logger-044`).

---

## 20. preCompact

**Category:** manual-UI / session  
**Source cite:** `workbench.desktop.main.js:28903`  
**Documentation:** [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks)

Fires before context compaction occurs (triggered by `/summarize` or automatic compaction at context limit). Allows hooks to inject context that should survive compaction. Requires the compaction threshold to be reached or `/summarize` to be invoked manually; no automated probe was possible.

**Status:** Untested in this pass; requires manual trigger via `/summarize` or context limit.

**Input schema (from docs, unverified):**

| Field | Type | Notes |
|-------|------|-------|
| (standard envelope fields) | — | No event-specific fields documented |

---

## Appendix A: Untested but Canonical (manual-UI-only)

These 6 events appear in the `bv` enum at `workbench.desktop.main.js:28903` and are documented at [cursor.com/docs/agent/hooks](https://cursor.com/docs/agent/hooks). They could not be triggered by the automated agent-loop probe harness used in this pass.

| Event | Category | Reason for descope | Source |
|-------|----------|-------------------|--------|
| `sessionStart` | Session boundary | Requires Cursor restart or new conversation creation | `workbench.desktop.main.js:28903` |
| `sessionEnd` | Session boundary | Requires conversation close or Cursor shutdown | `workbench.desktop.main.js:28903` |
| `beforeTabFileRead` | Tab feature | Fires only during Tab (autocomplete) file reads, not agent Read tool | `workbench.desktop.main.js:28903` |
| `afterTabFileEdit` | Tab feature | Fires only during Tab (autocomplete) file edits, not agent Write tool | `workbench.desktop.main.js:28903` |
| `beforeSubmitPrompt` | User prompt gate | Requires manual user prompt submission in the chat UI | `workbench.desktop.main.js:28903` |
| `preCompact` | Context management | Requires `/summarize` command or hitting context limit | `workbench.desktop.main.js:28903` |

**Tab vs. agent distinction:** `beforeTabFileRead` / `afterTabFileEdit` are entirely separate code paths from `beforeReadFile` / `afterFileEdit`. Registering a hook for `beforeReadFile` does **not** intercept Tab reads, and vice versa.

---

## Appendix B: Candidate Ghost Events

Two token sequences were found near the `bv` enum in `workbench.desktop.main.js:28903` during the offline binary strings sweep but do not appear in the canonical 20-event set. Neither was tested at the parser level.

| Ghost candidate | Source | Status |
|----------------|--------|--------|
| `beforeFullFileContent` | Observed in bundle within ~200 lines of `bv` enum | Plausible ghost: token present in binary, not in canonical set, not in parser test |
| `afterFullFileContent` | Observed in bundle within ~200 lines of `bv` enum | Plausible ghost: same as above |

**Methodology:** An offline `rg`/strings sweep extracted 50 unique event-name-like tokens from the 200-line window around the `bv` enum. 20 matched the canonical set; 2 were classified as plausible ghosts; 44 were noise (RPC field names, session metadata fragments, PascalCase substrings inside longer identifiers such as `executeAfterFileEditHook`).

**Prior art:** v1 docs/internal/hooks-empirical-report.v1.md confirmed that the Cursor parser returns `Unknown hook type` for: `beforeToolUse`, `onError`, `BeforeCompact`, `sessionResume`, `userPromptSubmit`. These are confirmed non-events in 3.1.15.

---

## Appendix C: Known Regressions / Quirks in Cursor 3.1.15

1. **`ask` decision not enforced on `beforeShellExecution`:** A hook returning `{"decision":"ask"}` for `beforeShellExecution` does not block the command; Cursor proceeds as if `allow` was returned. Registry cell W-AB-beforeShellExecution-ask-022 was designed to probe this. The `ask` decision is documented at cursor.com/docs/agent/hooks but its enforcement behavior differs by event type.

2. **Malformed JSON + failClosed=false = silent allow:** When a `beforeShellExecution` hook process exits 0 but emits syntactically invalid JSON, and `failClosed` is `false` (or omitted), Cursor silently allows the command with no user notification. This is a risk surface for security-critical deployments where the hook script crashes or produces bad output. Reference: community forum thread 152669.

3. **Prompt-type hooks do not invoke `command` shell script:** A hook definition with `type: "prompt"` does not execute the `command` field as a shell script. Cursor evaluates the `prompt` field internally via its LLM model, which means the shell script path is ignored. Cells W-F-beforeShellExecution-prompt-001/002 probed this behavior.

4. **Multiple `stop.followup_message` hooks merge into one auto-submit:** If multiple `stop` hooks all return `followup_message`, only a single auto-submitted message is produced (messages are merged, not sequentially submitted). This was observed when the W-EK wave had concurrent `stop` hook entries.

5. **`subagentStart` payload has `task` field empty even when task is provided:** The `task` field in `subagentStart` (and `subagentStop`) payloads is always an empty string in Cursor 3.1.15, regardless of what task was passed via the Cursor Task tool. This prevents hooks from making routing decisions based on the subagent task description. `subagent_type` is the only discriminating field available in the payload.

6. **`exit_code` absent from `afterShellExecution` payload:** The cursor.com/docs reference lists `exit_code` as an `afterShellExecution` field, but it was absent from all 37 observed `afterShellExecution` payloads in this build. Hooks on this event cannot directly inspect shell exit status.

7. **`subagent_model` absent from `subagentStart` payload:** Documented at cursor.com/docs but not present in the single observed `subagentStart` record. Cannot use hooks to gate based on the spawned subagent's model.

8. **`loop_limit: null` on `stop` hooks creates infinite loop:** A `stop` hook with `followup_message` and `loop_limit: null` (or `loop_limit` omitted) caused continuous auto-submission of the followup message, requiring manual intervention. Always set a finite `loop_limit` on `stop` hooks that return `followup_message`. Safety: `loop_limit: 1` for one-shot followups.

---

## Appendix D: Evidence Trail

| Artifact | Path | Description |
|----------|------|-------------|
| Evidence JSONL | `docs/internal/hooks-evidence-v2.jsonl` | 459 hook capture records, one per hook invocation, schema v2 |
| Ghost hunt JSON | `docs/internal/hooks-v2-ghost-hunt.json` | Offline binary strings sweep results near `bv` enum |
| Experiment registry | `hooks/hooks.experiment.v2.registry.json` | 116 cells: experiment_id, event, matcher, decision, expected_outcome |
| Header / version pin | `/tmp/cursor-hooks-evidence/_header.json` | cursor_version, binary_sha256, git_sha, plugin_version |
| Pre-flight record | `/tmp/cursor-hooks-evidence/_preflight.json` | Confirms deny enforcement and top-level orchestrator context |
| Plan file | `.cursor/plans/cursor_hooks_empirical_v2_a174e7ec.plan.md` | Full 6-wave experimental plan |
| Binary | `/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js` | sha256: `29aa9ec0549fa55452794c29f50f6d3ad3c1d5b24c51b068fd371a0a2aec44ef` |

**Experiment waves:**
- **Wave C:** Logger matrix — 5 matcher variants × 14 events = 70 logger cells (baseline fire confirmation)
- **Wave D:** `beforeShellExecution` response-contract deep-dive — allow/deny/malformed-json/exit-2 × failClosed variants and timeout variants
- **Wave AB:** Per-event decision probes — deny/allow/ask/user-message/agent-message/updated-input/additional-context
- **Wave H:** `postToolUse` canary injection — LLM response validation of injected context
- **Wave EK:** `stop` followup_message loop_limit variants
- **Wave F:** Prompt-type hook behavior on `beforeShellExecution`

---

## Cursor 3.1 → 3.6 changes

> **last-verified: 3.6.21** — Re-audited 2026-05-29.  
> **Scope:** New and changed hook-related features from Cursor 3.1 (Apr 13, 2026) through 3.6.21 (binary date 2026-05-28).  
> **Evidence tags:** `[binary-only]` = seen only in live binary/extension manifests, no official changelog entry; `[official-doc]` = cursor.com/changelog.  
> **Source:** Wave 3 T3.1 feature discovery (docs/internal/reaudit-3621/feature-discovery-3.1-3.6.md). <!-- last-verified: 3.6.21 -->

### H-01 · `workspaceOpen` — New 21st Hook Step Event

`[binary-only]` · version: unknown (binary-confirmed present at 3.6.21; no changelog entry as of 2026-05-29)

A new hook step event `workspaceOpen` was found in the `Iv` enum of the 3.6.21 binary. It is the 21st canonical hook event. The event name appears exactly twice in the bundle (enum definition + ordered array). It has no human-readable Claude-Code label wired yet and is classified as "defined-but-lightly-wired" — it is present in the canonical set but not yet surfaced with full documentation or a verified firing path via manual UI trigger.

All 20 previously documented events remain unchanged. `workspaceOpen` has been inserted as **row 21** in the numbered Event Taxonomy table above, bringing the canonical count to **21**; its empirical fire/status row stays at the 3.1.15 baseline (0 fires — binary-only) pending a 3.6.21 live-fire capture.

**Adoption relevance:** The `CANONICAL_CURSOR_HOOKS` test constant must include `workspaceOpen`. Affects the `create-hook` skill and any automation that iterates hook event names.

### H-02 · Hook Invocation / Path-Length and Git-Prompt Bug Fix

`[official-doc]` · version: 3.4 (May 13, 2026)

Fixed hook invocation failures caused by path-length issues and Git prompt-related regressions that could silently prevent hooks from running. Users on deep directory structures or repos with unusual git configurations (e.g. custom `GIT_PS1` or long `PS1` that overwrote the hook's working-directory context) may have experienced hooks not firing in 3.1–3.3.

**Adoption relevance:** Relevant edge-cases section. Hooks that appeared to be silently failing on deep repo paths or git-customised shells should be re-tested against 3.4+.

### H-03 · Multi-Root Workspace Hook Loading Fix

`[official-doc]` · version: 3.0 (Apr 2, 2026)

Fixed hook loading so that multi-root workspaces read project-level hook files (`.cursor/hooks.json`) from **all** workspace folders, not only the first one. Previously, only the first folder's hooks were picked up, silently dropping hooks defined in sibling workspace roots.

**Adoption relevance:** Oh-my-cursor users with monorepo setups or multi-root workspaces should verify that per-folder `.cursor/hooks.json` files are now correctly merged. This fix is present in the current 3.1.15 baseline used for this doc's empirical data.

### H-04 · `composer_session_goal_hook_prompt_config` — New Statsig Feature Flag

`[binary-only]` · version: unknown (present at 3.6.21; no changelog entry as of 2026-05-29)

A new Statsig dynamic config key `composer_session_goal_hook_prompt_config` was found in the 3.6.21 bundle. It controls hook-prompt behavior during Composer sessions — likely governs whether and how a session-goal prompt is injected before hook dispatch. The flag has not been activated via a public rollout as of the binary inspection date.

**Adoption relevance:** May affect hook firing order or context injection when the flag is enabled via Statsig rollout. Monitor Cursor changelog for activation announcement. No action required until the flag is confirmed live.
