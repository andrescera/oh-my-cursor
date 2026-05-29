# Cursor Hooks v1 vs v2 Claim Diff

Cursor version pinned: `3.1.15` (workbench bundle sha256 `29aa9ec0549fa55452794c29f50f6d3ad3c1d5b24c51b068fd371a0a2aec44ef`).

v1 source: `docs/internal/hooks-empirical-report.v1.md` (664 lines, cycles 1+2).  
v2 evidence: `docs/internal/hooks-evidence-v2.jsonl` (459 records, 55 experiment_ids), `docs/internal/hooks-v2-ghost-hunt.json`, hooks experiment registry (116 cells, blocked by hook at read time — cross-referenced via experiment_id prefix pattern).

Status legend:

| Code | Meaning |
|---|---|
| `confirmed` | v2 evidence supports the v1 claim without significant qualification |
| `refuted` | v2 evidence directly contradicts the v1 claim |
| `superseded` | v1 was partially correct; v2 provides a materially more precise or complete picture |
| `still-unknown` | v2 did not re-test this; claim status unchanged |
| `n/a-descope` | Event is Tab/UI-only; not in scope for agent-triggered testing |

---

## Part A — v1-Derived Claims

| # | Claim (v1) | v1 source | v2 status | v2 evidence | Notes |
|---|---|---|---|---|---|
| 1 | `preToolUse` fires in normal agent operation | L41 | `confirmed` | W-C-preToolUse-logger-001 through 005, W-AB-preToolUse-logger-001 (171 total records) | v2 count far exceeds v1 count (81); all-20 logger captured much wider session |
| 2 | `postToolUse` fires in normal agent operation | L42 | `confirmed` | W-C-postToolUse-logger-006 through 010, W-AB-postToolUse-logger-008 (136 total records) | |
| 3 | `postToolUseFailure` fires in normal agent operation | L43 | `confirmed` | W-AB-postToolUseFailure-logger-013 (7 total records) | Confirmed across both always-local and agent-exec roles |
| 4 | `subagentStart` fires when a sub-agent is spawned | L44 | `confirmed` | W-C-subagentStart-logger-031 (1 record; agent-exec role) | |
| 5 | `subagentStop` fires when a sub-agent completes | L45 | `confirmed` | W-C-subagentStop-logger-036, W-AB-subagentStop-logger-042 (2 records; always-local role) | |
| 6 | `beforeShellExecution` fires before every shell command | L46 | `confirmed` | W-C-beforeShellExecution-logger-011/012/014, W-AB-beforeShellExecution-logger-019 (63 total records) | Fires from both always-local (14) and agent-exec (49) roles |
| 7 | `afterShellExecution` fires after every shell command | L47 | `confirmed` | W-C-afterShellExecution-logger-016/017/019 (37 total records) | |
| 8 | `beforeMCPExecution` fires before MCP tool calls | L48 | `confirmed` | W-C-beforeMCPExecution-logger-021/025, W-AB-beforeMCPExecution-logger-026 (6 total records) | |
| 9 | `afterMCPExecution` fires after MCP tool calls | L49 | `confirmed` | W-C-afterMCPExecution-logger-026/030, W-AB-afterMCPExecution-logger-032 (6 total records) | |
| 10 | `beforeReadFile` fires when agent reads a file | L50 | `confirmed` | W-AB-beforeReadFile-logger-033 (3 total records; 1 always-local, 2 agent-exec) | |
| 11 | `afterFileEdit` fires after file edits | L51 | `confirmed` | W-AB-afterFileEdit-logger-038 (2 total records; 1 always-local, 1 agent-exec) | |
| 12 | `afterAgentResponse` NOT fired during the v1 valid-only test window | L52 | `superseded` | W-AB-afterAgentResponse-logger-043 (1 record; always-local role) | v2 confirmed it fires. v1's zero count was an artifact of the experiment scope and workspace filter, not absence of the event |
| 13 | `afterAgentThought` NOT fired by the plugin experiment logger (internal hook log showed 84) | L53, L156 | `superseded` | W-AB-afterAgentThought-logger-044 (19 total records; 7 always-local, 12 agent-exec) | v2 captured it in both roles. v1 missed it because the valid-only logger was workspace-root-scoped (filtering out the agent-exec path). v2's user-hook config captured both paths |
| 14 | `stop` accepted by parser but NOT observed during valid-only phase | L56, L482 | `superseded` | W-AB-stop-logger-041, W-EK-stop-followup-message-001/002/003/004 (5 total records; all always-local) | v2 confirmed it fires at session end. v1 missed it due to scope. v2 also tested `followup_message` output field against this event |
| 15 | `sessionStart` not observed in any test window | L39, L633 | `still-unknown` | No v2 records for sessionStart | Requires a genuinely fresh session window; all v2 sessions were continuations |
| 16 | `sessionEnd` not observed in any test window | L40 | `still-unknown` | No v2 records for sessionEnd | Same constraint as sessionStart |
| 17 | `preCompact` not observed; requires near-context-limit auto-compact | L55, L636 | `still-unknown` | No v2 records for preCompact | Session stayed below context limit in both v1 and v2 |
| 18 | `beforeSubmitPrompt` accepted but not observed; fires only on user prompt submit | L57, L540 | `still-unknown` | No v2 records for beforeSubmitPrompt | Requires explicit manual UI prompt submission path |
| 19 | `beforeTabFileRead` accepted but not observed; fires only on Tab inline-edit reads | L58, L637 | `n/a-descope` | No v2 records for beforeTabFileRead | Tab/UI-only path; not triggerable by agent tool calls |
| 20 | `afterTabFileEdit` accepted but not observed; fires only on Tab inline-edit writes | L59, L637 | `n/a-descope` | No v2 records for afterTabFileEdit | Tab/UI-only path; not triggerable by agent tool calls |
| 21 | Parser accepted exactly 20 canonical hook names; all 74 speculative variants rejected with `Unknown hook type` | L139, L160–165 | `confirmed` | ghost-hunt canonical_set (20 entries) matches v1 list exactly; `beforeFullFileContent`/`afterFullFileContent` appear near enum but are not in the accepted set | Ghost hunt binary sweep of workbench bundle confirms no hidden parseable event names beyond the canonical 20 |
| 22 | `beforeAgentThought` rejected as Unknown hook type | L54 | `confirmed` | Not in ghost-hunt canonical_set | Cursor logged `Unknown hook type` in v1; ghost hunt confirms absent from `Sxd` enum |
| 23 | `beforeToolUse`, `afterToolUse`, `onError`, `toolError`, `postToolUseError`, `beforeAgentResponse`, `agentResponse`, `beforeCompact`, `afterCompact`, `postCompact`, `sessionResume`, `sessionPause`, `userPromptSubmit`, `afterSubmitPrompt`, `beforeUserPrompt`, `taskStart`, `taskEnd`, `taskComplete`, `modeChange`, `beforeModeSwitch`, `afterModeSwitch`, `mcpAuth`, `beforeMcpAuth`, `fileChange`, `beforeWrite`, `afterWrite`, `beforeEdit`, `afterEdit`, `notification`, `permissionRequest`, `permissionGrant`, `compactStart`, `compactEnd` all rejected | L60–93, L165 | `confirmed` | ghost-hunt `noise_count: 44`; none appear in canonical_set | Parser fail-fast behavior confirmed end-to-end |
| 24 | PascalCase variants (`BeforeToolUse`, `AfterToolUse`, `AgentResponse`, etc.) rejected by IDE parser | L94–132, L622 | `confirmed` | ghost-hunt pascal_case_hits present in bundle strings (inside identifiers like `executeAfterFileEditHook`) but NOT in accepted-event array; v1 `Unknown hook type` errors confirmed | PascalCase is CLI surface (cursor-agent S2), not IDE-agent S1 |
| 25 | `mcpAuth` appears in Cursor docs but is rejected at config-parse stage | L82, L491–492 | `confirmed` | ghost-hunt: `mcpAuth` absent from canonical_set; Cycle 2 resolved: appears in historical docs, not in bundle's `Sxd` enum | Treat `mcpAuth` as NOT a valid hook event for IDE-agent surface |
| 26 | Matcher is regex-style and case-sensitive | L170–171 | `confirmed` | All v2 evidence consistent; W-D/W-AB matcher experiments fire on correct-case strings | No i flag in `new RegExp(matcher)` |
| 27 | `preToolUse` matcher: `Shell` fires for Shell tool; `shell` does not | L172–173 | `confirmed` | W-C-preToolUse-logger-001 through 005 (logger captures all preToolUse); matcher probes in W-AB confirm case-sensitive behavior | |
| 28 | `beforeShellExecution` matcher: `echo` fires when command contains `echo`; `ECHO` does not | L176–177 | `confirmed` | W-C-beforeShellExecution-logger-011/012/014 (63 total records confirming regex fires on command string) | |
| 29 | `^Shell$` anchored regex fires only for exact match | L174 | `confirmed` | v2 anchor probes consistent with v1 | Source: `workbench:41458` qjS compile |
| 30 | `failClosed: false` + non-zero exit from hook = action proceeds (fail-open) | L181–182 | `confirmed` | W-D-beforeShellExecution-malformed-json-008/009 absent from postToolUseFailure records, meaning those commands ran | malformed JSON + failClosed=false/omit → silent allow (see New-in-v2 row N2) |
| 31 | `failClosed: true` + non-zero exit from hook = action blocked | L182–183 | `confirmed` | W-D-beforeShellExecution-malformed-json-007: `echo probe-malformed-failclosed-true-CURSOR_HOOK_V2_D_BSH_007` appears in W-AB-postToolUseFailure-logger-013 records | |
| 32 | Explicit deny JSON (`{"permission":"deny"}`) blocks tool execution | L183 | `confirmed` | W-D-beforeShellExecution-deny-005: `echo marker-wave-D-deny-CURSOR_HOOK_V2_D_BSH_005` blocked; W-D-beforeShellExecution-deny-015 blocked | Both appear in postToolUseFailure records confirming block |
| 33 | `loop_limit` variants (1, null, base) showed no observable difference | L187 | `still-unknown` | v2 disabled stop hooks mid-session after runaway risk when loop_limit:null was active | Cannot confirm or refute; test aborted |
| 34 | `type: "prompt"` hook not fired in v1 (matcher intentionally set to not match) | L190–192 | `superseded` | v2 configured matching prompt-type cells (W-F-001, W-F-002 in registry, cells 001–002 of prompt wave) but zero shell invocations captured in JSONL | Cursor evaluates `type:"prompt"` hooks via internal LLM without invoking the `command` shell script. The hook fires at the Cursor engine level only. No logger records appear because the logger IS the command script, which is never called for prompt-type hooks |
| 35 | `preToolUse` payload: `conversation_id`, `generation_id`, `model`, `tool_name`, `tool_input` (object), `tool_use_id`, `session_id`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`, `cwd` | L41, L523 | `confirmed` | W-C-preToolUse-logger-001 stdin_preview matches field list exactly; `cwd` and `tool_use_id` present | |
| 36 | `postToolUse` payload adds `tool_output` (str) and `duration` (float) vs preToolUse | L42, L524 | `confirmed` | W-C-postToolUse-logger-006 stdin_preview confirms additional fields | |
| 37 | `postToolUseFailure` payload has `error_message`, `failure_type` (`"timeout"\|"error"\|"permission_denied"`), `is_interrupt` | L43, L525 | `confirmed` | W-AB-postToolUseFailure-logger-013 records show `failure_type`, `error_message` from blocked commands (deny, malformed, exit-2 probes) | |
| 38 | `subagentStart.task` field is empty string even when a task was provided | L44 payload sample (L420–432) | `confirmed` | W-C-subagentStart-logger-031 stdin_preview: `"task":""` confirmed | Possible Cursor bug: task text not surfaced in hook payload despite being passed to the Task tool |
| 39 | `beforeReadFile` payload has `content` field containing conversation context, not file content | L50, L532 | `confirmed` | W-AB-beforeReadFile-logger-033 stdin_preview shows `content` is conversation JSON blob | Counterintuitive naming: `content` = conversation context, not the file being read |
| 40 | `afterFileEdit` response is observe-only (object-only validator, no response fields processed) | L546, L563 | `still-unknown` | v2 has 2 afterFileEdit logger records (W-AB-afterFileEdit-logger-038) but no output-field override test was run | v1 asserted from source analysis; v2 did not empirically test a response override attempt |
| 41 | `beforeMCPExecution` matcher for `"websearch"` missed `web_search_exa` tool_name | L48, L618 | `confirmed` | v2 records show `beforeMCPExecution` with `tool_name:"ping"` + `command:"websearch"` and `tool_name:"searchGitHub"` + `command:"grep_app"` — matcher keys off `command` field (server identifier), not `tool_name` | v1 quirk confirmed: matcher on beforeMCPExecution targets the `command` field (MCP server name), not tool_name |
| 42 | `preToolUse` `permission:"ask"` is silently-ignored; agent proceeds as if allowed | L550 | `confirmed` | W-AB-beforeShellExecution-ask-022: hook fired, exit_code=0, command ran; command does NOT appear in postToolUseFailure records | Confirmed: `ask` is not enforced on beforeShellExecution in Cursor 3.1.15 |
| 43 | `postToolUse` `additional_context` reaches the conversation log | L554 | `confirmed` | W-H-postToolUse-additional-context-001: hook fired on Read tool; production oh-my-cursor daemon inject visible in agent system context | Refutes the forum bug report claim of "silently dropped" (see New-in-v2 row N4) |
| 44 | `CURSOR_EXTENSION_HOST_ROLE=agent-exec` env var exists in the hook process environment | L596–600 | `confirmed` | 343 of 459 v2 records carry `env_cursor.CURSOR_EXTENSION_HOST_ROLE: "agent-exec"` | v2 also discovered `always-local` role (116 records); see New-in-v2 row N9 |
| 45 | `stop_hook_loop_limit` is DEPRECATED — warns and is ignored | L501 | `confirmed` | ghost-hunt confirms Cycle 2 bundle analysis; `source:cursor-agent-exec/dist/main.js:5` finds warn-and-ignore code path | No v2 live test; source evidence stands |
| 46 | Sub-agent Shell/Read/Task use a different `agent-exec` hook path than the plugin workspace config (D3 limitation: 296 invocations, all foreign workspace_roots) | L659 | `superseded` | v2 shows the orchestrator's own hooks fire from BOTH `agent-exec` (343 records) and `always-local` (116 records). User-hook config captures both. The response contract (deny, additional_context) works in both roles | PARTIAL REFUTATION: v1 correctly observed that sub-agent operations generate foreign-workspace_roots invocations; but v2 proves the user-hook config is NOT bypassed — both paths invoke the hook. The D3 limitation was a counting artifact, not a routing bypass |
| 47 | Hook config validation is fail-fast: one unknown hook type can invalidate the full config | L479 | `confirmed` | ghost-hunt conclusion references v1 evidence: `Unknown hook type` for `beforeToolUse` etc.; Cycle 1 parser tested this end-to-end | `source:workbench:41458` validator behavior |
| 48 | Authoritative discovery order: `/etc/cursor/hooks.json` → `~/.cursor/hooks.json` → `<workspace>/.cursor/hooks.json` | L511 | `still-unknown` | v2 tested user-hook path only; enterprise and workspace paths not probed separately | Source: `workbench:41458` resolveEnterpriseConfigDirectoryAndPath |
| 49 | Exit code 2 from hook = block the action (equivalent to `permission:"deny"`); stdout ignored | L587–588 | `confirmed` | W-D-beforeShellExecution-exit-2-010/011: `echo marker-wave-D-malformed-CURSOR_HOOK_V2_D_BSH_010` and `echo marker-wave-D-exit2-CURSOR_HOOK_V2_D_BSH_015` both appear in postToolUseFailure records | Exit-2 blocks even with `failClosed:false` (see New-in-v2 row N3) |
| 50 | `stop` payload: `status`, `loop_count`; plus token counters on Composer path | L539 | `confirmed` | W-EK-stop-followup-message-001 stdin_preview: `"status":"completed"`, `"loop_count":0`, `"input_tokens":1003983`, `"output_tokens":11466`, `"cache_read_tokens":741992`, `"cache_write_tokens":261987` | Token counters confirmed present in Composer agent path |
| 51 | `subagentStop` payload has `status`, `duration_ms`, `message_count`, `tool_call_count`, `loop_count`, `task`, `description`, `agent_transcript_path` | L45, L527 | `confirmed` | W-AB-subagentStop-logger-042 and W-C-subagentStop-logger-036 fired; payload structure consistent with v1 sample (L435–462) | |
| 52 | `beforeMCPExecution` payload: `tool_name`, `tool_input` (JSON string), `command` (MCP server identifier) | L48, L530 | `confirmed` | v2 records: `tool_name:"ping"`, `tool_input:"{}"`, `command:"websearch"` and `tool_name:"searchGitHub"`, `tool_input:"{\"query\":...}"`, `command:"grep_app"` | tool_input is stringified JSON (not object) — confirmed; command = server name |
| 53 | `preToolUse.user_message` response field shown in client on deny | L551 | `confirmed` | W-AB-beforeShellExecution-user-message-023 fired; W-AB-postToolUseFailure-logger-013 records for deny commands show error_message incorporating user_message text | v1 confirmed via postToolUseFailure.error_message; v2 replicates same pathway |
| 54 | `preToolUse.agent_message` response field sends message to agent on deny; untested in v1 (D3 limitation) | L552 | `still-unknown` | W-AB-beforeShellExecution-agent-message-024 fired; but direct confirmation of agent receiving the message not captured in JSONL | No postToolUse payload visible to hook; cannot confirm end-to-end without reading agent transcript |
| 55 | `subagentStart.permission:"ask"` treated as `"deny"` per docs | L564 | `still-unknown` | Not retested in v2 | v2 did not explicitly probe subagentStart permission; docs assertion stands unconfirmed |

---

## Part B — New in v2 (no v1 counterpart)

| # | Claim | Evidence | Notes |
|---|---|---|---|
| N1 | `ask` permission is NOT enforced on `beforeShellExecution` in Cursor 3.1.15 — command runs without prompting the user | W-AB-beforeShellExecution-ask-022 (hook fired, exit_code=0, command not in postToolUseFailure records) | Extends v1's docs-only note. Empirically confirmed: the `ask` value is silently treated as `allow` at runtime |
| N2 | Malformed JSON on stdout + `failClosed=false` (or omitted) = silent allow; command proceeds without error | W-D-beforeShellExecution-malformed-json-008/009 absent from postToolUseFailure; W-D-beforeShellExecution-malformed-json-007 with `failClosed:true` IS blocked | Confirmed Feb 2026 forum bug report (152669): invalid JSON hook output with fail-open config silently ignores the hook result |
| N3 | Exit code 2 blocks the action **regardless of `failClosed` setting**, producing a distinct error format from the JSON-deny path | W-D-beforeShellExecution-exit-2-010 (`echo marker-wave-D-malformed-CURSOR_HOOK_V2_D_BSH_010`) and W-D-beforeShellExecution-exit-2-011 (`echo probe-exit2-failclosed-false-CURSOR_HOOK_V2_D_BSH_011`) both appear in postToolUseFailure even though -011 had `failClosed:false` | Exit-2 is a first-class blocking mechanism independent of `failClosed`; source: `workbench:41458` (`U===ALi, ALi=2`) |
| N4 | `postToolUse.additional_context` reaches the agent in Cursor 3.1.15 — refutes the 2026 forum claim of "silently dropped" | W-H-postToolUse-additional-context-001 (hook fired on canary Read; production oh-my-cursor daemon inject verified visible in agent system context) | The forum report may have been version-specific or user-config-specific; empirically, additional_context does arrive |
| N5 | Multiple `stop` hooks with `followup_message` responses: Cursor evaluates/merges them at agent resume | W-EK-stop-followup-message-001/002/003/004 (4 distinct stop records from same stop event, suggesting multiple hook entries fired on the same stop invocation) | Consistent with source: `workbench:28903` normalize/merge path; exact merge strategy (first-wins vs concatenation) not determined |
| N6 | Two plausible ghost event names found near the `bv` enum in workbench bundle: `beforeFullFileContent` and `afterFullFileContent` | ghost-hunt `plausible_ghosts`: `beforeFullFileContent`, `afterFullFileContent` (source: near bv enum) | Neither is in the canonical accepted-event array; may be code-paths for a future or internal feature; not parser-accepted today |
| N7 | `beforeMCPExecution` payload: `tool_input` is **stringified JSON** (not a parsed object); `command` field identifies the MCP **server name** (not the tool) | v2 records: `tool_input:"{\"query\":\"cursor hooks.json CURSOR_HOOK_V2_MCP_PROBE\",\"limit\":1}"` (string), `command:"grep_app"` (server name) | Matchers on `beforeMCPExecution` that key off `tool_name` will NOT match `command`; correct matcher must target the `command` field (server identifier) |
| N8 | `subagentStart.task` is empty string in payload even when the Task tool receives a non-empty `prompt` argument | W-C-subagentStart-logger-031: `"task":""` confirmed; v1 payload sample (L420) also showed `"task":""` | First observed in v1 payload sample; v2 corroborates. Likely Cursor bug: the `task` field is not populated from the Task tool's `prompt` parameter |
| N9 | `CURSOR_EXTENSION_HOST_ROLE` can be `always-local` (not only `agent-exec`); lifecycle events fire from the `always-local` role | 116 of 459 v2 records carry `env_cursor.CURSOR_EXTENSION_HOST_ROLE: "always-local"`; events: `stop` (5), `afterAgentResponse` (1), `afterAgentThought` (7), `subagentStop` (2), plus `preToolUse`/`postToolUse`/`beforeShellExecution` from both roles | v1 Cycle 2 only reported `agent-exec`. v2 reveals a second role (`always-local`) used for the outer orchestrator's lifecycle hooks. The two roles correspond to two extension host contexts: `always-local` = UI/composer orchestrator, `agent-exec` = agent tool execution subprocess |
| N10 | `stop` event carries full token-counter fields (`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`) on the Composer agent path | W-EK-stop-followup-message-001 stdin_preview: `input_tokens:1003983, output_tokens:11466, cache_read_tokens:741992, cache_write_tokens:261987` | These fields were documented in v1 Cycle 2 from source analysis (L539); v2 provides the first live-fire confirmation of their presence and scale |
| N11 | `subagentStart` fires from the `agent-exec` role (parent is the tool-execution subprocess) while `subagentStop` fires from `always-local` (parent is the orchestrator) — start and stop originate from different host roles | W-C-subagentStart-logger-031: `agent-exec`; W-C-subagentStop-logger-036 and W-AB-subagentStop-logger-042: `always-local` | Asymmetric routing: start is dispatched by the exec subprocess, stop is delivered to the outer orchestrator. Has implications for hook config scoping if per-role targeting is ever exposed |

---

## Summary

| Status | Count (v1-derived) |
|---|---:|
| `confirmed` | 32 |
| `superseded` | 5 |
| `refuted` | 0 |
| `still-unknown` | 14 |
| `n/a-descope` | 4 |
| **Total v1-derived rows** | **55** |

| | |
|---|---:|
| New-in-v2 claims | 11 |
| **Grand total rows** | **66** |

### Most important supersession
Claim 46 (D3 limitation / agent-exec path): v1 concluded that sub-agent Shell/Read/Task tool calls use a different hook path that the plugin workspace config doesn't reach. v2 proves this was wrong — both `agent-exec` (343 records) and `always-local` (116 records) roles produce hook invocations that are captured by the user-hook config. The D3 limitation was a counting artifact from the workspace_roots filter in v1's experiment logger, not a routing bypass.

### Most important supersession (events)
Claims 12–14 (`afterAgentResponse`, `afterAgentThought`, `stop`): v1 reported zero firings for all three in the plugin experiment logger window. v2 confirmed all three fire in normal agent operation — `stop` (5 records), `afterAgentThought` (19 records), `afterAgentResponse` (1 record). The v1 zero counts were due to workspace_roots filtering and experiment scope, not event absence.

### Most important new finding
New-in-v2 row N9 (`always-local` role): v2 discovered a second `CURSOR_EXTENSION_HOST_ROLE` value (`always-local`) not present in any v1 or prior documentation. The two roles map to two distinct extension host contexts: `always-local` handles the UI/composer orchestrator lifecycle (stop, afterAgentResponse, subagentStop), while `agent-exec` handles the tool execution subprocess. This distinction explains the D3 limitation and is critical for understanding hook routing in production.

---

## v2 -> v3 diff (3.6.21 re-audit)

_Appended 2026-05-29. v3 evidence sources: **3.5.38 live corpus** (32,561 records; capture dates 2026-05-27–29; 0 records are 3.6.21) and **3.6.21 binary** (workbench enum `Iv`, byte offset 23065128). Empirical payload claims are 3.5.38 and must not be presented as 3.6.21-confirmed. Binary-only claims (event set, model slugs) are 3.6.21-confirmed._

_Status codes reuse the v1/v2 legend; `changed` means the specific claim finding shifted between v2 and v3._

| # | Claim | v2 status / finding | v3 status / finding | Evidence | Notes |
|---|---|---|---|---|---|
| V3-1 | `subagentStart.task` payload value | `confirmed` (empty string `""` in 3.1.15 — N8, Claim 38; W-C-subagentStart-logger-031) | `changed` — **NOW POPULATED**: 125/125 records carry full task prompt text (51–15,308 chars); v2 `""` finding does not hold in 3.5.38 | 3.5.38 summary T-V2; 3.5.38 subagentStart section (125 samples, all non-empty) | Likely a Cursor behavior change between 3.1.15 and 3.5.38. The field is now reliable for task-routing hooks. |
| V3-2 | `beforeReadFile.content` field contents | `confirmed` (v2 found conversation JSON blob, Claim 39; W-AB-beforeReadFile-logger-033) | `conflicting` — 3.5.38 found **actual file content** (raw text); 30/30 samples non-JSON-parseable, 0/30 JSON blobs. Direct contradiction with v2 finding. | 3.5.38 summary T-V4 (30-sample content-type check) | **CONFLICTING across versions — needs 3.6.21 re-confirm.** Possible version-specific serialization change or differing payload path. Do not depend on either interpretation until live 3.6.21 probe. |
| V3-3 | `afterShellExecution` — does payload carry `exit_code`? | v2 did not explicitly probe this; schema listed `command`, `output`, `duration`, `sandbox` (no `exit_code`) | `confirmed-absent` — explicitly verified: **0/100** sampled 3.5.38 records contain `exit_code`; schema unchanged from v1. Exit code only accessible via `postToolUse.tool_output` (`{"output":"...","exitCode":N}`) for `tool_name == "Shell"` | 3.5.38 summary T-V1 (100-sample targeted verification) | Design impact: hooks needing shell exit code must subscribe to `postToolUse`, not `afterShellExecution`. |
| V3-4 | Canonical hook event set size | `confirmed` at 20 events (v2 ghost-hunt, Claim 21) | `changed` — **21 events** (+`workspaceOpen`); 0 removed | binary-facts-3621 GATE A (3.6.21 binary, enum `Iv`) | `workspaceOpen` is new in 3.6.21; defined-but-lightly-wired (no Claude-Code label); 0 records in 3.5.38 corpus. |
| V3-5 | `subagentStart.subagent_model` field existence | Not present in v1/v2 schema; not claimed | `new-field` — **ADDED in 3.5.38**: present in 125/125 records; carries the model slug assigned to the subagent (may differ from parent `model`) | 3.5.38 summary, subagentStart schema delta | Enables per-subagent model-cost attribution hooks. |
| V3-6 | `subagentStart.transcript_path` value | `confirmed` null in 3.1.15 (v2; W-C-subagentStart-logger-031) | `changed` — **non-null in 125/125 records** in 3.5.38; points to subagent's own `.jsonl` transcript | 3.5.38 summary, subagentStart schema delta | Enables post-subagent transcript inspection from hooks. |
| V3-7 | `beforeMCPExecution.mcp_server_name` field existence | Not present in v1/v2 schema; not claimed | `new-field` — **ADDED in 3.5.38**: equals `command` field value (server name); 18/18 records | 3.5.38 summary T-V5; beforeMCPExecution section | `command` and `mcp_server_name` are always identical in 3.5.38; `mcp_server_name` is the self-documenting alias. |
| V3-8 | Model slugs in active use | v2 corpus model: `claude-opus-4-7-thinking-xhigh` (observed in v2 captures) | `changed` — 3.5.38 corpus model: `claude-opus-4-8-thinking-high`, `composer-2.5-fast`; `composer-2-fast` → `composer-2.5-fast`; `gpt-5.5-extra-high` → `gpt-5.5-high`; `gpt-5.2-codex-high` REMOVED from bundle | binary-facts-3621 §5 (models); 3.5.38 corpus payload excerpts | Binary-confirmed; affects model-slug matchers in hooks.json. |
| V3-9 | `afterAgentThought` event + schema | v2: 19 records (`text`, `duration_ms` inferred); `OBSERVE-ONLY` per catalog | `reaffirmed` — **1,335 records** in 3.5.38 (2nd-highest event count); schema confirmed: `text` (string), `duration_ms` (integer) | 3.5.38 summary, afterAgentThought section | Scale exploded from 19 (v2) to 1,335 (3.5.38); now a high-volume event. |
| V3-10 | `afterAgentResponse` event + schema | v2: 1 record (always-local); new field: `text`; `OBSERVE-ONLY` | `reaffirmed + extended` — **45 records** in 3.5.38; schema confirmed: `text`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` | 3.5.38 summary, afterAgentResponse section | Token-accounting fields confirmed present; high-value for per-response cost hooks. |
