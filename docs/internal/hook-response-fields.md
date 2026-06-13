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
| `PROBE-DESIGNED` | Runbook probe procedure + scripts authored and dry-run validated; **no live-fire capture yet** — does NOT assert runtime effect. Upgrade from `UNCONFIRMED`; downgrade-safe vs `TAKES-EFFECT` |
| `DEPRECATED` | Field existed or was documented; Cursor now warns and ignores it |
| `OBSERVE-ONLY` | Event fires; no response field is processed (observe/log pattern only) |
| `NOT-FIRED` | Hook matcher may be configured, but Cursor does not invoke the hook for this tool/event pair (3.6.21 live-fire) |
| `BROKEN-AT-3.7.x` | Field was `TAKES-EFFECT` at an earlier version; confirmed non-functional at 3.7.x despite hook firing, valid payload, and valid response. Historical evidence preserved but superseded. |
| `NOT-SUPPORTED-BY-DESIGN` | Staff-confirmed: field is not processed for this event by design; only specific fields (e.g. `permission`, `followup_message`) are honored. |

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
| `postToolUse` | `additional_context` | `BROKEN-AT-3.7.x` | W-H-postToolUse-additional-context-001; Claim 43; N4; W3-self-fire-001; **SUPERSEDED at 3.7.27** | ~~`TAKES-EFFECT` at 3.6.21~~ — **superseded**. Three independent smoke-test rounds at **3.7.27**: hook fires, full stdin payload delivered, execution synchronous, daemon returns valid `additional_context` JSON — context never reaches the model. Disabling all other plugins changed nothing. Staff forum thread **155689**: "planned for broader next hooks iteration" (no ETA). Historical evidence (W-H-postToolUse-additional-context-001; Claim 43; N4; W3-self-fire-001) preserved for audit trail but reflects pre-3.7 behavior only. **Replacement channels:** Task `updated_input` piggyback (via composer preToolUse), `stop.followup_message` (loop-scoped). <!-- last-verified: 3.7.27 broken --> |
| `postToolUse` | `updated_mcp_tool_output` | `UNCONFIRMED` | — | No v2 probe. Field appears in v1 schema documentation only. |
| `postToolUse` | `tool_response` (payload field) | `OBSERVE-ONLY` | Claim 36 | `tool_output` (str) and `duration` (float) fields confirmed in payload; no response-field override tested for this event. Payload is used for `tool_use_id` correlation in ULW design. **FIXED at 3.7:** Full stdin payload delivery and synchronous execution both confirmed working at 3.7.27 (three-round smoke test). Input payload fields (`tool_name`, `tool_input`, `tool_output`, `tool_use_id`) all present; hook executes synchronously before model continues. <!-- last-verified: 3.7.27 fixed --> |
| `preToolUse` | `permission: "deny"` | `TAKES-EFFECT-at-3.7.x` (matrix; B-2a) | Claim 1; Claim 32; W3-self-fire-001; **B-37-preToolUse-deny-001** | **Task 2 B-2(a) verdict: `DENY_VERDICT: TAKES-EFFECT`** (`.omo/evidence/task-2-deny-probe.log`). The verified 3.7 channel matrix lists `preToolUse.permission` as **WORKS** (Cursor docs + operator 3.7.27 testing; plan `dynamic-models-and-37-upgrades.md:39`), consistent with `beforeShellExecution.permission:"deny"` = `TAKES-EFFECT` (W-D-beforeShellExecution-deny-005/015) which shares the same deny contract path. Daemon returns `permission:"deny"` for plan-mode `Write` in unit tests (response-shape validated, `.omo/evidence/task-14-deny-shape.json`). **Provenance: 3.7-channel-matrix + analogy; no in-repo 3.7.x self-fire yet** — re-confirm via cell `B-37-preToolUse-deny-001` (runbook §Part B/B-2). Guards (Tasks 20–25) use deny as PRIMARY channel; fallback if a later self-fire flips to BROKEN = `preToolUse.updated_input` (WORKS) + context-collector advisory; do NOT use `postToolUse.additional_context` (BROKEN-at-3.7.x). <!-- last-verified: 3.6.21; 3.7.x-matrix --> |
| `preToolUse` | (TodoWrite `tool_name`) | `NOT-FIRED` | W3-TodoWrite-hook-absence-001 | <!-- last-verified: 3.6.21 --> Agent self-fire: 2× `TodoWrite` calls, 0 workspace-logger or daemon `tool_name=TodoWrite` records despite production matcher including `TodoWrite`. Neither `preToolUse` nor `postToolUse` fires. See `.cursor/evidence/w3-probe-results.md`. |
| `preToolUse` | `permission: "ask"` | `ACCEPTED-BUT-IGNORED` | Claim 42; N1 | Confirmed on `beforeShellExecution` (W-AB-beforeShellExecution-ask-022). Applies by extension to `preToolUse`; not separately probed. |
| `preToolUse` | `user_message` | `UNCONFIRMED` | Claim 53 | v2 probed on `beforeShellExecution` (W-AB-beforeShellExecution-user-message-023), not on `preToolUse` directly. Pathway is plausible but unconfirmed for the general preToolUse event. |
| `preToolUse` | `agent_message` | `UNCONFIRMED` | Claim 54 | W-AB-beforeShellExecution-agent-message-024 fired; direct confirmation of agent receiving the message not captured in JSONL. No postToolUse payload visible to hook; requires transcript inspection. |
| `preToolUse` | `updated_input` | `PROBE-DESIGNED` | W-X-preToolUse-task-updated-input-merge-001, -merge-002, -size-003 (B-series; DESIGN-PHASE) | B-series runbook probe (`hooks-experiments-runbook.md` §B) targets the Task tool: replace-vs-merge, prompt + `subagent_type` survival, and prompt size bound. Scripts `hooks/experiments/responders/task-updated-input-probe.sh` + `task-piggyback-size-probe.sh` dry-run validated (valid `updated_input` JSON for model-only/prompt-piggyback/echo-all + 1K/8K/64K sizes); evidence `.omo/evidence/task-1-merge-semantics.log`, `.omo/evidence/task-1-size-limit.log`. Forum 151985 (Cursor staff, 2026-04-07) reports the fix shipped on 3.7.x. **Not `TAKES-EFFECT`** — pending a live-fire `subagentStart` capture. Expected (design-phase): MERGE (shallow); Task 7 central composer echoes all original fields (replace-safe). Critical for `question-label-truncator`, `non-interactive-env`, `webfetch-redirect-guard` ports. |
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
| `sessionStart` | `additional_context` | `BROKEN` | Claim 15; staff thread **158452** (2026-04-19) | Timing bug confirmed by staff (forum thread 158452, Apr 19 2026): `additional_context` from `sessionStart` does not reach the model due to a race between hook execution and context assembly at session init. `env` is unaffected and still works. Historical UNCONFIRMED status (no live-fire at 3.6.21) superseded by staff confirmation. Do not depend on `sessionStart.additional_context` for session-recovery or context injection. <!-- last-verified: staff-confirmed broken 2026-04-19 --> |
| `sessionEnd` | any response field | `UNCONFIRMED` | Claim 16 | No v2 records; same constraint as `sessionStart`. _Still-unknown at 3.6.21; 0 sessionEnd records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `preCompact` | any response field | `UNCONFIRMED` | Claim 17 | Session stayed below context limit in both v1 and v2. _Still-unknown at 3.6.21; 0 preCompact records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `beforeSubmitPrompt` | `updated_input`, `additional_context` | `NOT-SUPPORTED-BY-DESIGN` | Claim 18; staff thread **158883** (2026-04-23) | Staff-confirmed (forum thread 158883, Apr 23 2026): `beforeSubmitPrompt` only honors `permission` and `followup_message` by design. `updated_input` and `additional_context` are not processed for this event. Historical UNCONFIRMED status superseded by staff confirmation. |
| `beforeSubmitPrompt` | `permission`, `followup_message` | `UNCONFIRMED` | Claim 18 | These two fields are the only ones Cursor processes for `beforeSubmitPrompt` per staff (thread 158883, Apr 23 2026). No live-fire probe run; status remains UNCONFIRMED empirically but supported by design. _Still-unknown at 3.6.21; 0 beforeSubmitPrompt records in 3.5.38 corpus; no live-fire capture as of 2026-05-29._ |
| `subagentStart` | `permission`, `user_message` | `UNCONFIRMED` | Claim 55; N8 | ⚠️ **CHANGED (3.5.38):** `subagentStart.task` payload field was empty string in 3.1.15 (N8; Claim 38), but is **NOW POPULATED** in 3.5.38 — 125/125 records carry full task prompt text (lengths 51–15,308 chars). Also NEW in 3.5.38: `subagent_model` field (model assigned to subagent, 125/125 records) and `transcript_path` now non-null (was null in v1). Permission/message response-field probes not yet run; subagent_id = tool_call_id. (3.5.38 summary, T-V2) |
| `subagentStart` | `subagent_model` (payload field) | `PRESENT` (`TAKES-EFFECT`) `[3.5.38-corpus]` | **B-37-subagentStart-subagent-model-001**; 3.5.38-corpus T-V2; claim-diff V3-5; official-doc (`subagent-latency-research.md:83` → cursor.com/docs/hooks) | **Contradiction resolved (Task 2 B-2(b)) — single authoritative status: `subagent_model` is PRESENT.** Corpus shows the field in **125/125** `subagentStart` records with concrete slug values (sample `composer-2.5-fast`, `hooks-empirical-report.v3.md:301`); official Cursor hook docs list `subagent_model` among `subagentStart` input fields. **Forum bug 156647 (Apr 2026, "missing") is SUPERSEDED-at-3.5.38** — it described the pre-3.5.38 schema (field genuinely absent in v1/3.1.15 per claim-diff V3-5); it is **NOT** carried as a live ❌. Corpus is the live authority; the two claims do not coexist as live. Verdict `SUBAGENT_MODEL: PRESENT` (`.omo/evidence/task-2-subagent-model.log`; resolution `.omo/evidence/task-2-docs-resolution.txt`). Tasks 7 / 14–18 may depend on this field. Provenance: 3.5.38 corpus (proxy for 3.6.21/3.7.x) + official docs; optional 3.7.x self-fire via cell `B-37-subagentStart-subagent-model-001`. <!-- last-verified: 3.5.38-corpus --> |
| `postToolUseFailure` | any response field | `OBSERVE-ONLY` | Claim 3; Claim 37 | Event confirmed firing (7 records). Payload fields: `error_message`, `failure_type` (`"timeout"|"error"|"permission_denied"`), `is_interrupt`. No response processing expected. |
| `beforeTabFileRead` | any response field | `OBSERVE-ONLY` | Claim 19 | Tab/UI-only path; not triggerable by agent tool calls. `n/a-descope` in claim diff. |
| `afterTabFileEdit` | any response field | `OBSERVE-ONLY` | Claim 20 | Tab/UI-only path. `n/a-descope` in claim diff. |
| `workspaceOpen` | any response field | `UNCONFIRMED` | binary-facts-3621 GATE A | **NEW EVENT in 3.6.21** — added to canonical set (20 → 21 events, enum `Iv`). Appears twice in bundle (enum object + ordered array); no Claude-Code name label wired yet (defined-but-lightly-wired per 3.6.21 binary analysis). Zero records in 3.5.38 corpus — event did not fire during chat sessions captured 2026-05-27–29. Likely fires only on workspace initialization, not during active agent sessions. No response-field probe run; status presumed `OBSERVE-ONLY` by analogy but empirically `UNCONFIRMED`. A2 runbook probe: see hooks-experiments-runbook.md §A2. Workspace hooks.json logger installed during W2.1 (observe-only). _Still-unknown at 3.6.21; no live-fire capture as of 2026-05-29._ |

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
- `beforeShellExecution.permission: "deny"` — shell blocking, safety guards
- `beforeShellExecution.user_message` — user-visible denial reason
- `beforeShellExecution` exit code 2 — unconditional block (failClosed-independent)
- `beforeShellExecution` malformed JSON + `failClosed=true` — block path
- `postToolUse` input payload + synchronous execution — FIXED at 3.7.27; full stdin payload and sync behavior confirmed

**Require new experiments before depending on:**
- `preToolUse.permission: "deny"` — plausible but not empirically verified
- `preToolUse.updated_input` — critical for arg-rewriting hooks; `PROBE-DESIGNED` (B-series, `hooks-experiments-runbook.md` §B) — scripts + procedure ready, live-fire `subagentStart` capture pending. Reported fixed for the Task tool on the 3.7 line (Apr 2026, forum 151985) per plan context; until a live-fire capture confirms, the Task 7 central composer echoes all original `tool_input` fields (replace-safe).
- `subagentStop.followup_message` — architecturally attractive for ULW but UNCONFIRMED; Oracle design uses `postToolUse(Task) + tool_use_id` instead (see [overloop-design.md](./overloop-design.md))
- `sessionStart.env` — `additional_context` is BROKEN (timing bug, staff thread 158452); `env` unaffected but still requires fresh-session experiment
- `beforeMCPExecution.permission` — needed for MCP-level guards

**Do not use:**
- `postToolUse.additional_context` — **BROKEN-AT-3.7.x** (staff thread 155689; three-round 3.7.27 smoke test). Context never reaches model despite hook firing and valid response. **Replacement channels:** Task `preToolUse.updated_input` piggyback (via composer), `stop.followup_message` (loop-scoped only).
- `sessionStart.additional_context` — **BROKEN** (timing bug; staff thread 158452, Apr 19 2026). Use `sessionStart.env` instead.
- `beforeSubmitPrompt.updated_input` / `beforeSubmitPrompt.additional_context` — **NOT-SUPPORTED-BY-DESIGN** (staff thread 158883, Apr 23 2026). Only `permission` and `followup_message` are honored for this event.
- `stop_hook_loop_limit` — DEPRECATED; warns and ignores
- `beforeShellExecution.permission: "ask"` — ACCEPTED-BUT-IGNORED; treated as allow
- Any `after*` response override — OBSERVE-ONLY per v1 schema; no v2 override evidence
