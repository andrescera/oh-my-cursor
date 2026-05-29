> [!IMPORTANT]
> **v3 — current empirical picture (2026-05-29, pinned to Cursor 3.6.21).**
> v1 and v2 are preserved as historical record:
> - `docs/internal/hooks-empirical-report.v1.md` — 3.1.15 baseline (cycles 1+2)
> - `docs/internal/hooks-v1-vs-v2-claim-diff.md` — v2 claim-by-claim audit
> - `docs/internal/hooks-evidence-v2.jsonl` — 459 v2 hook records (3.1.15)
> - `docs/cursor/03-hooks.md` — operator-facing reference

# Cursor Hooks Empirical Report — v3

**Provenance:** Cursor **3.6.21** (cursor-bin 3.6.21-1, commit `e7a7e93f4d75f8272503ecf33cedbaae10114a10`, workbench sha256 `205317ade21ccf6a2b415ef7fa63c1e4c5d394db626f7ada0151a943e1ecc950`, build 2026-05-28T21:45:36.072Z). Generated 2026-05-29.

**Evidence split — IMPORTANT:**
- The **canonical event set (21 events)** is **binary-confirmed at 3.6.21**: extracted from the live `workbench.desktop.main.js` bundle (enum identifier **`Iv`**, byte offset 23065128, line 35968 of 59004). Source: `docs/internal/reaudit-3621/binary-facts-3621.md`.
- Per-event **payload/field evidence** is sourced from the freshest available live corpus: **Cursor 3.5.38**, captured 2026-05-27..29 (32,561 metadata records; 0 records are 3.6.21). All payload findings are tagged `[3.5.38-corpus]`. Do NOT treat them as 3.6.21-confirmed.
- A **3.6.21 live-fire capture** is pending an optional manual isolated-HOME capture using the W0 harness (see Appendix). Until that capture runs, every payload schema entry carries an implicit `[needs-3.6.21-reconfirm]`.

---

## Methodology

- **Binary source:** `/usr/share/cursor/resources/app/out/vs/workbench/workbench.desktop.main.js` (61,321,015 bytes, sha256 `205317ade21ccf6a2b415ef7fa63c1e4c5d394db626f7ada0151a943e1ecc950`).
- **Corpus source:** experiment-logger-v2 captures, `$ISO_HOME`, 2026-05-27..29. Redacted via `bun run redact.ts` (emails → `<email>`, `$HOME` → `<home>`, API keys scrubbed). Reference: `docs/internal/reaudit-3621/hooks-evidence-3.5.38-summary.md`.
- **Corpus Cursor version:** `cursor_version` field = `"3.5.38"` in 32,561/32,561 records (confirmed via `rg '"CURSOR_VERSION": "3.6.21"' --count` → 0).
- **v1 baseline:** `docs/internal/hooks-empirical-report.v1.md`, Cursor 3.1.15, cycles 1+2, 2026-04-17.
- **v2 claim diff:** `docs/internal/hooks-v1-vs-v2-claim-diff.md` (55 v1-derived rows + 11 new-in-v2 rows), Cursor 3.1.15.
- **Config discovery order (unchanged):** `/etc/cursor/hooks.json` → `~/.cursor/hooks.json` → `<workspace>/.cursor/hooks.json`.

---

## Hook Inventory Table

Columns: event name · documented in repo? · fired in 3.5.38 corpus? (count) · payload schema with version tag · matcher target (from v1/v2 source analysis) · status / notes.

**Status legend:**
| Code | Meaning |
|---|---|
| `FIRING` | Observed in 3.5.38 corpus with payload evidence; binary-confirmed at 3.6.21 |
| `FIRING-NEW-v2` | Was zero in v1 (3.1.15); first observed in v2 (3.1.15 wider capture); now has 3.5.38 corpus data |
| `STILL-UNKNOWN` | Zero records in 3.5.38 corpus; requires manual UI trigger or 3.6.21 live-fire capture |
| `NEW-3.6.21-BINARY-ONLY` | New event added in 3.6.21 (not present in 3.0.16/3.1.15); no live-fire records in any version |

| Event name | Documented in repo? | Fired in 3.5.38 corpus? (count) | Payload schema (top-level specific fields; version) | Matcher target | Status / notes |
|---|---:|---:|---|---|---|
| `preToolUse` | yes | **12,824** | `tool_name:str`, `tool_input:obj`, `tool_use_id:str`, `cwd:str\|absent` + common envelope `[3.5.38-corpus]` | `tool_name` (case-sensitive regex) | `FIRING`. High-volume event; fires from both `agent-exec` and `always-local` roles. `cwd` present in ~50% of records (tool-dependent). No schema change vs v1. |
| `postToolUse` | yes | **12,438** | `tool_name:str`, `tool_input:obj`, `tool_output:str` (JSON-encoded), `duration:float`, `tool_use_id:str`, `cwd:str\|absent` + common `[3.5.38-corpus]` | — (observe or additional\_context) | `FIRING`. `tool_output` is a JSON-encoded string. For Shell calls: `{"output":"...","exitCode":N}`. Exit code accessible ONLY here (not via `afterShellExecution`). `additional_context` response field confirmed TAKES-EFFECT `[3.1.15-v2]`. |
| `postToolUseFailure` | yes | **3** | `tool_name:str`, `tool_input:obj`, `error_message:str`, `failure_type:str` (`"timeout"\|"error"\|"permission_denied"`), `duration:float\|int`, `tool_use_id:str`, `is_interrupt:bool`, `cwd:str` + common `[3.5.38-corpus]` | — (observe-only) | `FIRING`. All 3 corpus records: `tool_name="Shell"`. Observe-only; no response fields processed. |
| `beforeShellExecution` | yes | **1,392** | `command:str`, `cwd:str` (may be `""`), `sandbox:bool` + common `[3.5.38-corpus]` | `command` string (regex) | `FIRING`. `permission:"deny"` TAKES-EFFECT `[3.1.15-v2]`. Exit code 2 blocks regardless of `failClosed` `[3.1.15-v2]`. `ask` treated as allow (ACCEPTED-BUT-IGNORED) `[3.1.15-v2]`. |
| `afterShellExecution` | yes | **1,375** | `command:str`, `output:str`, `duration:float`, `sandbox:bool` + common `[3.5.38-corpus]` | — (observe-only) | `FIRING`. **No `exit_code` field** — 0/100 sampled records in 3.5.38 corpus contained it (v1 schema gap persists). Shell exit code is only accessible via `postToolUse.tool_output.exitCode`. |
| `afterAgentThought` | yes | **1,335** | `text:str`, `duration_ms:int` + common `[3.5.38-corpus]` | — (observe-only) | `FIRING-NEW-v2`. Zero in v1 valid-only logger; 19 in v2 (workspace-filter artifact). Now 1,335 in 3.5.38 corpus — 2nd-highest volume event. Fires from both `agent-exec` (12) and `always-local` (7) roles per v2 `[3.1.15-v2]`. |
| `afterFileEdit` | yes | **563** | `file_path:str`, `edits:array` of `{old_string:str, new_string:str}` + common `[3.5.38-corpus]` | `Write`/`TabWrite` (per v1 source) | `FIRING`. No schema change vs v1. Observe-only; no response-field override tested. |
| `subagentStart` | yes | **125** | `subagent_id:str`, `subagent_type:str`, `task:str` (**non-empty**, 125/125), `parent_conversation_id:str`, `tool_call_id:str`, `subagent_model:str` (**NEW vs v1**), `is_parallel_worker:bool` + common `[3.5.38-corpus]` | `subagent_type` | `FIRING`. Schema delta vs v1: `subagent_model` added; `task` now populated (full prompt, 51–15,308 chars); `transcript_path` now non-null. Fires from `agent-exec` role. |
| `afterAgentResponse` | yes | **45** | `text:str`, `input_tokens:int`, `output_tokens:int`, `cache_read_tokens:int`, `cache_write_tokens:int` + common `[3.5.38-corpus]` | — (observe-only) | `FIRING-NEW-v2`. Zero in v1; 1 record in v2 (`always-local` role); 45 in 3.5.38 corpus. High-value for cost attribution hooks. Token counters present in all 45 records. |
| `afterMCPExecution` | yes | **18** | `tool_name:str`, `tool_input:str` (JSON-encoded), `result_json:str`, `duration:float`, `mcp_server_name:str` (**NEW vs v1**) + common `[3.5.38-corpus]` | — (observe-only) | `FIRING`. `mcp_server_name` added since v1. Duration in seconds (not ms). Observe-only. Note: 18 records reflect 3× duplication from multi-logger capture harness. |
| `beforeMCPExecution` | yes | **18** | `tool_name:str`, `tool_input:str` (JSON-encoded), `command:str` (= MCP server name), `mcp_server_name:str` (**NEW vs v1**) + common `[3.5.38-corpus]` | `command` field (= `mcp_server_name`; NOT `tool_name`) | `FIRING`. `mcp_server_name` added since v1. `command` and `mcp_server_name` are identical (18/18 records). Matcher must key off `command` to filter by server; `tool_name` is the specific tool function. |
| `subagentStop` | yes | **0** | Schema per v1: `subagent_id:str`, `subagent_type:str`, `status:str`, `duration_ms:int`, `parent_conversation_id:str`, `message_count:int`, `tool_call_count:int`, `loop_count:int`, `task:str`, `description:str`, `agent_transcript_path:str\|null` + common `[v1-3.1.15 schema; 0 records in 3.5.38]` | `subagent_type` | `STILL-UNKNOWN`. **0 records in 3.5.38 corpus.** `agent_transcript_path` value cannot be confirmed (was `null` in v1; may now be populated per v2 claim 51 indication). `followup_message` response field: UNCONFIRMED `[v2]`. Fires from `always-local` role `[3.1.15-v2 N11]`. Requires 3.6.21 live capture. |
| `stop` | yes | **0** | Schema per v2: `status:str` (`"completed"\|"aborted"\|"error"`), `loop_count:int`, `input_tokens:int`, `output_tokens:int`, `cache_read_tokens:int`, `cache_write_tokens:int` + common `[v2-3.1.15]` | `Stop` (per v1 source) | `STILL-UNKNOWN` in 3.5.38 corpus (0 records). **Was observed in v2 (5 records, `always-local` role) `[3.1.15-v2]`.** `followup_message` TAKES-EFFECT `[3.1.15-v2]`. Token counters confirmed present in v2 Composer path. Requires 3.6.21 live capture to confirm any schema change. |
| `sessionStart` | yes | **0** | Schema per v1 source: `is_background_agent:bool`, `composer_mode:str` + common; response: `env:obj`, `additional_context:str`, `continue:bool` (not enforced) | — | `STILL-UNKNOWN`. 0 records in any version (v1, v2, 3.5.38). Requires a genuinely fresh session window (all captures were continuations). Requires 3.6.21 live capture via W0 isolated harness. |
| `sessionEnd` | yes | **0** | Schema per v1 source: `reason:str` (`"completed"\|"aborted"\|"error"\|"window_close"\|"user_close"`), `duration_ms:int`, `is_background_agent:bool`, `final_status:str`, optional `error_message:str` + common | — (observe-only) | `STILL-UNKNOWN`. 0 records in any version. Same trigger constraint as `sessionStart`. Requires 3.6.21 live capture. |
| `preCompact` | yes | **0** | Schema per v1 source: `trigger:str` (`"manual"\|"auto"`), `context_usage_percent:float`, `context_tokens:int`, `context_window_size:int`, `message_count:int`, `messages_to_compact:int`, `is_first_compaction:bool` + common | — | `STILL-UNKNOWN`. 0 records in any version. Requires session near context limit or manual compact trigger. Requires 3.6.21 live capture. |
| `beforeSubmitPrompt` | yes | **0** | Schema per v1 source: `prompt:str`, `attachments:array`, `composer_mode:str` + common; response: `continue:bool`, `user_message:str` | `UserPromptSubmit` (per v1 source) | `STILL-UNKNOWN`. 0 records in any version. Requires explicit manual UI prompt submission (not agent-exec path). Requires 3.6.21 live capture or manual UI probe. |
| `afterTabFileEdit` | yes | **0** | Schema per v1 source: `file_path:str`, `edits:array` with extended `range`, `old_line`, `new_line` fields (beyond agent variant) + common | `TabWrite` (per v1 source) | `STILL-UNKNOWN`. 0 records in any version. **Tab/UI-only path** — not triggerable by agent tool calls. Requires manual Tab inline-edit workflow. |
| `beforeTabFileRead` | yes | **0** | Schema per v1 source: `file_path:str`, `content:str` (no `attachments`) + common; response: `permission:"allow"\|"deny"` | `TabRead` (per v1 source) | `STILL-UNKNOWN`. 0 records in any version. **Tab/UI-only path** — not triggerable by agent tool calls. Requires manual Tab inline-edit workflow. |
| `workspaceOpen` | no (new, undocumented) | **0** | Unknown — no live-fire records in any version. | Unknown | `NEW-3.6.21-BINARY-ONLY`. **Added in 3.6.21** — present in enum `Iv` (appears 2× in bundle: enum object + ordered array). No Claude-Code name label found wired for it (not in the `*→UserPromptSubmit/Write/Read/...` name map). Defined-but-lightly-wired. **No `workspaceOpen` records in any corpus.** May fire on workspace initialization only. Requires 3.6.21 live capture (fresh-workspace scenario). |

---

## Common Envelope (all events, 3.5.38-confirmed)

Every hook payload carries these fields regardless of event type:

| Field | Type | Notes |
|---|---|---|
| `conversation_id` | `string` (UUID or `""`) | Empty when fired outside an active conversation |
| `generation_id` | `string` (UUID or `""`) | Empty when no active generation |
| `model` | `string` | AI model slug; may be `""` in pre-conversation contexts |
| `session_id` | `string` (UUID or `""`) | |
| `hook_event_name` | `string` | Redundant copy of the event name |
| `cursor_version` | `string` | `"3.5.38"` in corpus; expected `"3.6.21"` in future capture |
| `workspace_roots` | `array[string]` | Always length 1 in observed corpus |
| `user_email` | `string` | Redacted in excerpts |
| `transcript_path` | `string \| null` | Path to `.jsonl` transcript; null for non-agent contexts; non-null in `subagentStart` records (3.5.38) |

Source: `[3.5.38-corpus]` (32,561 records); confirmed against v1/v2 `[3.1.15]`.

---

## Key Re-Verifications vs v1/v2

These findings from the 3.5.38 corpus materially update or correct v1/v2 claims. Each is tagged with its prior claim ID where applicable.

### RV-1: `afterShellExecution` has NO `exit_code` field

**Prior claim (v1 schema row L47):** `afterShellExecution` payload listed as `command:str, output:str, duration:float, sandbox:bool` — no `exit_code` listed.
**3.5.38 finding:** 0/100 sampled records contained `exit_code`. Schema is **identical to v1**. The v1 schema was correct; this finding closes any uncertainty about whether 3.x added `exit_code`.
**Correction:** Shell exit code is accessible ONLY via `postToolUse.tool_output` when `tool_name == "Shell"`, as a JSON-encoded string: `{"output":"...","exitCode":N}`. Confirmed: 76/76 Shell `postToolUse` samples contained `exitCode` in `tool_output`.
**Action:** Hooks that need shell exit codes MUST subscribe to `postToolUse` with a `Shell` matcher, not `afterShellExecution`.
**Source:** `[3.5.38-corpus T-V1]`; `docs/internal/reaudit-3621/hooks-evidence-3.5.38-summary.md`.

---

### RV-2: `subagentStart.task` is NOW POPULATED (invalidates v1/N8)

**Prior claims:**
- v1 payload sample (L420–432): `"task": ""` (empty string).
- v2 N8: Confirmed empty in v2; labeled "Cursor bug: task not populated from Task tool prompt parameter."

**3.5.38 finding:** `task` is **non-empty in 125/125 records**. Task text lengths range from 51 to 15,308 chars — the full delegated prompt text.

**Verdict:** The v1/v2 empty-string observation was **version-specific to 3.1.15** (or possibly a snapshot artifact). In 3.5.38, `task` reliably carries the full task prompt. Hooks that previously saw `task = ""` should be updated to use `task` for filtering/routing.

> [!NOTE]
> Flag as version-dependent: mark v1/N8 as **superseded at 3.5.38**. Needs 3.6.21 re-confirm to close definitively, but 3.5.38 data is strong (125/125 records).

**Additional `subagentStart` schema changes vs v1:**
- `subagent_model` field **ADDED** (model slug assigned to subagent; present 125/125).
- `transcript_path` now **non-null** (was null in v1; now points to subagent `.jsonl` transcript).

**Source:** `[3.5.38-corpus T-V2]`; `docs/internal/reaudit-3621/hooks-evidence-3.5.38-summary.md`.

---

### RV-3: `beforeReadFile.content` = actual file content (NOT conversation blob)

**Prior claims:**
- v1 (L50, L532): `content` field described as "conversation context" — labeled as "counterintuitive naming: `content` = conversation context, not the file being read."
- v2 claim 39: `confirmed` — "Payload `content` field = conversation JSON blob, NOT file content."

**3.5.38 finding:** `content` is the **actual file content** of the file being read. 30/30 sampled records contained non-JSON-parseable raw text: TypeScript, Python, Svelte, markdown, terminal output. Zero records contained a JSON conversation blob.

**Verdict:** The v1/v2 "conversation blob" observation is **contradicted by 3.5.38 data**. Two possible explanations:
1. Cursor changed `beforeReadFile.content` semantics between 3.1.15 and 3.5.38 (version-dependent behavior).
2. The v1/v2 captures were reading transcript `.jsonl` files (which look like JSON blobs) via the `beforeReadFile` hook, creating the misleading observation.

> [!WARNING]
> This is a **prior-error-or-version-dependent finding** — mark v1 claim 39 as **refuted at 3.5.38**. Requires 3.6.21 live-fire reconfirm before updating operator-facing docs. Do not assert 3.6.21 behavior on this point without live evidence.

**Source:** `[3.5.38-corpus T-V4]`; `docs/internal/reaudit-3621/hooks-evidence-3.5.38-summary.md`.

---

### RV-4: `beforeMCPExecution` matcher keys off `command` = MCP server name

**Prior claims:**
- v1 quirk (L618, L627): "`websearch` matcher missed `web_search_exa`" — matcher keys off `command` field.
- v2 N7, claim 41: Confirmed `command` = server name (e.g. `"grep_app"`, `"websearch"`); `tool_name` = specific tool function.

**3.5.38 finding:** `command` and `mcp_server_name` are **identical in 18/18 records**. Both carry the MCP server name (e.g. `"context7"`, `"oh-my-cursor"`). `tool_name` is the specific tool function (e.g. `"query-docs"`, `"noop"`). A new field `mcp_server_name` was added since v1.

**Verdict:** Confirmed and extended. `mcp_server_name` (new) and `command` (existing) are redundant. To match on a specific MCP server, use `matcher` against `command` (= server name). To match on a specific tool within a server, use `tool_name` — but note the matcher docs do not list `tool_name` as a matcher target for `beforeMCPExecution`; `command` is the documented matcher field.

**Source:** `[3.5.38-corpus T-V5]`; `docs/internal/reaudit-3621/hooks-evidence-3.5.38-summary.md`.

---

### RV-5: `afterAgentThought` and `afterAgentResponse` are NOW FIRING at scale

**Prior claims:**
- v1: Both events `count=0` in the valid-only logger window (workspace-filter artifact).
- v2 claim 12/13: `superseded` — both fire; v2 captured 19 `afterAgentThought` and 1 `afterAgentResponse`.

**3.5.38 finding:**
- `afterAgentThought`: **1,335 records** — 2nd-highest volume event overall.
- `afterAgentResponse`: **45 records** — newly carries `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` (not in v1 schema).

**Verdict:** Both events are fully operational and high-value. `afterAgentThought` fires from both `agent-exec` and `always-local` roles. `afterAgentResponse` fires from `always-local` role and includes token-accounting fields for cost attribution.

**Source:** `[3.5.38-corpus]`; `docs/internal/reaudit-3621/hooks-evidence-3.5.38-summary.md`.

---

## workspaceOpen — New Event in 3.6.21

`workspaceOpen` is a **new canonical hook event added in Cursor 3.6.21**. It was not present in the 3.0.16 or 3.1.15 binary (verified: absent from the `bv` enum in 3.0.16, present in the `Iv` enum in 3.6.21).

**Binary evidence:**
- Appears exactly **twice** in `workbench.desktop.main.js` (61,321,015 bytes): once in the enum object `Iv` and once in the parallel ordered canonical array.
- **No human-readable Claude-Code label** found for it — it is not in the `*→UserPromptSubmit/Write/Read/...` name map that other events use for Claude-Code PascalCase compatibility.
- Classified as **defined-but-lightly-wired**: the event slot exists in the canonical enum but no handler or UI label has been wired to it yet.

**Live-fire status:** Zero records in any corpus (v1/v2/3.5.38). Expected trigger: workspace open/initialization event, which does not occur during ongoing chat sessions. Capturing it requires a **fresh workspace open** under the W0 isolated harness.

**Source:** `docs/internal/reaudit-3621/binary-facts-3621.md` (GATE A).

---

## Event Firing Summary

| Category | Events | Count |
|---|---|---:|
| High-volume (>100 in 3.5.38 corpus) | `preToolUse`, `postToolUse`, `beforeReadFile`, `beforeShellExecution`, `afterShellExecution`, `afterAgentThought`, `afterFileEdit`, `subagentStart` | 8 |
| Low-volume (1–99 in 3.5.38 corpus) | `afterAgentResponse`, `afterMCPExecution`, `beforeMCPExecution`, `postToolUseFailure` | 4 |
| Not observed in 3.5.38 (still-unknown) | `subagentStop`, `stop`, `sessionStart`, `sessionEnd`, `preCompact`, `beforeSubmitPrompt`, `afterTabFileEdit`, `beforeTabFileRead` | 8 |
| New in 3.6.21 — no live-fire records | `workspaceOpen` | 1 |
| **Total canonical events** | | **21** |

---

## Schema Delta Summary: 3.1.15 → 3.5.38 (proxy for 3.6.21)

| Event | Field | Change | Source |
|---|---|---|---|
| `afterAgentThought` | (entire event) | **NEW EVENT** — now firing (0→1,335 records) | `[3.5.38-corpus]` |
| `afterAgentResponse` | (entire event) | **NEW EVENT** — now firing (0→45 records) | `[3.5.38-corpus]` |
| `afterAgentResponse` | `text`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` | **NEW FIELDS** | `[3.5.38-corpus]` |
| `subagentStart` | `subagent_model` | **ADDED** | `[3.5.38-corpus]` |
| `subagentStart` | `task` | **CHANGED** — now populated (was `""` in v1/v2) | `[3.5.38-corpus T-V2]` |
| `subagentStart` | `transcript_path` | **CHANGED** — now non-null (was null in v1) | `[3.5.38-corpus]` |
| `beforeMCPExecution` | `mcp_server_name` | **ADDED** (redundant with `command`) | `[3.5.38-corpus T-V5]` |
| `afterMCPExecution` | `mcp_server_name` | **ADDED** | `[3.5.38-corpus]` |
| `afterShellExecution` | `exit_code` | **NOT ADDED** — still absent (v1 gap persists) | `[3.5.38-corpus T-V1]` |
| `beforeReadFile` | `content` semantics | **CHANGED or PRIOR-ERROR** — actual file content, not conversation blob | `[3.5.38-corpus T-V4]`; needs 3.6.21 reconfirm |
| `subagentStop` | `agent_transcript_path` | **UNKNOWN** — 0 records in 3.5.38 | needs 3.6.21 live capture |
| `workspaceOpen` | (entire event) | **NEW EVENT in 3.6.21** — binary-only; 0 live records | `[3.6.21-binary]` |

---

## Payload Samples (Redacted, 3.5.38)

Redacted real stdin payload samples from the 3.5.38 corpus. All emails → `<email>`, home paths → `<home>`, project paths → `<project-path>`.

#### `preToolUse`

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

#### `postToolUse` (Shell — exit code in tool_output)

```json
{
  "model": "claude-opus-4-7-thinking-xhigh",
  "tool_name": "Shell",
  "tool_input": { "command": "pnpm typecheck 2>&1 | tail -15", "cwd": "/mnt/development/<project-path>", "timeout": 30000 },
  "tool_output": "{\"output\":\"<truncated output>\",\"exitCode\":0}",
  "duration": 242.215,
  "tool_use_id": "toolu_01...",
  "hook_event_name": "postToolUse",
  "cursor_version": "3.5.38",
  "user_email": "<email>",
  "transcript_path": null
}
```

#### `afterShellExecution` (note: no exit_code)

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

#### `beforeMCPExecution` (note: command = mcp_server_name)

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

#### `subagentStart` (note: task populated, subagent_model added)

```json
{
  "model": "composer-2.5-fast",
  "subagent_id": "toolu_01QR1aq6BNkJoPRy8SAAAxrN",
  "subagent_type": "sisyphus-junior",
  "task": "TASK: Reroute the inner `_list_one` of `parallel_list_environments` to use the new paginated API...<redacted-blob>",
  "parent_conversation_id": "<uuid>",
  "tool_call_id": "toulu_01QR1aq6BNkJoPRy8SAAAxrN",
  "subagent_model": "composer-2.5-fast",
  "is_parallel_worker": false,
  "hook_event_name": "subagentStart",
  "cursor_version": "3.5.38",
  "user_email": "<email>",
  "transcript_path": "<home>/.cursor/projects/<project>/agent-transcripts/<uuid>/<uuid>.jsonl"
}
```

#### `afterAgentResponse` (note: token-accounting fields)

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

## Hook Response Fields (Current Status)

Summary of response-field effectiveness. Full catalog: `docs/internal/hook-response-fields.md`. All TAKES-EFFECT confirmations are at 3.1.15 `[3.1.15-v2]` unless noted; needs 3.6.21 reconfirm.

| Event | Response field | Status | Notes |
|---|---|---|---|
| `stop` | `followup_message` | `TAKES-EFFECT` `[3.1.15-v2]` | Loop iteration primitive. Multiple stop hooks merge. |
| `postToolUse` | `additional_context` | `TAKES-EFFECT` `[3.1.15-v2]` | Confirmed arrives in agent context. Refutes forum "silently dropped" claim. |
| `beforeShellExecution` | `permission:"deny"` | `TAKES-EFFECT` `[3.1.15-v2]` | Appears in `postToolUseFailure`. |
| `beforeShellExecution` | `user_message` | `TAKES-EFFECT` `[3.1.15-v2]` | Visible in `postToolUseFailure.error_message`. |
| `beforeShellExecution` | exit code 2 | `TAKES-EFFECT` `[3.1.15-v2]` | Blocks regardless of `failClosed`. First-class block mechanism. |
| `beforeShellExecution` | `permission:"ask"` | `ACCEPTED-BUT-IGNORED` `[3.1.15-v2]` | Treated as allow; command runs. |
| `preToolUse` | `permission:"deny"` | `UNCONFIRMED` | Analogous to beforeShellExecution but not separately probed. |
| `preToolUse` | `updated_input` | `UNCONFIRMED` | No probe in v1 or v2. Critical for arg-rewriting hooks. |
| `subagentStop` | `followup_message` | `UNCONFIRMED` | No live probe in v2; 0 records in 3.5.38. |
| `sessionStart` | `env`, `additional_context` | `UNCONFIRMED` | No live records in any version. |
| `beforeMCPExecution` | `permission` | `UNCONFIRMED` | No response-field probe run. |
| `beforeReadFile` | `permission` | `UNCONFIRMED` | Tab path constraint; no probe. |
| `subagentStart` | `permission:"deny"` | `UNCONFIRMED` | No probe in v1 or v2. |
| `afterShellExecution`, `afterMCPExecution`, `afterFileEdit`, `postToolUseFailure`, `sessionEnd` | any field | `OBSERVE-ONLY` | Object-only validators; no response processing. |
| `stop_hook_loop_limit` (config) | — | `DEPRECATED` | Warns and ignores. Use `loop_limit:null` on individual entries instead. |

---

## Config Schema Reference (unchanged since v1)

Global `hooks.json` fields (source: `workbench.desktop.main.js:41458`, enum `Iv`):

| Field | Type | Notes |
|---|---|---|
| `version` | `integer ≥ 1` | Required. Config schema version. |
| `hooks` | `object (event → entry[])` | Required. Map of canonical event name to entry array. |
| `command` (entry) | `string` | Required when `type="command"` (default). Script/binary path. |
| `type` (entry) | `"command"\|"prompt"` | Default `"command"`. |
| `prompt` (entry) | `string` | Required when `type="prompt"`. Non-empty. |
| `model` (entry) | `string` | Optional model override for prompt-type hooks. |
| `matcher` (entry) | `string` (regex) | Optional event filter. `""` or `"*"` = match-all. Case-sensitive `new RegExp(matcher)`. |
| `timeout` (entry) | `number` (seconds) | Per-script timeout. Warn if >3600. |
| `loop_limit` (entry) | `null \| positive int` | Loop cap for `stop`/`subagentStop`. |
| `failClosed` (entry) | `boolean` | Default `false`. `true` = block on hook failure/timeout/invalid JSON. |

Config validation is **fail-fast**: one unknown hook type in any entry can invalidate the full config for that scope.

---

## Appendix: How to Run the 3.6.21 Live-Fire Capture

The following procedure captures hook events from Cursor **3.6.21** in an isolated HOME to avoid touching production hooks and avoid runaway `loop_limit:null` hooks.

### Prerequisites

- Cursor 3.6.21 installed at `/usr/share/cursor/resources/app/`.
- Repo at `/mnt/development/oh-my-cursor/`.
- Watchdog baseline in `/tmp/hooks.json.baseline-*` (created by `experiment-watchdog.sh`).

### Setup (W0 harness)

```bash
# 1. Create isolated HOME
export ISO_HOME="/tmp/oh-my-cursor-exp-$(uuidgen)"
mkdir -p "$ISO_HOME/.cursor/plugins/local/oh-my-cursor/hooks"

# 2. Copy curated hooks config (with finite loop_limit — NO loop_limit:null)
#    Substitute <REPO> placeholders with actual repo path
sed "s|<REPO>|/mnt/development/oh-my-cursor|g" \
  hooks/hooks.experiment.v2.json > \
  "$ISO_HOME/.cursor/plugins/local/oh-my-cursor/hooks/hooks.json"

# Verify: zero loop_limit:null entries
grep -c '"loop_limit": null' \
  "$ISO_HOME/.cursor/plugins/local/oh-my-cursor/hooks/hooks.json"
# Must print 0

# 3. Start Cursor under isolated HOME with target workspace
HOME="$ISO_HOME" cursor /mnt/development/oh-my-cursor

# 4. In the session:
#    - Open a fresh workspace (triggers workspaceOpen candidate)
#    - Run agent tasks (triggers preToolUse, postToolUse, beforeShellExecution, etc.)
#    - Start a fresh session window (triggers sessionStart/sessionEnd)
#    - Let context approach limit (triggers preCompact)
#    - Submit a prompt via the UI manually (triggers beforeSubmitPrompt)

# 5. Monitor capture log
tail -f /tmp/cursor-hook-experiment.log | jq .hook_event_name
```

### Watchdog / Cleanup

```bash
# Safe cleanup (skip reinstall, restore only):
WATCHDOG_SKIP_INSTALL=1 bash hooks/scripts/experiment-watchdog.sh cleanup

# Full cleanup (restore + rehydrate daemon):
bash hooks/scripts/experiment-watchdog.sh cleanup
```

### Priority capture targets

| Event | Trigger action | Priority |
|---|---|---|
| `workspaceOpen` | Open a fresh workspace folder in Cursor | HIGH — new event, 0 records |
| `sessionStart` / `sessionEnd` | Open a fresh Cursor window (not resume) | HIGH — 0 records in all versions |
| `subagentStop` | Invoke a Task that completes; observe its stop | HIGH — `agent_transcript_path` unknown |
| `stop` | Let a session complete naturally | MEDIUM — v2 confirmed firing; needs 3.6.21 schema check |
| `preCompact` | Run a very long session near context limit | LOW — hard to trigger reliably |
| `beforeSubmitPrompt` | Manually type and submit a prompt in UI | MEDIUM — requires UI interaction |

---

## Version History

| Report | Cursor version | Generated | Events covered | Status |
|---|---|---|---|---|
| `hooks-empirical-report.v1.md` | 3.1.15 | 2026-04-17 | 20 canonical | Historical record (superseded) |
| `hooks-v1-vs-v2-claim-diff.md` | 3.1.15 | 2026-04-17 | 20 canonical | Historical record (superseded) |
| `hooks-empirical-report.v3.md` (**this file**) | 3.6.21 (binary) / 3.5.38 (payload proxy) | 2026-05-29 | 21 canonical | **Current** |
