> [!IMPORTANT]
> **SUPERSEDED — v1 historical record (Apr 17, 2026 — 01:57Z).**
> For the current canonical picture see:
> - `docs/internal/hooks-v1-vs-v2-claim-diff.md` — v2 claim-by-claim audit
> - `docs/internal/hooks-evidence-v2.jsonl` — 459 v2 hook records
> - `docs/cursor/03-hooks.md` — operator-facing reference
>
> Many "hook" names listed below are intentionally FAKE (parser-rejected) — this document is the negative-testing record. Use it for reproducing rejection behavior, not as a list of available hooks.

# Cursor Hooks Empirical Report

Generated: 2026-04-17T01:57:07Z

## Methodology

- Test workspace: `<repo>`.
- Cursor version observed in hook payloads: `3.1.15`.
- Hook package manifest in repo + installed plugin: `hooks/package.json` (name `oh-my-cursor-hooks`, dependencies `@modelcontextprotocol/sdk ^1.29.0`, `zod ^4.3.6`; no explicit package version field).
- Install/reload approach:
  - Ran `bash <repo>/install.sh` in early cycles.
  - Also directly copied experimental config into installed hook path for deterministic control.
- Backup/restore:
  - Repo backup: `/tmp/hooks.json.original-repo-20260417T000818470Z`
  - Installed backup: `/tmp/hooks.json.original-installed-20260417T000818470Z`
  - Restored and verified with `cmp -s` (command returned `RESTORE_OK`).
- Experimental files created:
  - `<repo>/hooks/scripts/experiment-logger.sh`
  - `<repo>/hooks/hooks.experiment.json`
  - `<repo>/hooks/hooks.experiment.valid.json`
  - `/tmp/cursor-hook-experiment-failclosed.sh`
- Main evidence logs:
  - Experiment logger JSONL: `/tmp/cursor-hook-experiment.log`
  - failClosed probe log: `/tmp/cursor-hook-failclosed.log`
  - Cursor internal hook log: `<home>/.config/Cursor/logs/20260416T184151/window2/output_20260416T184155/cursor.hooks.workspaceId-<workspace-id>.log`
- Install/test cycles executed:
  1. **Cycle A (wide-net speculative config)**: included documented + speculative names; config rejected due unknown hook types.
  2. **Cycle B (location fallback tests)**: same invalid config tested in additional hook config locations; still rejected.
  3. **Cycle C (valid-only config)**: reduced to parser-accepted hook types; hooks fired and payloads captured.
  4. **Cycle D (targeted semantics probes)**: matcher, failClosed, deny, loop_limit, alias disambiguation actions.
- Trigger actions used (organic + targeted): file reads/writes, shell commands, subagent invocation, MCP calls, prompt submissions.

## Hook Inventory Table

Columns: event name, documentation status (repo docs/README/ARCHITECTURE/hooks/hooks.json/hooks/schemas), whether fired, invocation count, captured top-level payload schema, matcher behavior, and notes.

| Event name | Documented in repo? | Fired during test? | Invocations | Payload schema (top-level keys:type) | Matcher behavior | Notes / quirks / failClosed |
|---|---:|---:|---:|---|---|---|
| `sessionStart` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `sessionEnd` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `preToolUse` | yes | yes | 81 | conversation_id:str, generation_id:str, model:str, tool_name:str, tool_input:dict, tool_use_id:str, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType, cwd:str | Regex matcher works; case-sensitive (`Shell` matched, `shell` did not). | Observed consistently in targeted tool-trigger tests. |
| `postToolUse` | yes | yes | 66 | conversation_id:str, generation_id:str, model:str, tool_name:str, tool_input:dict, tool_output:str, duration:float, tool_use_id:str, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType, cwd:str | No explicit matcher probe for this event. | Observed in logger during valid-only phase. |
| `postToolUseFailure` | yes | yes | 9 | conversation_id:str, generation_id:str, model:str, tool_name:str, tool_input:dict, error_message:str, failure_type:str, duration:int, tool_use_id:str, is_interrupt:bool, cwd:str, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | No explicit matcher probe for this event. | Observed in logger during valid-only phase. |
| `subagentStart` | yes | yes | 3 | conversation_id:str, generation_id:str, model:str, subagent_id:str, subagent_type:str, task:str, parent_conversation_id:str, tool_call_id:str, is_parallel_worker:bool, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | No explicit matcher probe for this event. | Observed in logger during valid-only phase. |
| `subagentStop` | yes | yes | 3 | conversation_id:str, generation_id:str, model:str, subagent_id:str, subagent_type:str, status:str, duration_ms:int, parent_conversation_id:str, message_count:int, tool_call_count:int, loop_count:int, task:str, description:str, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType, agent_transcript_path:NoneType | loop_limit variants (`1`, `null`) behaved same as base in this run. | Observed in logger during valid-only phase. |
| `beforeShellExecution` | yes | yes | 42 | conversation_id:str, generation_id:str, model:str, command:str, cwd:str, sandbox:bool, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | Regex matcher works on command string; case-sensitive (`echo` matched, `ECHO` did not). | Observed consistently in targeted tool-trigger tests. |
| `afterShellExecution` | yes | yes | 30 | conversation_id:str, generation_id:str, model:str, command:str, output:str, duration:float, sandbox:bool, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | No explicit matcher probe for this event. | Observed in logger during valid-only phase. |
| `beforeMCPExecution` | yes | yes | 6 | conversation_id:str, generation_id:str, model:str, tool_name:str, tool_input:str, command:str, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | Matcher probe configured; `websearch` matcher did not fire for `web_search_exa` payloads. | Observed in logger during valid-only phase. |
| `afterMCPExecution` | yes | yes | 6 | conversation_id:str, generation_id:str, model:str, tool_name:str, tool_input:str, result_json:str, duration:float, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | No explicit matcher probe for this event. | Observed in logger during valid-only phase. |
| `beforeReadFile` | yes | yes | 18 | conversation_id:str, generation_id:str, model:str, content:str, file_path:str, attachments:list, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | No explicit matcher probe for this event. | Observed in logger during valid-only phase. |
| `afterFileEdit` | yes | yes | 3 | conversation_id:str, generation_id:str, model:str, file_path:str, edits:list, session_id:str, hook_event_name:str, cursor_version:str, workspace_roots:list, user_email:str, transcript_path:NoneType | No explicit matcher probe for this event. | Observed on `ApplyPatch` edit in `hooks.experiment.valid.json`. |
| `afterAgentResponse` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `afterAgentThought` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `beforeAgentThought` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `preCompact` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `stop` | yes | no | 0 | n/a | Accepted by parser but not observed in valid-only logger phase. | Accepted by parser but not observed during exercised actions. |
| `beforeSubmitPrompt` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `beforeTabFileRead` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `afterTabFileEdit` | yes | no | 0 | n/a | No explicit matcher probe for this event. | Accepted by parser but not observed during exercised actions. |
| `beforeToolUse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `afterToolUse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `onError` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `toolError` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `postToolUseError` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeAgentResponse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `agentResponse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `agentThought` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeCompact` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `afterCompact` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `postCompact` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `sessionResume` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `sessionPause` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `userPromptSubmit` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `afterSubmitPrompt` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeUserPrompt` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `taskStart` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `taskEnd` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `taskComplete` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `modeChange` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeModeSwitch` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `afterModeSwitch` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `mcpAuth` | yes | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeMcpAuth` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `fileChange` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeWrite` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `afterWrite` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeEdit` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `afterEdit` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `notification` | yes | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `permissionRequest` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `permissionGrant` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `compactStart` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `compactEnd` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeToolUse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `AfterToolUse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `OnError` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `ToolError` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `PostToolUseError` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeAgentResponse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `AgentResponse` | yes | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeCompact` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `AfterCompact` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `PostCompact` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `SessionResume` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `SessionPause` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `UserPromptSubmit` | yes | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `AfterSubmitPrompt` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeUserPrompt` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `TaskStart` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `TaskEnd` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `TaskComplete` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `ModeChange` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeModeSwitch` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `AfterModeSwitch` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `McpAuth` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeMcpAuth` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `FileChange` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeWrite` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `AfterWrite` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `BeforeEdit` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `AfterEdit` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `Notification` | yes | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `PermissionRequest` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `PermissionGrant` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `CompactStart` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `CompactEnd` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `pretooluse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `posttooluse` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `subAgentStart` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `subAgentStop` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `beforeMcpExecution` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |
| `afterMcpExecution` | no | no | 0 | n/a | n/a (event rejected at config-parse stage) | Cursor logged `Unknown hook type` and skipped this event. |

## Undocumented Hooks Found

No additional runtime hook event names were observed beyond Cursor's parser-accepted set of 20 hook types.

- Parser evidence: Cursor rejected speculative names with `Unknown hook type` errors.
- Accepted set (from error output): `beforeShellExecution`, `beforeMCPExecution`, `afterShellExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeTabFileRead`, `afterTabFileEdit`, `stop`, `beforeSubmitPrompt`, `afterAgentResponse`, `afterAgentThought`, `sessionStart`, `sessionEnd`, `preCompact`, `subagentStart`, `subagentStop`, `preToolUse`, `postToolUse`, `postToolUseFailure`.

Raw evidence excerpt:

```text
[2026-04-17T01:06:22.843Z] ERROR: Invalid user config: Unknown hook type: beforeAgentThought ... Unknown hook type: beforeToolUse ... Unknown hook type: afterToolUse ...
```

## Dual / Aliased Hook Names

| Pair | Empirical result | Evidence |
|---|---|---|
| `preToolUse` vs `beforeToolUse` | `preToolUse` fired; `beforeToolUse` is invalid/unknown hook type. | `Unknown hook type: beforeToolUse` in Cursor hooks log; logger count `preToolUse=81`. |
| `postToolUse` vs `afterToolUse` | `postToolUse` fired; `afterToolUse` invalid/unknown. | Same parser error family + logger count `postToolUse=66`. |
| `beforeReadFile` vs `preToolUse` (Read) | Both fire; order is `preToolUse -> beforeReadFile -> postToolUse`. | Step sequence around `2026-04-16T23:44:07` and `23:44:15` in step TSV. |
| `afterFileEdit` vs `postToolUse` (Write/Edit) | Both fire; order observed `preToolUse -> afterFileEdit -> postToolUse`. | Step sequence around `2026-04-16T23:42:57` and `23:44:15-23:44:16`; logger has `afterFileEdit=3`. |
| `stop` vs `subagentStop` | `subagentStop` fired in valid logger cycle; `stop` accepted but not observed in same cycle. | Logger counts `subagentStop=3`, `stop=0`. |
| `afterAgentResponse` vs `afterAgentThought` vs `stop` | `afterAgentThought` and `stop` were requested in internal Cursor log before valid-only narrowing; none logged by valid-only experiment logger for this workspace filter. | Internal hook log summary requested counts (`afterAgentThought=84`, `stop=3`), but filtered logger counts remain `0` for these three. |

## Speculative Hooks Tested

- Total speculative variants tested (camelCase, PascalCase, lower-case aliases): **74**
- Accepted by parser: **20** (the canonical 20 listed above)
- Rejected by parser as unknown: **74**

Rejected examples (full list captured in `/tmp/cursor-hooks-log-summary-compact.json`):
`beforeToolUse`, `afterToolUse`, `onError`, `toolError`, `postToolUseError`, `beforeAgentResponse`, `agentResponse`, `beforeCompact`, `afterCompact`, `postCompact`, `sessionResume`, `sessionPause`, `userPromptSubmit`, `afterSubmitPrompt`, `beforeUserPrompt`, `taskStart`, `taskEnd`, `taskComplete`, `modeChange`, `beforeModeSwitch`, `afterModeSwitch`, `mcpAuth`, `beforeMcpAuth`, `fileChange`, `beforeWrite`, `afterWrite`, `beforeEdit`, `afterEdit`, `notification`, `permissionRequest`, `permissionGrant`, `compactStart`, `compactEnd`, plus PascalCase/lowercase aliases.

## Matcher / failClosed / loop_limit / prompt semantics

### `matcher`
- Behavior is regex-style and case-sensitive.
- `preToolUse` probes:
  - `matcher: "Shell"` fired for Shell tool use.
  - `matcher: "shell"` did not fire.
  - `matcher: "^Shell$"` fired.
- `beforeShellExecution` probes:
  - `matcher: "echo"` fired when command contained `echo`.
  - `matcher: "ECHO"` did not fire.
  - `matcher: "^echo\s+HOOK_MATCH_TEST$"` fired only for exact command.

### `failClosed` and deny
- `failClosed: false` + non-zero exit (`failOpenNonZero`) allowed tool execution to continue.
- `failClosed: true` + non-zero exit (`failClosedNonZero`) blocked tool execution.
- Explicit deny JSON (`{"permission":"deny",...}`) with `failClosed: true` blocked execution.
- Evidence captured in `/tmp/cursor-hook-failclosed.log` and in `postToolUseFailure.error_message` payload in `/tmp/cursor-hook-experiment.log`.

### `loop_limit`
- `subagentStop` hooks with `loop_limit: 1` and `loop_limit: null` both executed alongside base hook in this run; no behavioral difference observed in this dataset.

### `type: "prompt"`
- Prompt-hook probe was configured under `beforeMCPExecution` with a matcher intentionally set to not match.
- No prompt-hook invocation observed in logger for this probe, so no empirical conclusion about approve/reject output semantics beyond parser acceptance.

## Payload Samples (Redacted)

These are redacted real stdin payload samples captured by `/hooks/scripts/experiment-logger.sh`.

#### `afterFileEdit`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "file_path": "<repo>/hooks/hooks.experiment.valid.json",
  "edits": [
    {
      "old_string": "        \"prompt\": \"EXPERIMENTAL prompt hook probe. Always respond with APPROVE.\",",
      "new_string": "        \"prompt\": \"EXPERIMENTAL prompt hook probe. Always respond with APPROVE always.\","
    }
  ],
  "session_id": "<redacted>",
  "hook_event_name": "afterFileEdit",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `afterMCPExecution`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "tool_name": "web_search_exa",
  "tool_input": "{}",
  "result_json": "{\"content\":[{\"type\":\"text\",\"text\":\"MCP error -32602: Input validation error: Invalid arguments for tool web_search_exa: [\\n  {\\n    \\\"code\\\": \\\"invalid_type\\\",\\n    \\\"expected\\\": \\\"string\\\",\\n    \\\"received\\\": \\\"undefined\\\",\\n    \\\"path\\\": [\\n      \\\"query\\\"\\n    ],\\n    \\\"message\\\": \\\"Required\\\"\\n  }\\n]\"}],\"isError\":true}",
  "duration": 470.617,
  "session_id": "<redacted>",
  "hook_event_name": "afterMCPExecution",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `afterShellExecution`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "command": "echo HOOK_MATCH_TEST",
  "output": "HOOK_MATCH_TEST\n",
  "duration": 52.929,
  "sandbox": true,
  "session_id": "<redacted>",
  "hook_event_name": "afterShellExecution",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `beforeMCPExecution`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "tool_name": "web_search_exa",
  "tool_input": "{\"query\":\"Cursor hook beforeMCPExecution payload example\",\"numResults\":1}",
  "command": "websearch",
  "session_id": "<redacted>",
  "hook_event_name": "beforeMCPExecution",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `beforeReadFile`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "content": "{\"role\":\"user\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"<user_query>\\nTASK: Search for \\\"sessionStart\\\" in <repo>/hooks and return first 3 matches.\\nE...<truncated>",
  "file_path": "<home>/.cursor/projects/mnt-development-oh-my-openagent/agent-transcripts/<session-id>/subagents/<subagent-id>.jsonl",
  "attachments": [],
  "session_id": "<redacted>",
  "hook_event_name": "beforeReadFile",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `beforeShellExecution`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "command": "echo HOOK_MATCH_TEST && echo CURSOR_HOOK_FAILOPEN_TEST && echo CURSOR_HOOK_FAILCLOSED_TEST && echo CURSOR_HOOK_DENY_TEST",
  "cwd": "",
  "sandbox": true,
  "session_id": "<redacted>",
  "hook_event_name": "beforeShellExecution",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `postToolUse`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "tool_name": "Grep",
  "tool_input": {
    "pattern": "beforeSubmitPrompt",
    "file_path": "<repo>/docs",
    "output_mode": "count"
  },
  "tool_output": "{\"pattern\":\"beforeSubmitPrompt\",\"success\":true}",
  "duration": 23.659,
  "tool_use_id": "<redacted>",
  "session_id": "<redacted>",
  "hook_event_name": "postToolUse",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `postToolUseFailure`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "tool_name": "Shell",
  "tool_input": {
    "command": "echo HOOK_MATCH_TEST && echo CURSOR_HOOK_FAILOPEN_TEST && echo CURSOR_HOOK_FAILCLOSED_TEST && echo CURSOR_HOOK_DENY_TEST",
    "cwd": "",
    "timeout": 30000
  },
  "error_message": "Command execution was blocked by a hook: Tool blocked because this hook is configured to fail closed (block when it fails). Hook \"/tmp/cursor-hook-experiment-failclosed.sh failClos...<truncated>",
  "failure_type": "permission_denied",
  "duration": 0,
  "tool_use_id": "<redacted>",
  "is_interrupt": false,
  "cwd": "",
  "session_id": "<redacted>",
  "hook_event_name": "postToolUseFailure",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `preToolUse`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "tool_name": "Grep",
  "tool_input": {
    "pattern": "beforeSubmitPrompt",
    "file_path": "<repo>/docs",
    "output_mode": "count"
  },
  "tool_use_id": "<redacted>",
  "session_id": "<redacted>",
  "hook_event_name": "preToolUse",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `subagentStart`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "subagent_id": "<redacted>",
  "subagent_type": "general-purpose",
  "task": "",
  "parent_conversation_id": "<redacted>",
  "tool_call_id": "<redacted>",
  "is_parallel_worker": false,
  "session_id": "<redacted>",
  "hook_event_name": "subagentStart",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null
}
```

#### `subagentStop`

```json
{
  "conversation_id": "<redacted>",
  "generation_id": "<redacted>",
  "model": "gpt-5.5-extra-high",
  "subagent_id": "<redacted>",
  "subagent_type": "general-purpose",
  "status": "completed",
  "duration_ms": 1566,
  "parent_conversation_id": "<redacted>",
  "message_count": 0,
  "tool_call_count": 0,
  "loop_count": 0,
  "task": "",
  "description": "",
  "session_id": "<redacted>",
  "hook_event_name": "subagentStop",
  "cursor_version": "3.1.15",
  "workspace_roots": [
    "<repo>"
  ],
  "user_email": "<redacted>",
  "transcript_path": null,
  "agent_transcript_path": null
}
```

## Reproducible commands used for evidence

- Parser validity and unknown types:
  - `rg "Unknown hook type" "<home>/.config/Cursor/logs/20260416T184151/window2/output_20260416T184155/cursor.hooks.workspaceId-<workspace-id>.log"`
- Logger event counts:
  - `python3 - <<'PY' ... /tmp/cursor-hook-experiment.log ... PY`
- Step ordering:
  - generated `/tmp/cursor-hooks-step-sequence.tsv` from internal hook logs and inspected timestamp order.
- Restore verification:
  - `cmp -s /tmp/hooks.json.original-repo-20260417T000818470Z <repo>/hooks/hooks.json`
  - `cmp -s /tmp/hooks.json.original-installed-20260417T000818470Z <home>/.cursor/plugins/local/oh-my-cursor/hooks/hooks.json`

## Recommendations for production `hooks/hooks.json`

1. Keep only parser-accepted hook names (the 20 canonical types); do not add speculative aliases.
2. Treat hook config validation as fail-fast: one unknown hook type can invalidate the full config load for that scope.
3. Keep `preToolUse`, `postToolUse`, `postToolUseFailure`, `beforeShellExecution`, `afterShellExecution`, `beforeReadFile`, `afterFileEdit`, `beforeMCPExecution`, `afterMCPExecution`, `subagentStart`, `subagentStop` as primary high-signal events.
4. Add dedicated tests for Tab events (`beforeTabFileRead`, `afterTabFileEdit`) if those workflows are important; they were accepted but not observed here.
5. If `stop`, `afterAgentResponse`, `afterAgentThought`, `beforeSubmitPrompt`, `sessionStart`, `sessionEnd`, `preCompact` are desired in production analytics, add explicit trigger tests in CI or scripted manual validation because they did not appear in the valid-only logger window for this workspace filter.
6. Keep experimental scaffolding separate and clearly named (as done) for future reruns.

## Cycle 2 — Field Catalog (Comprehensive)

Cycle 2 catalogs every field accepted by Cursor's hooks system across six surfaces for the IDE-agent (S1) and provides a pointer table for the `cursor-agent` CLI (S2). Evidence sources: `docs` = cursor.com/docs/agent/hooks retrieved 2026-04-17; `source` = `/usr/share/cursor/resources/app/...` file:line; `log` = `~/.config/Cursor/logs/20260416T184151/window*/...cursor.hooks.workspaceId-*.log`; `experiment` = cycle-1 or cycle-2 fired evidence (logger JSONL or parser-accept).

### mcpAuth reconciliation

Cycle 1 row 82 said `mcpAuth` was "Documented: yes" AND "rejected at config-parse stage / Unknown hook type". Cycle 2 resolved: the token `mcpAuth` appears in cycle 1's documentation text (historical), but is NOT in the bundle's `Sxd=[...]` accepted-event array (`workbench.desktop.main.js:41458`). Therefore Cursor's parser correctly rejects it today. The cycle 1 "Documented: yes" value was a documentation artifact, not a parser signal. Treat `mcpAuth` as NOT a valid hook event.

### Surface S1 — IDE-agent hooks (camelCase, 20 events)

#### S1.1 Global `hooks.json` config schema

| field | type | purpose | default | required | source |
|---|---|---|---|---|---|
| `version` | integer ≥ 1 | Config schema version | — | yes | `source:workbench.desktop.main.js:41458` (eTb/H validator) |
| `hooks` | object (event → entry[]) | Map of event name to entry array | — | yes | same |
| `stop_hook_loop_limit` | any | DEPRECATED — warns and is ignored | — | no | `source:cursor-agent-exec/dist/main.js:5` |
| `command` (entry) | string | Script/command path to execute | — | yes when `type="command"` or omitted | `source:workbench:41458` (JjS) |
| `type` (entry) | `"command"\|"prompt"` | Execution type | `"command"` | no | `source:workbench:41458` (HjS) |
| `prompt` (entry) | non-empty string | Prompt text for LLM-evaluated hook | — | yes when `type="prompt"` | `source:workbench:41458` (WjS) |
| `model` (entry) | non-empty string | Model override for prompt-type | — | no | same |
| `matcher` (entry) | string (regex; `""` and `"*"` special) | Filter when hook fires | — | no | `source:workbench:41458` (qjS) |
| `timeout` (entry) | number (seconds) >0, ≤3600 (warn >3600) | Per-script timeout | platform default | no | same |
| `loop_limit` (entry) | `null` or positive integer | Loop cap for stop/subagentStop follow-ups | 5 (Cursor), `null` (Claude) | no | same; `docs` |
| `failClosed` (entry) | boolean | Block on hook failure/timeout/invalid JSON | `false` | no | `source:cursor-agent-exec:5` (validator); runtime `workbench:41459` (`t.failClosed===!0`) |

Authoritative discovery order (Linux): `/etc/cursor/hooks.json` (enterprise) → `~/.cursor/hooks.json` (user) → `<workspace>/.cursor/hooks.json` (project). Source: `source:workbench:41458` (`resolveEnterpriseConfigDirectoryAndPath` / `refreshWorkspaceConfigUris`).

`type: "prompt"` response contract (runtime): `{"ok": boolean, "reason"?: string}`. Default block message: `"Prompt hook blocked this action"`. Source: `source:workbench:~40559980` (`x.ok ?? x.reason ?? ...`).

#### S1.2 Per-event input payload fields

**Common envelope (all events):** `conversation_id` (str), `generation_id` (str), `model` (str), `hook_event_name` (str), `cursor_version` (str), `workspace_roots` (str[]), `user_email` (str|null), `transcript_path` (str|null), `session_id` (str). Source: `source:workbench:41458` + `cursor-agent-exec:5`. Confirmed in cycle-1 rows 41–51 (all 11 fired events carried this envelope).

Per-event specific fields (envelope omitted; "cycle-1" source refers to rows 41–51 of this report):

**sessionStart** — `is_background_agent` (bool), `composer_mode` (`"agent"|"ask"|"edit"`). Source: `docs`; `source:workbench:41231`.
**sessionEnd** — `reason` (`"completed"|"aborted"|"error"|"window_close"|"user_close"`), `duration_ms` (int), `is_background_agent` (bool), `final_status` (str), optional `error_message`. Source: `docs`; `source:workbench:41231`; `log:window1/…02d13d…log:167689–167706`.
**preToolUse** — `tool_name` (str), `tool_input` (object), `tool_use_id` (str), `cwd` (str), optional `agent_message` (str, from docs input block). Source: `docs`; `source:cursor-agent-exec:5`; `experiment`:cycle-1.
**postToolUse** — above + `tool_output` (str), `duration` (float). Source: `docs`; `source:cursor-agent-exec:5`; `experiment`:cycle-1.
**postToolUseFailure** — `tool_name`, `tool_input`, `tool_use_id`, `cwd`, `error_message` (str), `failure_type` (`"timeout"|"error"|"permission_denied"`), `duration` (int), `is_interrupt` (bool). Source: `docs`; `source:cursor-agent-exec:5`; `experiment`:cycle-1 row 43.
**subagentStart** — `subagent_id` (str), `subagent_type` (str), `task` (str), `parent_conversation_id` (str), `tool_call_id` (str), `subagent_model` (str), `is_parallel_worker` (bool), optional `git_branch` (str). Source: `docs`; `source:workbench:29035` + `cursor-agent-exec:5`; `experiment`:cycle-1 (subset).
**subagentStop** — `subagent_type`, `status` (`"completed"|"error"|"aborted"`), `task`, `description`, `summary`, `duration_ms`, `message_count`, `tool_call_count`, `loop_count`, optional `modified_files`, optional `error_message`, `agent_transcript_path`, optional `git_branch`. Source: `docs`; `source:workbench:29035`+`cursor-agent-exec:5`; `experiment`:cycle-1.
**beforeShellExecution** — `command` (str), `cwd` (str), `sandbox` (bool). Source: `docs`; `source:cursor-agent-exec:5`; `experiment`:cycle-1.
**afterShellExecution** — `command`, `output` (str), `duration` (float), `sandbox` (bool). Source same as above.
**beforeMCPExecution** — `tool_name`, `tool_input` (JSON string), plus `command` OR `url` (MCP client variant). Source: `docs`; `source:cursor-agent-exec:5`.
**afterMCPExecution** — `tool_name`, `tool_input` (JSON string), `result_json` (str), `duration` (float). Source same as above.
**beforeReadFile** — `content` (str), `file_path` (str), `attachments` (array of `{type: "file"|"rule", file_path: str}`). Source: `docs`; `source:workbench:~41231`; `experiment`:cycle-1 row 50.
**afterFileEdit** — `file_path`, `edits` (array of `{old_string, new_string}`). Source: `docs`; `source:workbench:~40239188`; `experiment`:cycle-1 row 51. Note: CLI Jan 8 2026 fixed `old_string` to reflect prior file content.
**beforeTabFileRead** — `file_path`, `content`. (No `attachments`). Source: `docs`; `source:workbench:45677`.
**afterTabFileEdit** — `file_path`, `edits` (with extended `range`, `old_line`, `new_line` beyond the Agent variant). Source: `docs`; `source:workbench:45677`.
**afterAgentResponse** — `text` (str), optional `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` (Composer path). Source: `docs`; `source:workbench:29014`,`41428`; `log:window1/…02d13d…log:118411+`.
**afterAgentThought** — `text` (str), `duration_ms` (int). Source: `docs`; `source:workbench:29038`; `log:window1/…02d13d…log:87+`.
**preCompact** — `trigger` (`"manual"|"auto"`), `context_usage_percent` (float), `context_tokens` (int), `context_window_size` (int), `message_count` (int), `messages_to_compact` (int), `is_first_compaction` (bool). Source: `docs`; `source:cursor-agent-exec:5`.
**stop** — `status` (`"completed"|"aborted"|"error"`), `loop_count` (int), plus token counters when Composer path (`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`). Source: `docs`; `source:workbench:29013`,`41428`; `log:window1/…02d13d…log:118490+`.
**beforeSubmitPrompt** — `prompt` (str), `attachments` (array of `{type, file_path}`), `composer_mode`. Source: `docs`; `source:workbench:29014`,`41425`; `log:window1/…02d13d…log:33+`.

#### S1.3 Per-event response output fields

Validators live inlined in `source:workbench:28899` as `xe({"out-build/vs/base/common/hooks/validators/<name>.js"(){...}})`. Merge / normalize at `source:workbench:28903`.

Events with an object-only validator (observe-only, no typed response fields): `afterShellExecution`, `afterMCPExecution`, `afterAgentResponse`, `afterAgentThought`, `afterFileEdit`, `afterTabFileEdit`, `postToolUseFailure`, `sessionEnd`.

| event | field | type / enum | purpose | live-fire result | source |
|---|---|---|---|---|---|
| preToolUse | `permission` | `"allow"\|"deny"\|"ask"` | Allow / block / prompt-user; `"ask"` accepted by schema but not enforced today (agent proceeds as if allowed) | takes-effect for `allow`/`deny` (`experiment`:cycle-1 deny-probe); `ask` silently-ignored per `docs` | `docs`; `source:workbench:28899` (`preToolUseResponse`) |
| preToolUse | `user_message` | string | Message shown in client on deny | takes-effect (`experiment`:cycle-1) | same |
| preToolUse | `agent_message` | string | Message sent to agent on deny | untested-reason: sub-agent tool-calls don't fire into plugin pipeline (D3 limitation) | same |
| preToolUse | `updated_input` | object (not array/null) | Replace tool input before execution | untested-reason: D3 limitation | same |
| postToolUse | `additional_context` | string | Extra context injected into conversation | takes-effect per `log:window1/…02d13d…log:1023–1030` (`hookSpecificOutput.additionalContext` recorded post-`postToolUse`); however a forum bug report (2026) notes context may not reach model (see Methodology) | `docs`; `source:workbench:28899` (`postToolUseResponse`); `log`; `docs:forum` |
| postToolUse | `updated_mcp_tool_output` | object | Replace MCP tool output seen by model (MCP only) | untested in live run; consumed only in `cursor-agent-exec`, not in workbench `postToolUseResponse` validator (workbench path silently-ignores) | `source:cursor-agent-exec:5`; `docs` |
| beforeShellExecution / beforeMCPExecution | `permission` | `"allow"\|"deny"\|"ask"` | Block / prompt user | takes-effect for `deny` (`experiment`:cycle-1) | `docs`; `source:workbench:28899` (`beforeCommandExecutionHookResponse`) |
| beforeShellExecution / beforeMCPExecution | `user_message`, `agent_message` | string | Messages on deny | partially takes-effect (cycle-1 captured `user_message` via `postToolUseFailure.error_message`) | same |
| afterShellExecution | — | object only | Observe-only | — | `source:workbench:28899` (`afterShellExecutionResponse` = `baseHookResponse`) |
| afterMCPExecution | — | object only | Observe-only | — | same pattern |
| beforeReadFile | `permission` | `"allow"\|"deny"` (no `"ask"`) | Block file read | untested-reason: D3 limitation | `docs`; `source:workbench:28899` (`beforeReadFileResponse`) |
| beforeReadFile | `user_message` | string | Message on deny | untested-reason: D3 limitation | same |
| beforeTabFileRead | `permission` | `"allow"\|"deny"` | Block Tab read | untested-reason | `source:workbench:28899` (`beforeTabFileReadResponse`) |
| afterFileEdit / afterTabFileEdit | — | object only | Observe-only | — | object-only validators |
| subagentStart | `permission` | `"allow"\|"deny"\|"ask"` | Block subagent; `"ask"` treated as `"deny"` (per docs) | untested-reason | `docs`; `source:workbench:28899` (`subagentStartResponse`) |
| subagentStart | `user_message` | string | Message on deny | untested-reason | same |
| subagentStop | `followup_message` | string | Auto-continue agent with this message; subject to `loop_limit` | untested-reason: no `stop`/`subagentStop` fires with oh-my-openagent workspace in snapshot | `docs`; `source:workbench:28899` (`subagentStopResponse`); normalize: `decision:"block"`+`reason` → `followup_message` |
| stop | `followup_message` | string | Auto-continue agent | untested-reason | `docs`; `source:workbench:28899` (`stopResponse`); normalize as above |
| sessionStart | `env` | object<string,string> | Env vars injected into agent process | untested-reason | `docs`; `source:workbench:28899` (`sessionStartResponse`) |
| sessionStart | `additional_context` | string | Context injected at session start | untested-reason | same |
| sessionStart | `continue` | boolean | Schema-accepted; NOT enforced by callers (session not blocked) | `docs` notes "accepted but not enforced" | `docs` |
| sessionStart | `user_message` | string | Same acceptance as `continue` | `docs` notes "accepted but not enforced" | `docs` |
| sessionEnd | — | object only | Observe-only | — | `source:workbench:28899` (`sessionEndResponse`) |
| beforeSubmitPrompt | `continue` | boolean | `false` blocks submission | untested-reason | `docs`; `source:workbench:28899` (`beforePromptSubmitResponse`) |
| beforeSubmitPrompt | `user_message` | string | Message on block | untested-reason | same |
| preCompact | `user_message` | string | Notification when compaction occurs | untested-reason (never fired in any observed session); cannot block compaction | `docs`; `source:workbench:28899` (`preCompactResponse`) |
| postToolUseFailure | — | object only | Observe-only | — | `source:workbench:28899` (`postToolUseFailureResponse`) |

Claude-compat normalize (gated by Statsig gate `enable_cc_nested_hook_output_normalization`, `source:workbench:~38289`): when canonical fields absent, `hookSpecificOutput.permissionDecision`/`permissionDecisionReason`/`updatedInput` map to `permission`/`user_message`/`updated_input`. For `stop`/`subagentStop`, `decision:"block"` + non-empty `reason` maps to `followup_message`.

`decision` as a first-class output field: NOT validated; only normalize path. Source: `source:workbench:28899` (`qGg`).

#### S1.4 Exit-code contract

| exit code | meaning | source |
|---|---|---|
| `0` | Use stdout JSON response (parsed against per-event validator) | `docs`; `source:workbench:41458` |
| `2` | Block the action (equivalent to `permission: "deny"`); stdout ignored | `docs`; `source:workbench:41458` (`U===ALi`, `ALi=2`); `docs:third-party-hooks` |
| other non-zero | Hook failed; action PROCEEDS (fail-open) unless `failClosed: true` on the entry | `docs`; `source:workbench:41458` (`U!==0&&U!==null` → error log) |
| invalid JSON on stdout | Hook failed; same fail-open rule | `source:workbench:41459` (`t.failClosed===!0` applies) |
| `failClosed: true` + any failure mode | Block the action via synthetic deny response | `source:workbench:41459` (`zGe` synthetic response); `experiment`:cycle-1 (failClosed probe proved block) |

#### S1.5 `CURSOR_*` environment variables

Observed in this agent-exec process (`experiment`:cycle-2 `env | rg ^CURSOR_`):

| var | value example | purpose (inferred) | source |
|---|---|---|---|
| `CURSOR_SANDBOX` | `native` | Sandbox mode | `experiment` |
| `CURSOR_SANDBOX_LANDLOCK_STATUS` | `fully_enforced` | Landlock LSM status | `experiment` |
| `CURSOR_EXTENSION_HOST_ROLE` | `agent-exec` | Role of this extension host process | `experiment` |
| `CURSOR_AGENT` | `1` | Indicates agent-exec context | `experiment` |
| `CURSOR_LAYOUT` | `unifiedAgent` | UI layout mode | `experiment` |
| `CURSOR_WORKSPACE_LABEL` | `oh-my-openagent` | Short workspace name | `experiment` |
| `CURSOR_RIPGREP_PATH` | `/usr/share/cursor/resources/app/node_modules/@vscode/ripgrep/bin/rg` | Bundled ripgrep path | `experiment` |
| `CURSOR_ORIG_UID` | `1000` | Original UID before sandbox | `experiment` |
| `CURSOR_ORIG_GID` | `1000` | Original GID before sandbox | `experiment` |

No `CURSOR_*` variable was found that toggles hook surface visibility. These are context metadata, not feature flags. The hook pipeline reads `configurationService` and Statsig gates (see S1.6 note) rather than env.

#### S1.6 Matcher grammar

| aspect | behavior | source |
|---|---|---|
| Type + compile + invalid regex | String only (`object` in docs is imprecise); `new RegExp(matcher)` unless `""`/`"*"` match-all; bad pattern errors at load (`qjS`). | `source:workbench:41458` |
| Case + anchor | Case-sensitive (no `i`); not auto-anchored — need `^...$` for exact (`experiment`:cycle-1: `Shell`≠`shell`, `echo`≠`ECHO`, `^echo\s+HOOK_MATCH_TEST$`). | `experiment`:cycle-1 |
| Per-event target | preToolUse→`tool_name`; shell hooks→`command`; beforeMCP→shell command text; subagent*→type; beforeReadFile→tool type (`Read`/`TabRead`); afterFileEdit→`Write`/`TabWrite`; beforeSubmitPrompt→`UserPromptSubmit`; afterAgent*→`AgentResponse`/`AgentThought`; stop→`Stop`. | `docs`:matcher-configuration |
| `afterMCPExecution` | Omitted from docs matcher list; applicability unclear. | `docs` (omission) |
| Cycle-1 quirk | `websearch` matcher missed `web_search_exa` on `beforeMCPExecution` — matcher keys off `command` (`"websearch"` in some setups, not here). | `experiment`:cycle-1 row 48 |

### Surface S2 — `cursor-agent` CLI (Claude-compat PascalCase) — pointer

Second, parallel hook surface used by the headless `cursor-agent` CLI. Uses PascalCase event names and nested `hookSpecificOutput` response shape (Claude Code compatibility). NOT the IDE-agent surface documented above. Cycle 1 proved PascalCase events are REJECTED on the IDE-agent surface (rows 94–119).

| PascalCase event | maps to S1 event | source file:line | status |
|---|---|---|---|
| `PreToolUse` | `preToolUse` | `source:claude-agent-sdk/cli.js:9` (`I.literal("PreToolUse")`); `source:cursor-agent/dist/main.js:8` (`hookSpecificOutput` sample) | CLI-only; IDE rejects PascalCase |
| Other PascalCase names (AfterCompact, AgentResponse, UserPromptSubmit, etc.) | n/a — not all map 1:1 | `source:claude-agent-sdk/cli.js:9` | CLI-only Claude-compat surface; not enumerated here |

S2 full catalog is out of scope for this report. See `/usr/share/cursor/resources/app/extensions/cursor-agent/dist/main.js:8` and `/usr/share/cursor/resources/app/extensions/cursor-agent/dist/claude-agent-sdk/cli.js:9` for Zod schemas.

### Ghost hooks (in source/docs but never fired in any observed session)

| name | first seen | hypothesis | live-fire result |
|---|---|---|---|
| `sessionStart` | `source:workbench:41231`; `docs` | New Composer session only; no fresh-session window for this repo. | 0 (91 MB logs + c1/c2) |
| `preCompact` | `source:cursor-agent-exec:5`; `docs` | Near context-limit auto-compact; session stayed below limit. | 0 |
| `beforeTabFileRead` / `afterTabFileEdit` | `source:workbench:45677`; `docs` | Tab inline-edit path, not Agent tools. | 0 (Agent runs) |
| `beforeMCPExecution` / `afterMCPExecution` | `source:cursor-agent-exec:5`; `docs` | Needs MCP client activity; c2 snapshot had none (c1 had websearch MCP). | 0 in c2 snapshot |

### Feature-flag / beta probe inventory (read-only)

| key / gate | location | inferred purpose | why not probed |
|---|---|---|---|
| `enable_cc_nested_hook_output_normalization` | `source:workbench:~38289` (`checkFeatureGate`) | Claude-compat `hookSpecificOutput` normalization | settings / flag override |
| `cursor.agent_layout_browser_beta_setting` | `~/.config/Cursor/User/settings.json` | Agent layout / browser beta (not hooks-specific) | settings mutation |
| `cursor.rpcFileLogger.enabled` | same | RPC file logging | settings mutation |
| `cursor.hooks.initializeUserHooks` | `source:workbench:~41468` (command id) | Scaffold `~/.cursor/hooks/` + `hooks.json` | writes user files |
| Any `cursor.hooks.*` settings key | — | none found | no evidence of reader |
| `CURSOR_*` env override | process env | sandbox/layout | restart |

No env var or settings key was found that explicitly toggles hook-surface visibility beyond the Statsig gate for Claude-compat normalization.

### Methodology addendum (cycle 2)

- **Wave 2:** five parallel agents (B1–B4 + C) + read-only flag probe (E); 91 MB hook logs (~409K lines); no mutations.
- **Grep:** `hook_event_name`, `hookEventName`, `Sxd=`, `hooks/validators`, `Unknown hook type`, `failClosed`, `loop_limit`, `permission`, `updated_input`, `additional_context`, `followup_message`, `I.literal("`, `checkFeatureGate`, etc.
- **Bundle:** `/usr/share/cursor/resources/app/` (~411 MB); no `app.asar` (`node_modules.asar` stub).
- **Wave 4 installs:** D1 `/tmp/cursor-hook-experiment-responder.sh`; D2 all-20 logger; D3 P1–P12 response probes; D4 `type:"prompt"` triple; D5 shell prompt — all parser-accepted.
- **D3/D4/D5 limit:** Sub-agent Shell/Read/Task use a different `agent-exec` hook path than the plugin workspace config. C2 snapshot: 296 invocations, all foreign `workspace_roots` (none `<repo>`) → S1.3 `untested-reason` for several effects; authority = `source:workbench:28899` + cycle-1 `deny`/`failClosed` + foreground triggers.
- **Forum (not new fields):** `postToolUse` `additional_context` → model (155689); Windows `stop` log vs `followup_message` (155078).
- **C2 log snapshot:** `/tmp/cursor-hook-experiment-cycle2.log.writeup-snapshot` (839 KB); counts: `preToolUse:97, postToolUse:89, beforeReadFile:54, afterAgentThought:38, subagentStart:7, beforeShellExecution:5, afterShellExecution:5, postToolUseFailure:1`.
- **Restore:** `cmp -s` ok on repo/plugin/user `hooks.json`; no commits (F1).
- **Out of scope:** headless S2 live probe; settings/`argv.json`/`globalStorage` edits; Statsig override for `enable_cc_nested_hook_output_normalization`.
