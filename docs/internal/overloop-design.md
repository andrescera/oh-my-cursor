# Overloop Design — Cursor Port

_Generated: 2026-04-17_

**See also:**
- [hook-response-fields.md](./hook-response-fields.md) — confirmed primitives and their evidence
- [experiments-methodology.md](./experiments-methodology.md) — how to add experiment cells to unlock more ports
- [hooks-v1-vs-v2-claim-diff.md](./hooks-v1-vs-v2-claim-diff.md) — evidence base for field status claims
- [gap-vs-original.md](./gap-vs-original.md) — full hook portability analysis (Surface S5)

---

## Original architecture (`oh-my-openagent-original`)

The reference implementation (`../oh-my-openagent-original/src/hooks/ralph-loop/`) is a Bun/TypeScript OpenCode plugin running a stateful session-scoped loop:

| Component | Implementation |
|---|---|
| Loop trigger | `session.idle` event fires when the OpenCode session goes quiet |
| Loop iteration | `session.promptAsync()` — SDK call that injects a new user prompt into the live session |
| Transcript access | `session.messages` — SDK-level message list; supports full history scan for DONE detection |
| Todo tracking | `session.todo` — SDK-level todo list read at each iteration |
| Persistent state | `.sisyphus/ralph-loop.local.md` — per-workspace Markdown file written on each iteration |
| Completion check | Scans `session.messages` for `<promise>DONE</promise>` in the assistant's last response |
| Session reset | `session.fork()` / SDK reset strategy to clear runaway context |
| Oracle verification | Dispatches a verification sub-prompt via `session.promptAsync()`; parses reply for `<verified>YES|NO</verified>` |

The ULW (Ultrawork) loop is built on the same primitives with an Oracle verification cycle added after each major iteration.

---

## Cursor constraints

Cursor's `hooks.json` surface exposes **21 canonical events** (18 wired in this plugin at 3.6.21; `workspaceOpen` is observe-only and not wired). <!-- last-verified: 3.6.21 --> The SDK layer is unavailable:

| Constraint | Impact |
|---|---|
| No `session.idle` event | Cannot detect quiet sessions directly; must approximate via `stop` |
| No `session.promptAsync` | Cannot inject prompts from TypeScript; must use `stop.followup_message` |
| No `session.messages` | No direct transcript scan; must infer from `afterAgentResponse` payload (UNCONFIRMED format) or `agent_transcript_path` from `subagentStop` |
| No `session.todo` | No SDK todo read; approximate via `postToolUse` capture on TodoWrite tool calls |
| No `session.fork` / reset | Cannot reset session context; must rely on Cursor's native compaction |
| No `chat.message` mutation | Think-mode, model-fallback, keyword-detector, etc. cannot port |
| No `chat.params` | Anthropic effort injection cannot port |
| `session_id` isolation risk | `resolveConversationId` may fall back to a generated UUID when session_id is absent (see Session isolation section) |

---

## Confirmed primitives

All fields below are `TAKES-EFFECT` per v2 evidence. See [hook-response-fields.md](./hook-response-fields.md) for full evidence citations.

| Primitive | Evidence | Use in overloop |
|---|---|---|
| `stop.followup_message` | W-EK-stop-followup-message-001..004; N5 | Loop iteration: re-prompts the agent after each stop |
| `postToolUse.additional_context` | W-H-postToolUse-additional-context-001; Claim 43; N4 | Context injection: rules, reminders, oracle critiques |
| `postToolUse` payload `tool_output` / `tool_use_id` | Claim 36 | ULW: correlate preToolUse / postToolUse on Task calls |
| `preToolUse` payload `tool_use_id` | Claim 35 | ULW: capture pending verification tool_use_id |
| `beforeShellExecution.permission: "deny"` | W-D-beforeShellExecution-deny-005; Claim 32 | Safety: block shell in restricted modes |
| `beforeShellExecution` exit code 2 | W-D-beforeShellExecution-exit-2-010, 011; N3 | Unconditional block regardless of failClosed |
| `CURSOR_EXTENSION_HOST_ROLE` env var | Claim 44; N9 | Role-aware hook logic (`always-local` vs `agent-exec`) |

---

## Ralph loop port

### State schema

```typescript
interface RalphState {
  active: boolean
  iteration: number          // current iteration count (0-based)
  maxIterations: number      // 0 = unlimited (requires explicit opt-in)
  startedAt: string          // ISO 8601
  lastProcessedIndex: number // offset into assistantHistory for DONE scan
}
```

Stored on `ConversationState.ralphState`, keyed by `session_id` (via `resolveConversationId`). Persisted via `state-persistence.ts`.

### Iteration mechanism

The `/stop` handler in `hooks/handlers/continuation-handlers.ts` drives the loop:

1. On `stop` event: if `ralphState.active`, increment `iteration`, check DONE.
2. If not DONE and within `maxIterations`: return `{ followup_message: "Continue working. Iteration N/M. When fully done, output <promise>DONE</promise>." }`.
3. If DONE or `maxIterations` exceeded: set `ralphState = null`, return `{}`.

**DONE detection:** exact match on `<promise>DONE</promise>` in the agent's output. The `|| includes("DONE")` fallback (currently in the codebase) is a latent false-positive and must be removed per the decisions ledger (`.cursor/notepads/hooks-realism-overloop/decisions.md`).

**loop_limit:** set to `null` in `.cursor/hooks.json` to allow multi-iteration. `stop_hook_loop_limit` is DEPRECATED (warns-and-ignores). See Claim 45.

**maxIterations default:** 100. `null` / 0 = unlimited (requires explicit opt-in to avoid runaway).

### DONE detection via assistantHistory (Wave 3 — gated on E1)

Full DONE detection requires scanning the agent's assistant-turn text. The path:

1. `afterAgentResponse` fires with `always-local` role (1 v2 record, Claim 12 supersession).
2. Payload format of `afterAgentResponse` is unconfirmed (E5 experiment not run).
3. Until E5 confirms the payload format, DONE detection falls back to `ConversationState.contextHistory` (coarse string scan).

`lastProcessedIndex` tracks the offset into `assistantHistory` to avoid re-scanning previous turns. Cap: 50 entries OR 100 KB, trimming oldest (per decisions ledger).

---

## ULW (Ultrawork) port

### Design rationale

`subagentStop.followup_message` would be the natural anchor for ULW verification but is `UNCONFIRMED` in v2 (no dedicated probe). Oracle recommended an alternative that uses only confirmed primitives.

### Mechanism: `postToolUse(Task) + tool_use_id` correlation

```
preToolUse(task_name=Task)
  → capture payload.tool_use_id into ulwState.pendingVerificationToolUseId

postToolUse(tool_use_id matches pendingVerificationToolUseId)
  → parse payload.tool_output[-500:] for <verified>YES|NO</verified>
  → token MUST appear in last 200 chars to survive tool_response truncation
```

Oracle's verification prompt is injected as `postToolUse.additional_context` on a sentinel Task call (dispatch `subagent_type="oracle"` with a verification payload). When the matching `postToolUse` arrives:

- `<verified>YES</verified>` → trigger completion via next `stop.followup_message = ""` (no-op, let agent stop naturally)
- `<verified>NO</verified>` → inject Oracle critique slice via `stop.followup_message` and continue the loop

### Plan mode hard-block

ULW is blocked when `composerMode === "plan"`. This mirrors the existing `[mode:ultrawork-filtered]` pattern in `continuation-handlers.ts:291-298`. The `beforeSubmitPrompt` handler injects this tag; the `/stop` handler checks `composerMode` before emitting `followup_message`.

### State schema

```typescript
interface UlwState {
  active: boolean
  pendingVerificationToolUseId: string | null
  iteration: number
  maxIterations: number  // default 100; null = unlimited (explicit opt-in)
}
```

---

## Session isolation

### Current `resolveConversationId` behavior

1. **Primary**: use `payload.session_id` if present.
2. **Secondary**: look up `agentId` in a cross-session map (planned for T9).
3. **Fallback**: generate a random UUID — risks state loss across agent restarts.

The fallback UUID means that if a `stop` event arrives without a `session_id` (observed in some always-local invocations), the ralph or ULW state is stored under an ephemeral key and lost on the next invocation.

### Tiered fix (T9)

Per the decisions ledger: primary `session_id` → secondary `agentId` map → drop unresolvable (no fallback UUID). Not a compound key. This prevents ghost state accumulation.

### Cross-role consideration

`CURSOR_EXTENSION_HOST_ROLE` can be `always-local` (UI/composer orchestrator) or `agent-exec` (tool execution subprocess) — N9. The `stop` event fires from `always-local`; `preToolUse`/`postToolUse` fire from both roles. Hook logic that reads `session_id` must account for the fact that the same logical session may produce invocations from both roles with consistent `session_id` values.

---

## Unbridgeable limitations

Each item below has no path to a Cursor hook implementation.

| Original feature | Why unbridgeable |
|---|---|
| `session.fork` / reset strategy | OpenCode SDK; no Cursor hook exposes session forking or reset |
| `session.promptAsync` | OpenCode SDK; Cursor approximates via `stop.followup_message` (confirmed) but cannot inject at arbitrary points |
| `session.messages` transcript scan | OpenCode SDK; partial approximation via `agent_transcript_path` in `subagentStop` payload IF E5 confirms format |
| `session.todo` | OpenCode SDK; approximated via `postToolUse` capture on TodoWrite, but lacks full SDK read semantics |
| `chat.message` mutation | OpenCode event not in Cursor's 21-event surface; blocks think-mode, model-fallback, keyword-detector, no-sisyphus-gpt, no-hephaestus-non-gpt <!-- last-verified: 3.6.21 --> |
| `experimental.chat.messages.transform` | OpenCode event; tool-pair-validator cannot port |
| `chat.params` | OpenCode event; anthropic-effort injection (thinking.budget_tokens) cannot port |
| `tool.definition` | OpenCode event; todo-description-override cannot port |

---

## Future work

To unlock additional ports, the following experiment cells should be added (see [experiments-methodology.md](./experiments-methodology.md)):

| Experiment target | What it unlocks |
|---|---|
| `afterAgentResponse` payload format (E5) | Ralph DONE detection via `assistantHistory`; transcript-based features |
| `subagentStop.followup_message` probe | ULW alternative anchor; removes dependency on `tool_use_id` correlation |
| `subagentStop.agent_transcript_path` format | Transcript-based features (session.messages approximation) |
| `preToolUse.permission: "deny"` live probe | `prometheus-md-only`, `write-existing-file-guard`, `tasks-todowrite-disabler` ports |
| `preToolUse.updated_input` probe | `question-label-truncator`, `non-interactive-env`, `webfetch-redirect-guard` ports |
| `sessionStart.env` fresh-session probe | `session-recovery` port; env injection for startup context |
| `beforeMCPExecution.permission` probe | MCP-level guards |

Each new confirmed `TAKES-EFFECT` field should be recorded in [hook-response-fields.md](./hook-response-fields.md) and the relevant row in [hooks-v1-vs-v2-claim-diff.md](./hooks-v1-vs-v2-claim-diff.md) updated accordingly.
