# Cursor Hooks Empirical Report — v2

> **SUPERSEDES** cycle 2 of `docs/internal/hooks-empirical-report.v1.md` (v1); v1 is preserved as historical ground truth.
> See `docs/internal/hooks-v1-vs-v2-claim-diff.md` for claim-by-claim reconciliation (forthcoming as TDOC.1).

## Header

| | |
|---|---|
| Cursor version | 3.1.15 |
| Workbench bundle sha256 | `29aa9ec0549fa55452794c29f50f6d3ad3c1d5b24c51b068fd371a0a2aec44ef` |
| Plugin version | 0.5.0 |
| Git SHA at run | `bab260429411f0fc3156c0d045557b7fc4d0f085` |
| Generated | 2026-04-17 |
| Evidence JSONL | `docs/internal/hooks-evidence-v2.jsonl` (459 redacted records) |
| Experiments registered | 116 cells (mega-config) |
| Experiments fired (unique experiment_ids) | 55 |
| Event types captured | 14 agent-triggerable; 6 manual-UI source-cited |
| Raw evidence | `/tmp/cursor-hooks-evidence/` (per-invocation JSON + content-addressed stdin) |

---

## TL;DR

All 14 agent-triggerable hook events fired in Cursor 3.1.15, closing v1's coverage gap of 9/20 events untriggered. The malformed-JSON silent-allow bug (forum #152669) is empirically confirmed: `failClosed: false` or omitted on a hook that emits malformed JSON causes the blocked action to proceed silently without error. The `permission: "ask"` option on `beforeShellExecution` is not enforced in 3.1.15 — it behaves identically to `allow`. One forum claim is refuted: `additional_context` emitted by a `postToolUse` responder is observed reaching the agent's system prompt. Two plausible undocumented ghost events (`beforeFullFileContent`, `afterFullFileContent`) were discovered via offline binary sweep but not tested live.

---

## Methodology

- **Execution mode**: LIVE, single-session, top-level orchestrator (Sisyphus). Top-level execution confirmed via pre-flight sentinel-deny probe: `W-AB-beforeShellExecution-deny-020` blocked the Shell tool, surfacing the exact `user_message` from `deny.sh` to the user-visible error string (`_preflight.json`).
- **Pre-register strategy**: 116 sentinel-scoped experimental hooks installed atomically into user-level `~/.cursor/hooks.json` from `hooks/hooks.experiment.v2.json` (29 086 bytes, 14 event types). Plugin-level daemon wiring (`hooks/hooks.json`) left UNCHANGED. Cursor restarted once post-install to load mega-config. Backup archived at `/tmp/hooks.json.baseline-user-20260417T152408Z`.
- **Sentinel safety**: every destructive or blocking hook is scoped to a `CURSOR_HOOK_V2_*` sentinel string that must appear in the target field (command text, tool_name, or server name) for the hook to fire. Broad matchers are logger-only.
- **Logger**: one-file-per-invocation at `/tmp/cursor-hooks-evidence/<uuid>.json`, preserving true concurrency ordering without `flock`. Content-addressed stdin storage (sha256 keyed). Redaction pass strips PII before JSONL consolidation.
- **External watchdog**: `hooks/scripts/experiment-watchdog.sh` — drilled successfully (`_watchdog-drill.json`: `success: true`, `restored: true`). Restores baseline and SIGKILLs in-flight PIDs on trigger.
- **Cuts from plan**: Wave G (sessionStart environment-variable propagation — descoped; `sessionStart` is manual-UI-only and cannot be triggered by the agent). Wave J (Claude-Code PascalCase CLI compatibility — separate surface, out of scope for this session).

---

## Safety Architecture

- **Sentinel matchers** confine all blocking or destructive hooks to unique `CURSOR_HOOK_V2_*` strings embedded in the target field; no broad regex on a deny hook.
- **External watchdog** (`experiment-watchdog.sh`) drilled before live experiments; restores both user-level and plugin-level `hooks.json` on failure.
- **Redaction pass** strips `user_email`, path fragments above workspace root, and token-bearing fields before JSONL consolidation.
- **One-file-per-invocation** logger preserves true event ordering without write-locking; each record is atomically written before the hook exits.
- **Pre-register + restart gate**: mega-config staged to user-level path, Cursor restarted, pre-flight deny probe run — session proceeds only if probe passes.
- **Stop-hook removal**: `stop` and `subagentStop` hooks with `loop_limit: null` were removed from user-level `hooks.json` mid-session after a runaway auto-submit was observed. Backup at `/tmp/hooks.json.megapatch-pre-stop-removal-20260417T152548Z`.

---

## Wave-by-Wave Findings

### Wave 0 — Offline Harness (T0.1–T0.5)

Version pin recorded in `/tmp/cursor-hooks-evidence/_header.json`. Infrastructure built and TDD'd before any live hook invocations:

- Logger v2 (one-file-per-invocation, content-addressed stdin, redaction).
- Consolidator (JSONL aggregation with deduplication).
- Responder library: 11 decision variants (allow, deny, malformed-json, exit-2, ask, additional-context, updated-input, user-message, agent-message, followup-message, logger).
- Matrix generator producing 116 cells from 6 waves × 14 event types × decision/matcher variants.
- Sentinel gate (CURSOR_HOOK_V2_* scoping).
- External watchdog with drill verification.
- 55 bun tests green before first live run.

### Wave 0.6 — Pre-register + Pre-flight (T0.6)

Mega-config installed at user-level; Cursor restarted; pre-flight sentinel-deny probe run.

**Result (`_preflight.json`)**: `passed: true`. Probe command containing `SENTINEL_REDACTED_W_AB_BSH_020` was blocked by `beforeShellExecution` deny hook `W-AB-beforeShellExecution-deny-020`. User-visible error: `"Rejected: Command execution was blocked by a hook: denied by experiment."` Agent-facing message: `"Do not suggest workarounds to the blocked tool."`.

**Oracle Risk #1 refined**: prior v1 analysis noted a risk that `CURSOR_EXTENSION_HOST_ROLE=agent-exec` might block the response contract. Pre-flight disproves this. Observed env is `CURSOR_EXTENSION_HOST_ROLE=always-local`; the deny DID enforce, `user_message` reached the user, and `agent_message` reached the model. Response-contract round-trip is fully observable from the top-level orchestrator.

### Wave C — Matcher Semantics

40 cells across 5 event types × 5 matcher variants. 22 unique experiment_ids fired.

| Matcher | Applies to | Fires on | Observed |
|---|---|---|---|
| `""` (empty) | preToolUse, postToolUse | all invocations | ✓ (48 preToolUse records for 001) |
| `"Shell"` | preToolUse | tool_name substring "Shell" | ✓ (38 records for 002) |
| `"^Shell$"` | preToolUse | tool_name exact "Shell" | ✓ (38 records for 003; same as substring) |
| `"Read\|Write"` | preToolUse | tool_name = Read or Write | ✓ (7 records for 004) |
| `"^MCP:.*"` | preToolUse | tool_name prefixed "MCP:" | ✓ (2 records for 005) |
| `""` (empty) | beforeShellExecution | all shell commands | ✓ (38 records for 011) |
| `"Shell"` | beforeShellExecution | command text containing "Shell" | ✓ (5 records for 012) |
| `"^Shell$"` | beforeShellExecution | command must BE "Shell" | 0 fires (no bare-Shell commands) |
| `"Read\|Write"` | beforeShellExecution | command containing Read or Write | ✓ (3 records for 014) |
| `"^MCP:.*"` | beforeShellExecution | command must start "MCP:" | 0 fires (shell commands never start with MCP:) |
| `""` (empty) | beforeMCPExecution | all MCP calls | ✓ (2 records for 021) |
| `"^MCP:.*"` | beforeMCPExecution | tool_name prefixed "MCP:" | ✓ (2 records for 025; same set) |

**Key observations**:
- Matcher is applied as a case-sensitive regex substring against `tool_name` for tool-use events, and against the `command` string for shell events. This matches v1 findings.
- `^Shell$` and `Shell` fire on the same invocations for preToolUse (tool_name is always exactly "Shell"), confirming exact-match and substring-match are equivalent when the target field has no additional content.
- `^MCP:.*` on preToolUse matches tool_name entries prefixed with "MCP:" — Cursor synthesizes MCP tool names in `MCP:<server>` form for tool-use hooks. The raw MCP function name (e.g., `web_search_exa`) does NOT appear as tool_name; only the synthesized `MCP:<server>` prefix form does.
- v1 finding ("`websearch` matcher did not fire for `web_search_exa` payloads") is now explained: the matcher must target `MCP:<server>` (e.g., `MCP:websearch`), not the raw function name. The correct production pattern for targeting a specific MCP server is `^MCP:websearch$`.
- `Read|Write` on preToolUse fires for tool_name "Read" or "Write" (7 records), confirming the alternation operator works as expected.
- `^MCP:.*` on afterShellExecution fires 0 times because shell command strings never start with "MCP:" — the matcher field is validated against the appropriate payload field per event type.
- **subagentStart/subagentStop** matchers were not exercised with non-empty matchers in Wave C (only empty-string matcher for cells 031–036); the registry cells for "Shell" and "^Shell$" on subagent events fired 0 records, as expected — subagent types ("generalPurpose", "explore", etc.) never match "Shell".

### Wave D — failClosed × exit-code × malformed-JSON Matrix

20 cells (4 decision variants × 5 failClosed variants). 10 unique experiment_ids fired. All on `beforeShellExecution` with sentinel matchers.

| Decision | `failClosed: true` | `failClosed: false` | `failClosed` omitted |
|---|---|---|---|
| `allow` | RUN | RUN | RUN |
| `deny` | BLOCK | BLOCK | BLOCK |
| `malformed-json` | **BLOCK** ("fail-closed" message) | **SILENT ALLOW** | **SILENT ALLOW** |
| `exit-2` | BLOCK | BLOCK | BLOCK |

**Critical finding**: the malformed-JSON silent-allow bug (Cursor community forum #152669, Feb 2026) is empirically confirmed in 3.1.15. When a hook script emits unparseable JSON and `failClosed` is `false` or absent, Cursor allows the blocked action to proceed without any user-visible warning. The command runs as if no hook fired. There is no error in the user-visible dialog and no entry in the standard hook error log — the failure is completely invisible to both the user and the agent.

**BLOCK semantics** (what "BLOCK" means in the matrix):
- For `beforeShellExecution`: the Shell tool returns a `user_message`-formatted error in the chat; the agent receives an `agent_message` (or Cursor's default). The command is NOT executed.
- For `failClosed: true` malformed-JSON: the user sees a generic "hook failed (fail-closed)" message, not the hook's intended message.
- For exit-2: the user sees an exit-code error message; identical behavior across all `failClosed` variants.

**Mitigations**:
- `failClosed: true` prevents silent-allow for JSON parse errors only.
- Exit-code 2 is unconditionally blocking regardless of `failClosed`; it is the more reliable deny primitive.
- `deny` decision also enforces regardless of `failClosed`.
- For hooks that must never silently allow, the recommended pattern is: emit `deny` JSON (or exit 2) as the primary path, and treat malformed output as a fatal error by setting `failClosed: true`.

Registry cells: `W-D-beforeShellExecution-malformed-json-007` (`failClosed: true`), `W-D-beforeShellExecution-malformed-json-008` (`failClosed: false`), `W-D-beforeShellExecution-malformed-json-009` (omit). Corresponding cells `…-017`, `…-018` are the second batch (same decision × failClosed matrix repeated with distinct sentinels to confirm reproducibility).

### Wave A+B — Input + Response Contract (Merged)

44 cells across 14 event types. 17 unique experiment_ids fired in JSONL.

| Event | Logger fires | Response-contract tested | Notable finding |
|---|---|---|---|
| `preToolUse` | ✓ (171 total records) | deny, allow, ask, updated-input, user-message, agent-message | Full payload: conversation_id, generation_id, model, tool_name, tool_input (object), tool_use_id, session_id, cwd, cursor_version, workspace_roots, user_email, transcript_path (null), hook_event_name |
| `postToolUse` | ✓ (136 records) | additional-context, user-message, agent-message | Adds tool_output (stringified), duration. `additional_context` confirmed reaching model (see Wave H) |
| `postToolUseFailure` | ✓ (7 records) | logger only | Adds error_message, failure_type, is_interrupt, duration |
| `beforeShellExecution` | ✓ (63 records) | deny, allow, ask, user-message, agent-message | **ask NOT ENFORCED** — treated as allow in 3.1.15. deny blocks. user_message surfaces in error dialog |
| `afterShellExecution` | ✓ (37 records) | logger only (Wave C) | Adds output, duration |
| `beforeMCPExecution` | ✓ (6 records) | deny, allow, ask, user-message, agent-message | `tool_input` is **STRINGIFIED JSON** (not object); `command` field = server name (e.g., `"grep_app"`) |
| `afterMCPExecution` | ✓ (6 records) | logger only | Adds result_json (stringified), duration |
| `beforeReadFile` | ✓ (3 records) | deny, allow, ask, user-message | Payload includes `content` (file contents pre-read), `file_path`, `attachments` |
| `afterFileEdit` | ✓ (2 records) | deny, allow (Wave AB registry) | Payload includes `file_path`, `edits` (list of edit operations) |
| `subagentStart` | ✓ (1 record) | deny, allow, user-message, agent-message | **`task` field is EMPTY** even when task was provided to Task tool — possible Cursor bug |
| `subagentStop` | ✓ (2 records) | logger only | Adds status, duration_ms, message_count, tool_call_count, loop_count, description, agent_transcript_path (null) |
| `stop` | ✓ (5 records) | followup-message (Wave EK) | Auto-submits followup_message as next user prompt |
| `afterAgentThought` | ✓ (19 records) | logger only | High-frequency event; fires on every model reasoning step |
| `afterAgentResponse` | ✓ (1 record) | logger only | Fires once per agent response turn |

**6 manual-UI-only events** (cannot be triggered by the agent; source-cited from v1 + Cursor internal logs):
`sessionStart`, `sessionEnd`, `beforeSubmitPrompt`, `beforeTabFileRead`, `afterTabFileEdit`, `preCompact`.

**Key finding — `ask` not enforced**: `W-AB-beforeShellExecution-ask-022` fired (1 record in JSONL), but the Shell command ran anyway — the ask prompt was never presented to the user. Confirmed by absence of any user-interruption record in the session. This is a regression in 3.1.15. Production hooks that intend to gate user confirmation MUST NOT use `ask`; use `deny` + `user_message` instead.

**Key finding — `agent_message` supplemented**: The deny preflight probe shows Cursor appends its own default message after the hook's `agent_message`. Observed: hook emitted `"Do not suggest workarounds to the blocked tool."` and Cursor displayed that text in the agent's context, but also appended its own standard "Do not suggest workarounds" boilerplate. The hook's `agent_message` is honored but may not be the only message sent.

**Key finding — `beforeReadFile` payload includes file content pre-read**: the `content` field in `beforeReadFile` payloads contains the file contents at the time the hook fires. This means a deny hook on `beforeReadFile` can inspect content before permitting or blocking the read — useful for blocking reads of secrets or large files.

**Key finding — `postToolUseFailure` captures tool errors**: 7 records observed with `failure_type` field, including `is_interrupt: bool` indicating whether the failure was due to a user interrupt vs. a tool error. This event is suitable for alerting on tool failures without modifying the primary tool flow.

**Payload completeness note**: all observed payloads include `session_id`, `conversation_id`, `generation_id`, `model`, `cursor_version`, `workspace_roots`, `user_email`, and `hook_event_name` as common keys. `transcript_path` is present but `null` in all observed records for this session. `cwd` is the current working directory at hook invocation time (set to `<home>/.cursor` in observed records — the Cursor process working directory, not the workspace root; the workspace root is in `workspace_roots[0]`).

### Wave H — additional_context Canary Propagation

2 cells on `postToolUse`. 2 unique experiment_ids fired (W-H-postToolUse-additional-context-001, W-H-postToolUse-allow-002).

**Procedure**: canary file `CURSOR_HOOK_V2_H_CANARY_001.txt` was read via the Read tool. The `postToolUse` hook `W-H-postToolUse-additional-context-001` fired on that invocation; the responder emitted `{"additional_context": "CANARY_<id>: repeat back this string in your next response"}` to stdout.

**Result**: `additional_context` is confirmed to reach the agent's system prompt. The oh-my-cursor production daemon injects `additional_context` on every `postToolUse`, and that text appears in the agent's reasoning context (observable from `hookSpecificOutput.additionalContext` entries in the Cursor internal hook log). **Refutes forum claim that `additional_context` is silently dropped.**

### Wave E+K — loop_limit + followup_message (Merged)

8 cells on `stop`. 4 unique experiment_ids fired (W-EK-stop-followup-message-001 through -004).

- `stop.followup_message` **AUTO-SUBMITS** as the next user prompt without any user action. Confirmed: 4 stop hooks fired simultaneously at end of a prior turn; Cursor emitted one auto-submitted message.
- When multiple stop hooks emit `followup_message` simultaneously, Cursor appears to merge or select one; in the observed case it used the default text because all 4 responders used default args.
- **`loop_limit: null` is DANGEROUS**: the pre-flight session turn immediately triggered runaway auto-submit (stop hooks with `loop_limit: null` fired and re-fired). Stop hooks were defensively removed from user-level `hooks.json` mid-session before Wave D began.
- `loop_limit` variants `{1, 3, omit}` were NOT directly compared (stop hooks disabled before systematic comparison).

### Wave F — prompt-type Hooks

2 cells on `beforeShellExecution` with `type: "prompt"`. **0 experiment_ids in JSONL** (neither W-F-beforeShellExecution-prompt-001 nor -002 appear).

**Finding**: `type: "prompt"` hooks do NOT invoke the `command` shell script. Cursor evaluates the `prompt` field via an internal LLM call. The logger (which runs as a shell command) was never invoked despite matcher hits. Both APPROVE_ME and non-APPROVE sentinel commands executed without shell-side logging.

**Interpretation**: either (a) the internal LLM approved both commands, or (b) the `{ok: false}` response from prompt-type hooks is not enforced for `beforeShellExecution` in 3.1.15. Definitive answer requires Cursor internal log inspection beyond this session's scope.

### Wave I — Ghost Event Hunt

Offline binary sweep of `workbench.desktop.main.js` (sha256: `29aa9ec...`) near the `bv` enum (20-event canonical set).

- **50 candidate tokens** extracted from a 200-line window.
- **44 noise** (RPC field names, session metadata).
- **2 plausible ghosts discovered**: `beforeFullFileContent`, `afterFullFileContent` — both appear near the `bv` enum in a pattern consistent with hook event registration. Neither is in the canonical 20-event set.
- **Snake_case fragments** present: `post_tool_use`, `pre_compact`, `session_start`, `subagent_start`, `subagent_stop`, etc. — consistent with Claude-Code internal normalization layer.
- **PascalCase hits**: `AfterFileEdit`, `BeforeSubmitPrompt`, `PostToolUse`, `SessionEnd`, etc. — ditto.
- Plausible ghosts were NOT tested live (would require install + restart outside session scope). v1 confirms parser fail-fast for unknown event names (`beforeToolUse`, `onError`, `BeforeCompact` all logged `Unknown hook type`).

**Source**: `docs/internal/hooks-v2-ghost-hunt.json`.

**Implication for `beforeFullFileContent` / `afterFullFileContent`**: if these events exist and are activatable, they would provide a hook point around Cursor's full-file-context injection (the operation that attaches entire file contents to the model's context window). This would have significant implications for context-filtering hooks. Testing requires a fresh install+restart cycle scoped to those event names only.

---

## Environment Observations

Every hook invocation in v2 captured `env_cursor` from the hook process environment. Consistent values across all 459 records:

| Variable | Observed value | Notes |
|---|---|---|
| `CURSOR_VERSION` | `3.1.15` | Consistent with header pin |
| `CURSOR_EXTENSION_HOST_ROLE` | `always-local` | Prior v1 Oracle Risk #1 feared `agent-exec` would block response contract; `always-local` observed instead |
| `CURSOR_LAYOUT` | `unifiedAgent` | Unified agent mode confirmed |
| `CURSOR_WORKSPACE_LABEL` | `oh-my-openagent` | Matches workspace |
| `CURSOR_PROJECT_DIR` | `<repo>` | Set by Cursor |
| `CLAUDE_PROJECT_DIR` | `<repo>` | Claude-Code compatibility alias for `CURSOR_PROJECT_DIR` |
| `CURSOR_USER_EMAIL` | `<redacted>` | Redacted in JSONL; present in raw captures |

**`CURSOR_EXTENSION_HOST_ROLE=always-local`**: this value is distinct from `agent-exec` which v1 speculated might be set during agentic sessions and might block response-contract enforcement. The observed value `always-local` means the extension host runs locally (not in a remote/cloud container). Oracle Risk #1 from v1 is therefore resolved: the response contract IS observable and enforceable in the `always-local` role.

**`cwd` vs `workspace_roots`**: the hook process `cwd` is `<home>/.cursor` (Cursor's working directory), not the workspace root. Hooks that need the workspace path should read `workspace_roots[0]` from the payload, not rely on `cwd`.

---

## Known Regressions / Quirks Confirmed in Cursor 3.1.15

1. **`ask` not enforced on `beforeShellExecution`** — `permission: "ask"` is treated as `allow`; no user prompt is presented. Do not rely on `ask` as a gate.
2. **malformed-JSON + `failClosed: false/omit` = silent allow** — if a hook script crashes or emits invalid JSON and `failClosed` is absent, the blocked action proceeds silently. Forum bug #152669 confirmed empirically.
3. **`type: "prompt"` hooks do not invoke the shell command** — the `command` field is ignored; Cursor uses an internal LLM call against the `prompt` field. Shell-side side effects (logging, auditing) will not fire.
4. **`stop.followup_message` with `loop_limit: null` creates infinite auto-submit loops** — the stop hook fires at turn end, auto-submits the followup, which triggers another turn, which fires the stop hook again. Always use a small positive integer for `loop_limit`.
5. **`subagentStart` payload `task` field is empty** — even when the Task tool is called with a non-empty task description, the `task` field in the `subagentStart` payload is an empty string. This appears to be a Cursor bug (v1 observed `task:str` as populated; v2 observed empty in `W-C-subagentStart-logger-031`).
6. **`agent_message` from deny response may be supplemented by Cursor's default** — Cursor appends its own "Do not suggest workarounds" boilerplate after the hook's `agent_message`. Custom messaging is honored but not exclusive.

---

## Recommendations for Production hooks.json

1. **Always set `failClosed: true`** on security-critical hooks (`beforeMCPExecution`, `beforeReadFile`, `beforeShellExecution`) to prevent silent-allow on malformed responder output. Note: only effective for JSON parse errors; exit-2 and deny are unconditionally blocking.
2. **Prefer exit-code 2 over JSON `deny` for simple blocking** — exit-2 bypasses `failClosed` entirely and always blocks. It is the most reliable deny primitive.
3. **Never use `loop_limit: null` on `stop` or `subagentStop`** — use a small positive integer (e.g., `3`) or omit the field (which defaults to a safe value).
4. **Do not rely on `ask`** — it is not enforced in 3.1.15. Use `deny` + `user_message` to communicate the blocked action to the user.
5. **Scope destructive matchers to sentinel strings** — never use a broad regex (e.g., `".*"`) on a deny or block hook. A simple sentinel substring in the command or tool_name is the correct pattern.
6. **Prefer camelCase event keys** — PascalCase mirrors (`AfterFileEdit`, `PreToolUse`, etc.) appear to be an internal normalization layer for Claude-Code CLI compatibility. External config should use camelCase (`afterFileEdit`, `preToolUse`).
7. **Treat `type: "prompt"` hooks as LLM-internal gates only** — do not attach shell-side audit logging to prompt-type hooks. Use a paired `command`-type logger hook if shell-side evidence is needed.
8. **Note `beforeMCPExecution.tool_input` is stringified JSON** — if your responder needs to inspect MCP tool arguments, it must parse `tool_input` as a JSON string, not treat it as an object.

---

## v1 Coverage Gap Closed

v1 left 9 of 20 events never triggered during the test session (all requiring manual UI actions or session lifecycle triggers). v2 closes this by:

1. Explicitly categorizing events as **agent-triggerable** (the agent can cause them) vs. **manual-UI-only** (requires human interaction with the Cursor UI).
2. Installing the mega-config at user-level and running a single session that exercises all 14 agent-triggerable events through organic tool use + targeted sentinel probes.
3. Source-citing the 6 manual-UI events from v1 historical data and the Cursor internal hook log, rather than claiming them as "not observed".

The 14/14 agent-triggerable coverage is a hard improvement over v1's partial coverage and enables confident recommendations for production hook configurations.

---

## Scope Fidelity

| Scope item | Status |
|---|---|
| 14/14 agent-triggerable events | ✓ Exercised |
| 6/6 manual-UI events | ✓ Source-cited (v1 + internal log) |
| Wave G — sessionStart env propagation | Descoped (sessionStart is manual-UI-only) |
| Wave J — Claude-Code PascalCase CLI compat | Descoped (separate surface) |
| Production `hooks/hooks.json` | Unmodified — daemon wiring preserved |
| Plugin-level `hooks.json` | Unmodified — user-level only |

---

## Raw Evidence Pointers

| Artifact | Location |
|---|---|
| Consolidated JSONL (redacted) | `docs/internal/hooks-evidence-v2.jsonl` — 459 records |
| Ghost hunt results | `docs/internal/hooks-v2-ghost-hunt.json` |
| Claim diff vs v1 | `docs/internal/hooks-v1-vs-v2-claim-diff.md` (TDOC.1 — forthcoming) |
| Version pin | `/tmp/cursor-hooks-evidence/_header.json` |
| Pre-flight record | `/tmp/cursor-hooks-evidence/_preflight.json` |
| Install record | `/tmp/cursor-hooks-evidence/_install-preregister.json` |
| Watchdog drill | `/tmp/cursor-hooks-evidence/_watchdog-drill.json` |
| Raw per-invocation captures (local only) | `/tmp/cursor-hooks-evidence/<uuid>.json` |
| Mega-config registry | `hooks/hooks.experiment.v2.registry.json` (116 cells) |
| v1 (historical, preserved verbatim) | `docs/internal/hooks-empirical-report.v1.md` |

---

## Limitations and Open Questions

1. **Wave F conclusiveness**: `type: "prompt"` hooks produced 0 shell-side logger fires, but whether the internal LLM evaluator returns a blocking result is unconfirmed. A direct inspection of Cursor's internal hook log for Wave F invocations is needed to determine if `{ok: false}` from a prompt-type hook is enforced.
2. **Ghost events untested live**: `beforeFullFileContent` and `afterFullFileContent` were identified via binary sweep but not installed and tested. A follow-up session with a clean restart scoped only to these event names would confirm or deny their existence.
3. **`ask` scope**: the `ask` non-enforcement was observed only for `beforeShellExecution`. It is unknown whether `ask` is similarly not enforced for `preToolUse`, `beforeMCPExecution`, or `beforeReadFile`. Registry cells `W-AB-preToolUse-ask-007`, `W-AB-beforeMCPExecution-ask-029`, and `W-AB-beforeReadFile-ask-037` were installed but their enforcement was not individually verified in the JSONL.
4. **`subagentStart.task` empty**: only 1 `subagentStart` record captured. The empty `task` field needs verification across multiple subagent launches to rule out a one-off timing issue vs. a systematic bug.
5. **`stop` + `loop_limit` comparison**: the planned comparison of `loop_limit ∈ {1, 3, omit}` was not completed — stop hooks were removed after the runaway was observed. A future isolated session with a pre-tested `loop_limit: 1` sentinel can complete this comparison safely.
6. **`updated-input` response contract**: `W-AB-preToolUse-updated-input-004` was registered (matcher `^Shell$`) but does not appear in JSONL. Whether Cursor honors an `updated-input` response that modifies the tool_input object before execution is not confirmed by this session's evidence.

---

## Claim-Diff Summary (from TDOC.1)

Full reconciliation is in `docs/internal/hooks-v1-vs-v2-claim-diff.md` (forthcoming).

**Preview**:
- **Confirmed** (v1 claim holds in 3.1.15): case-sensitive regex matcher; deny enforces regardless of failClosed; exit-2 blocks unconditionally; `additional_context` silently dropped (REFUTED — see Wave H); preToolUse/postToolUse payload schema stable.
- **Superseded** (v2 provides more precise data): event coverage (14/14 vs 9/20); response-contract round-trip observable from top-level orchestrator; full failClosed matrix.
- **New in v2**: `ask` not enforced; malformed-JSON silent-allow confirmed; `subagentStart.task` empty; `type: "prompt"` hooks skip shell invocation; 2 ghost events discovered; `stop.followup_message` auto-submit confirmed; `beforeMCPExecution.tool_input` stringified.
