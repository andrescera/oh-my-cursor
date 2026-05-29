# Hook Response Fields — Per-Event Status Catalog

_Generated: 2026-04-17_

**See also:**
- [experiments-methodology.md](./experiments-methodology.md) — how evidence is collected and cited
- [overloop-design.md](./overloop-design.md) — design decisions that depend on TAKES-EFFECT fields
- [hooks-v1-vs-v2-claim-diff.md](./hooks-v1-vs-v2-claim-diff.md) — full evidence trace for each claim

---

## Status legend

| Code | Meaning |
|---|---|
| `TAKES-EFFECT` | Empirically confirmed the field changes runtime behavior in Cursor 3.1.15 |
| `ACCEPTED-BUT-IGNORED` | Hook invocation proceeds (exit 0 accepted), field value has no observable runtime effect |
| `UNCONFIRMED` | No v2 probe targeted this field; semantics unknown |
| `DEPRECATED` | Field existed or was documented; Cursor now warns and ignores it |
| `OBSERVE-ONLY` | Event fires; no response field is processed (observe/log pattern only) |

> **Evidence baseline:** Initial claims confirmed in Cursor **3.1.15** (workbench sha256 `29aa9ec0…`).
> _Refreshed 2026-05-29: live evidence now from **3.5.38 corpus** (32,561 records, capture dates 2026-05-27–29); event-set confirmed at **3.6.21 binary** (21 events, enum `Iv` at byte offset 23065128). 3.5.38 is the closest available 3.6.21 proxy — all empirical payload claims are labeled **3.5.38** and must not be presented as 3.6.21 confirmed facts; provenance gates evidence._

---

## Catalog

| Event | Response field / mechanism | Status | Evidence IDs | Notes |
|---|---|---|---|---|
| `stop` | `followup_message` | `TAKES-EFFECT` | W-EK-stop-followup-message-001, 002, 003, 004; Claim 14; N5 | Multiple `stop` hooks fire on the same stop invocation; Cursor merges/evaluates all. Exact merge strategy (first-wins vs concatenation) not determined. Token counters (`input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`) confirmed present in payload (N10). _TAKES-EFFECT status based on 3.1.15 evidence only; 3.5.38 corpus had 0 `stop` records — still-unknown at 3.6.21 whether behavior unchanged; no live-fire capture as of 2026-05-29._ |
| `stop` | `loop_limit` variants | `DEPRECATED` | Claim 33, Claim 45 | v2 disabled stop hooks mid-session after runaway risk; `stop_hook_loop_limit` config warns-and-ignores per source analysis (Claim 45). Use `loop_limit: null` in `.cursor/hooks.json` to allow multi-iteration; see `overloop-design.md`. |
| `stop` | `decision` / `reason` | `UNCONFIRMED` | — | Returned by current daemon code alongside `followup_message`; no isolated probe confirms or refutes their effect. _Still-unknown at 3.6.21; no live-fire capture as of 2026-05-29 (0 stop records in 3.5.38 corpus)._ |
| `subagentStop` | `followup_message` | `UNCONFIRMED` | Claim 5; N11 | v2 confirmed the event fires (W-C-subagentStop-logger-036, W-AB-subagentStop-logger-042) but no dedicated response-field probe ran. `subagentStop` fires from `always-local` role; `subagentStart` fires from `agent-exec` (N11 — asymmetric routing). _Still-unknown at 3.6.21; 0 subagentStop records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `subagentStop` | `agent_transcript_path` (payload field) | `UNCONFIRMED` | Claim 51 | Field present in payload per v1 schema; no v2 override tested. Format not confirmed (E5 experiment not run). 3.5.38 T-V3: 0 subagentStop records in corpus — `agent_transcript_path` value (real path vs null) remains unverified. _Still-unknown at 3.6.21; no live-fire capture as of 2026-05-29._ |
| `postToolUse` | `additional_context` | `TAKES-EFFECT` | W-H-postToolUse-additional-context-001; Claim 43; N4 | Confirmed: production oh-my-cursor daemon inject visible in agent system context. Refutes 2026 forum claim of "silently dropped". |
| `postToolUse` | `updated_mcp_tool_output` | `UNCONFIRMED` | — | No v2 probe. Field appears in v1 schema documentation only. |
| `postToolUse` | `tool_response` (payload field) | `OBSERVE-ONLY` | Claim 36 | `tool_output` (str) and `duration` (float) fields confirmed in payload; no response-field override tested for this event. Payload is used for `tool_use_id` correlation in ULW design. |
| `preToolUse` | `permission: "deny"` | `UNCONFIRMED` | Claim 1; Claim 32 | v2 ran only logger cells on `preToolUse`; no dedicated deny probe. Deny path confirmed working on `beforeShellExecution`; assumed analogous but not empirically verified for `preToolUse`. |
| `preToolUse` | `permission: "ask"` | `ACCEPTED-BUT-IGNORED` | Claim 42; N1 | Confirmed on `beforeShellExecution` (W-AB-beforeShellExecution-ask-022). Applies by extension to `preToolUse`; not separately probed. |
| `preToolUse` | `user_message` | `UNCONFIRMED` | Claim 53 | v2 probed on `beforeShellExecution` (W-AB-beforeShellExecution-user-message-023), not on `preToolUse` directly. Pathway is plausible but unconfirmed for the general preToolUse event. |
| `preToolUse` | `agent_message` | `UNCONFIRMED` | Claim 54 | W-AB-beforeShellExecution-agent-message-024 fired; direct confirmation of agent receiving the message not captured in JSONL. No postToolUse payload visible to hook; requires transcript inspection. |
| `preToolUse` | `updated_input` | `UNCONFIRMED` | — | No v2 probe. Critical for `question-label-truncator`, `non-interactive-env`, `webfetch-redirect-guard` ports. |
| `beforeShellExecution` | `permission: "deny"` | `TAKES-EFFECT` | W-D-beforeShellExecution-deny-005; W-D-beforeShellExecution-deny-015; Claim 32 | Both marker commands appear in `postToolUseFailure` records confirming block. |
| `beforeShellExecution` | `permission: "ask"` | `ACCEPTED-BUT-IGNORED` | W-AB-beforeShellExecution-ask-022; N1; Claim 42 | Hook fires, exit_code=0, command runs. `ask` treated as `allow` in Cursor 3.1.15. Not enforced. |
| `beforeShellExecution` | `user_message` | `TAKES-EFFECT` | W-AB-beforeShellExecution-user-message-023; Claim 53 | Confirmed via `postToolUseFailure.error_message` incorporating the user_message text. |
| `beforeShellExecution` | `agent_message` | `UNCONFIRMED` (end-to-end) | W-AB-beforeShellExecution-agent-message-024; Claim 54 | Hook fired; end-to-end delivery to agent not confirmed without transcript access. |
| `beforeShellExecution` | exit code 2 | `TAKES-EFFECT` (block) | W-D-beforeShellExecution-exit-2-010, 011; Claim 49; N3 | **Blocks regardless of `failClosed` setting.** Exit-2 is a first-class blocking mechanism; source: `workbench:41458` (`U===ALi, ALi=2`). Distinct error format from JSON-deny path. |
| `beforeShellExecution` | malformed JSON + `failClosed=false` | `ACCEPTED-BUT-IGNORED` | W-D-beforeShellExecution-malformed-json-008, 009; Claim 30; N2 | Silent allow: commands proceed, no `postToolUseFailure` record. Confirms 2026 forum bug report (issue 152669). |
| `beforeShellExecution` | malformed JSON + `failClosed=true` | `TAKES-EFFECT` (block) | W-D-beforeShellExecution-malformed-json-007; Claim 31 | Appears in `postToolUseFailure` records; command blocked. |
| `beforeMCPExecution` | `permission`, `user_message`, `agent_message` | `UNCONFIRMED` | Claim 8; Claim 52; N7 | v2 confirmed the event fires (6 records); 18 records in 3.5.38. Response-field probes not yet run. **Matcher note (3.5.38-reaffirmed, T-V5):** matcher keys off the `command` field (= MCP server name), NOT `tool_name` — confirmed 18/18 records in 3.5.38. NEW field in 3.5.38: `mcp_server_name` (always equal to `command`; both carry the server name e.g. `"context7"`, `"oh-my-cursor"`). Use `command` or `mcp_server_name` for server-level matchers; use `tool_name` only for specific tool-function matching. |
| `afterShellExecution` | any response field | `OBSERVE-ONLY` | Claim 7 | Event confirmed firing (37 v2 records; 1,375 in 3.5.38). No response-field processing expected for `after*` events per v1 schema analysis. **Payload note (3.5.38-confirmed):** `exit_code` field is **ABSENT** — 0/100 sampled 3.5.38 records contain it. Shell exit code is accessible only via `postToolUse.tool_output` (JSON-encoded: `{"output":"...","exitCode":N}`) when `tool_name == "Shell"` — confirmed 76/76 Shell postToolUse records in 3.5.38. Do NOT rely on `afterShellExecution` for exit-code detection. (3.5.38 summary, T-V1) |
| `afterMCPExecution` | any response field | `OBSERVE-ONLY` | Claim 9 | Event confirmed firing (6 v2 records). Same pattern as `afterShellExecution`. |
| `afterFileEdit` | any response override | `UNCONFIRMED` | Claim 40 | v1 asserted observe-only from source analysis. v2 has 2 logger records (W-AB-afterFileEdit-logger-038) but no override test ran. |
| `beforeReadFile` | any response field | `OBSERVE-ONLY` | Claim 10; Claim 39 | Confirmed firing (3 v2 records; 2,425 in 3.5.38). **⚠️ CONFLICTING `content` field observations across versions — needs 3.6.21 re-confirm:** v1/v2 (3.1.15): `content` = conversation JSON blob, NOT file content (Claim 39; W-AB-beforeReadFile-logger-033 stdin_preview showed JSON). 3.5.38 (T-V4, 30-sample content-type check): `content` = **actual file content** of the file being read (raw TypeScript/Python/markdown/etc. text) — 30/30 records non-JSON-parseable, 0/30 JSON conversation blobs. These findings are directly contradictory; possible cause: version-specific Cursor behavior change or differing payload serialization between 3.1.15 and 3.5.38. Do not rely on either interpretation until a 3.6.21 live-fire probe disambiguates. |
| `afterAgentResponse` | any response field | `OBSERVE-ONLY` | Claim 12; N9 | v2 confirmed it fires (1 record, `always-local` role). No response-field processing expected. |
| `afterAgentThought` | any response field | `OBSERVE-ONLY` | Claim 13; N9 | v2: 19 records (7 `always-local`, 12 `agent-exec`). v1 missed it due to workspace_roots filter. |
| `sessionStart` | `env` | `UNCONFIRMED` | Claim 15 | No v2 records for `sessionStart`; all v2 sessions were continuations (not fresh session windows). _Still-unknown at 3.6.21; 0 sessionStart records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `sessionStart` | `additional_context` | `UNCONFIRMED` | Claim 15 | Same constraint: requires a genuinely fresh session to fire. _Still-unknown at 3.6.21; no live-fire capture as of 2026-05-29._ |
| `sessionEnd` | any response field | `UNCONFIRMED` | Claim 16 | No v2 records; same constraint as `sessionStart`. _Still-unknown at 3.6.21; 0 sessionEnd records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `preCompact` | any response field | `UNCONFIRMED` | Claim 17 | Session stayed below context limit in both v1 and v2. _Still-unknown at 3.6.21; 0 preCompact records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `beforeSubmitPrompt` | `user_message`, `additional_context`, `continue` | `UNCONFIRMED` | Claim 18 | No v2 records; requires explicit manual UI prompt submission path. Current daemon returns these fields from `beforeSubmitPrompt` handler but no live-fire confirmation. _Still-unknown at 3.6.21; 0 beforeSubmitPrompt records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `subagentStart` | `permission`, `user_message` | `UNCONFIRMED` | Claim 55; N8 | ⚠️ **CHANGED (3.5.38):** `subagentStart.task` payload field was empty string in 3.1.15 (N8; Claim 38), but is **NOW POPULATED** in 3.5.38 — 125/125 records carry full task prompt text (lengths 51–15,308 chars). Also NEW in 3.5.38: `subagent_model` field (model assigned to subagent, 125/125 records) and `transcript_path` now non-null (was null in v1). Permission/message response-field probes not yet run; subagent_id = tool_call_id. (3.5.38 summary, T-V2) |
| `postToolUseFailure` | any response field | `OBSERVE-ONLY` | Claim 3; Claim 37 | Event confirmed firing (7 records). Payload fields: `error_message`, `failure_type` (`"timeout"|"error"|"permission_denied"`), `is_interrupt`. No response processing expected. |
| `beforeTabFileRead` | any response field | `OBSERVE-ONLY` | Claim 19 | Tab/UI-only path; not triggerable by agent tool calls. `n/a-descope` in claim diff. |
| `afterTabFileEdit` | any response field | `OBSERVE-ONLY` | Claim 20 | Tab/UI-only path. `n/a-descope` in claim diff. |
| `workspaceOpen` | any response field | `UNCONFIRMED` | binary-facts-3621 GATE A | **NEW EVENT in 3.6.21** — added to canonical set (20 → 21 events, enum `Iv`). Appears twice in bundle (enum object + ordered array); no Claude-Code name label wired yet (defined-but-lightly-wired per 3.6.21 binary analysis). Zero records in 3.5.38 corpus — event did not fire during chat sessions captured 2026-05-27–29. Likely fires only on workspace initialization, not during active agent sessions. No response-field probe run; status presumed `OBSERVE-ONLY` by analogy but empirically `UNCONFIRMED`. _Still-unknown at 3.6.21; no live-fire capture as of 2026-05-29._ |

### W0.4 — `~/.cursor/permissions.json` spike (2026-05-29)

**Determination:** **Not adoptable for plugin enforcement** — Cursor-owned **persistence-only** store for tool/MCP allow/deny decisions the user makes in the IDE; not a documented surface for oh-my-cursor to seed or rewrite policy.

| Evidence | Finding |
|---|---|
| [official-doc] `docs/cursor/07-mcp.md` §Permissions | Wording is “permission **persistence**” at `~/.cursor/permissions.json`; no plugin-authored schema, no pre-grant/pre-deny API. |
| [repro-local] `~/.cursor/permissions.json` | **Absent** on spike host until Cursor creates it (Read 2026-05-29); typical first-create-on-user-allow pattern. |
| `docs/cursor/16-binary-analysis.md`, `15-settings-and-flags.md` | No `permissions.json` references at 3.6.21 re-audit. |
| Repo code | No reads/writes of `permissions.json`; `tool-guard-handlers` enforcement is hook `permission` responses (`beforeMCPExecution`, `preToolUse`, `beforeShellExecution`), not this file. |
| Adoption matrix | Notes → `Not-Adoptable (persistence-only)` <!-- last-verified: 3.6.21 --> |

**Implication for W1.2:** Do not add `permissions-loader` or file-based deny/ask seeding; continue MCP/tool gating via hooks and `mcp_allowlist` in plugin config.

---

## Ghost events (not accepted by parser)

Two event names appear near the `bv` enum in the workbench bundle but are NOT in the canonical accepted set:

- `beforeFullFileContent` — plausible ghost; not parser-accepted in Cursor 3.1.15
- `afterFullFileContent` — plausible ghost; not parser-accepted in Cursor 3.1.15

Source: `docs/internal/hooks-v2-ghost-hunt.json` (`plausible_ghosts` array). Do not use these in `hooks.json`.

---

## Implications for design

**Safe to depend on (TAKES-EFFECT):**
- `stop.followup_message` — loop iteration primitive for ralph-loop and ULW
- `postToolUse.additional_context` — rule injection, context augmentation, capacity for context-window-monitor
- `beforeShellExecution.permission: "deny"` — shell blocking, safety guards
- `beforeShellExecution.user_message` — user-visible denial reason
- `beforeShellExecution` exit code 2 — unconditional block (failClosed-independent)
- `beforeShellExecution` malformed JSON + `failClosed=true` — block path

**Require new experiments before depending on:**
- `preToolUse.permission: "deny"` — plausible but not empirically verified
- `preToolUse.updated_input` — critical for arg-rewriting hooks; untested
- `subagentStop.followup_message` — architecturally attractive for ULW but UNCONFIRMED; Oracle design uses `postToolUse(Task) + tool_use_id` instead (see [overloop-design.md](./overloop-design.md))
- `sessionStart.env` / `additional_context` — needed for session-recovery port; requires fresh session experiment
- `beforeMCPExecution.permission` — needed for MCP-level guards

**Do not use:**
- `stop_hook_loop_limit` — DEPRECATED; warns and ignores
- `beforeShellExecution.permission: "ask"` — ACCEPTED-BUT-IGNORED; treated as allow
- Any `after*` response override — OBSERVE-ONLY per v1 schema; no v2 override evidence
