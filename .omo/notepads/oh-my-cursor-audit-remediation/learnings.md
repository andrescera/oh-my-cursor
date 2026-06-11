# Learnings — oh-my-cursor-audit-remediation

## [2026-06-11] Session Start

### Key Conventions
- Test command: `cd hooks && bun test`
- Type check: `cd hooks && npx tsc --noEmit` (pre-existing daemon/dashboard errors are non-blocking)
- QA ports: use isolated ports (28847-28860 range for tests, NEVER 27847/27848 live)
- QA state dirs: use `/tmp/omc-qa-{N}` isolated dirs
- Atomic writes: use `hooks/lib/atomic-file.ts` (Task 1) for all state files
- Evidence: save to `.omo/evidence/task-{N}-{slug}.{ext}`
- Preserved behaviors: Write-over-CreatePlan + explicit-todos (DO NOT TOUCH)
- Bun is single-threaded: only async-interleaving, cross-process, crash-loss hazards are real
- Tests AFTER implementation (user's explicit choice)
- One commit per task, conventional commits format

### Architecture Notes
- Hooks daemon: `hooks/daemon.ts` (port 27847)
- Handler files: `hooks/handlers/` — event logic split by concern
- Context injection: `hooks/context-collector.ts` — budget-aware, priority-ordered
- Config: `hooks/schemas/config.ts` (Zod). Defaults in `config.default.jsonc`
- State persistence: `hooks/state-persistence.ts`
- Port manager: `hooks/port-manager.ts`
- Event logger: `hooks/event-logger.ts`

### Task 7 — flush on shutdown / buffer-trim
- Buffer-trim "race" (logEvent: push then `buffer = buffer.slice(-TRIM_TO)`) is a FALSE POSITIVE: single synchronous block, no await between push and trim, Bun single-threaded → no interleaving. No mutex added.
- REAL hazards fixed: (a) pending events lost when process exits before the 500ms debounce fires — gracefulShutdown now `await flushNow()` + `process.on("beforeExit")` backstop; (b) unawaited flush errors — scheduled flush try/catch+log, flushNow logs+rethrows, flushPending restores `pending` on failure so entries retry instead of dropping.
- `flushNow(): Promise<void>` is the awaitable shutdown/exit path; `flushEventLog()` (sync) retained for the uncaughtException crash path. Debounce kept for steady-state hot path.
- QA: isolated daemon HOME=/tmp/omc-qa-7 + OH_MY_CURSOR_PORT=28850 (env-port branch skips killPortSquatter). 5 POST /preToolUse then immediate /shutdown → 5/5 events in log. Evidence: .omo/evidence/task-7-*.txt

### Task 8 — context duplication fix (single channel + consume + rehydration clear)

**Fix A (single channel):** `/beforeSubmitPrompt` previously returned the SAME advisory text in THREE places: `user_message` (`userMessage + "\n\n" + trimmed` — embedded into the user's literal prompt), `additional_context`, and `hookSpecificOutput.additionalContext`. The real duplication bug is `user_message` — it both duplicated the payload AND mutated the user's actual message. Dropped `user_message`; kept `additional_context` + its `hookSpecificOutput` mirror (Cursor reads `additional_context`; the Claude-Code `UserPromptSubmit` mirror is the same logical channel — same pattern as /sessionStart and /postToolUse). Doc basis: `docs/cursor/03-hooks.md` §17 (input=`prompt`, enforced output N/A) + `docs/internal/hook-response-fields.md` line 64 (`additional_context` delivery field) mirroring `postToolUse.additional_context` (TAKES-EFFECT, line 37).

**Fix B (consume):** wired `contextCollector.consume(convId)` at the TOP of `/beforeSubmitPrompt` (before building additionalContext); prepend `pending.merged` to the single channel. Catches context registered on observe-only events (/subagentStop) or /preToolUse non-deny paths that no /postToolUse drained before the turn ended. consume() clears, so it cannot repeat.

**Fix C (rehydration clear):** `shared.ts getOrCreateConversation` rehydration branch (`loadOne` success) now calls `contextCollector.clear(conversationId)` — drops in-memory advisories from a prior daemon lifecycle so a rehydrated conversation starts clean. API used: existing `clear(id)` (no `clearConversation` exists). No import cycle (context-collector imports nothing).

**Daemon dispatch:** handler maps merged via object spread in daemon.ts:326-331; only `createContinuationHandlers` owns `/beforeSubmitPrompt` → Fix B is the sole consume on that event (no double-consume). Smaller `/postToolUse` handlers (agent-usage-reminder, bash-file-read-guard, directory-readme-injector, hashline-read-enhancer) run as "ported" handlers INSIDE tool-guard's postToolUse and are drained by its consume() at line 619. Daemon returns the handler object verbatim (`JSON.stringify(result)`, line 848) — no field is required, so dropping `user_message` is safe.

**Register-site audit (28 sites) — ALL one-shot.** No site is "persistent". The collector is uniformly a one-shot delivery channel: register-on-trigger → delivered on next consume() → cleared. Truly persistent context (persona/identity) is NOT in the collector — it's hardcoded inline in `/beforeSubmitPrompt`'s static base block and re-registered+consumed each `/preCompact`. THAT static persona base was what the old `user_message`+`additional_context` dual-return duplicated.

| # | Site | source id | Event | Trigger | Consumed by | Class |
|---|------|-----------|-------|---------|-------------|-------|
| 1 | agent-usage-reminder.ts:68 | agent-usage-reminder | postToolUse | agent mode + ≥3 searches w/o Task (cap 3 firings) | next postToolUse | one-shot (capped) |
| 2 | bash-file-read-guard.ts:35 | bash-file-read-guard | postToolUse | `cat/head/tail` detected | same postToolUse cycle (tool-guard) | one-shot |
| 3 | conversation-handlers.ts:184 | compaction-context-injector | preCompact | compaction.prompt_enabled | same handler (line 231) | one-shot |
| 4 | conversation-handlers.ts:191 | persona-enforcement | preCompact | compaction.prompt_enabled | same handler | one-shot |
| 5 | conversation-handlers.ts:216 | conversation-snapshot | preCompact | compaction.prompt_enabled | same handler | one-shot |
| 6 | conversation-handlers.ts:223 | compaction-todo-preserver | preCompact | compaction.prompt_enabled | same handler | one-shot |
| 7 | directory-readme-injector.ts:87 | directory-readme-injector | postToolUse(Read) | README.md found, not deduped | next postToolUse | one-shot, dedup-guarded (once/dir/session via injectedPaths) |
| 8 | hashline-read-enhancer.ts:42 | hashline-read-enhancer | postToolUse(Read) | hashline_edit config on | same postToolUse cycle | one-shot |
| 9 | prometheus-md-only.ts:59 | prometheus-md-only | preToolUse(Write/StrReplace) | Prometheus writing md/plans | next consume (non-deny path) | one-shot |
| 10 | rules-injector.ts:224 | rules-injector | postToolUse(Read) | matching rule, not deduped | next postToolUse | one-shot, dedup-guarded (once/rule/session) |
| 11 | sisyphus-junior-notepad.ts:48 | sisyphus-junior-notepad | preToolUse(Task) | notepad agent + activePlan | next consume (non-deny path) | one-shot |
| 12 | subagent-handlers.ts:229 | unstable-agent-babysitter (unstable-agent) | subagentStop | failureCount≥3 | next consume — observe-only, now caught by Fix B at next prompt | one-shot |
| 13 | subagent-handlers.ts:268 | unstable-agent-babysitter (fast-failure) | subagentStop | fast (<2s) failure + error | next consume — observe-only, caught by Fix B | one-shot |
| 14 | tool-guard-handlers.ts:182 | plan-write-guard | preToolUse(Write) | plan-mode write outside plans/ | same handler (deny, line 188) | one-shot |
| 15 | tool-guard-handlers.ts:212 | read-before-write | preToolUse(Write) | write w/o prior read | next postToolUse (non-deny path) | one-shot |
| 16 | tool-guard-handlers.ts:261 | ask-task-guard | preToolUse(Task) | Task in ask mode | same handler (deny, line 267) | one-shot |
| 17 | tool-guard-handlers.ts:284 | plan-agent-guard | preToolUse(Task) | disallowed agent in plan mode | same handler (deny, line 290) | one-shot |
| 18 | tool-guard-handlers.ts:391 | conversation-activity | postToolUse | every 10th tool call | same handler (line 619) | one-shot |
| 19 | tool-guard-handlers.ts:401 | edit-error-recovery | postToolUse | edit failed output | same handler | one-shot |
| 20 | tool-guard-handlers.ts:420 | json-error-recovery | postToolUse | JSON parse error | same handler | one-shot |
| 21 | tool-guard-handlers.ts:463 | directory-context | postToolUse(Read) | AGENTS.md found, not deduped | same handler | one-shot, dedup-guarded (once/AGENTS.md/session) |
| 22 | tool-guard-handlers.ts:533 | skill-reminder | postToolUse | toolCallCount≥3 + !reminderInjected | same handler | one-shot (re-armed every SKILL_REMINDER_INTERVAL) |
| 23 | tool-guard-handlers.ts:555 | context-window-monitor | postToolUse | cw warning | same handler | one-shot |
| 24 | tool-guard-handlers.ts:566 | comment-checker | postToolUse | narration comments | same handler | one-shot |
| 25 | tool-guard-handlers.ts:579 | tool-output-truncator | postToolUse | output truncated | same handler | one-shot |
| 26 | tool-guard-handlers.ts:596 | delegate-task-retry | postToolUse(Task) | retry advice present | same handler | one-shot |
| 27 | tool-guard-handlers.ts:663 | conversation-recovery | postToolUseFailure | error guidance matched | same handler (line 671) | one-shot |
| 28 | webfetch-redirect-guard.ts:83 | webfetch-redirect-guard | postToolUse(WebFetch) | redirect/empty-response output | same postToolUse cycle | one-shot |

**Tests:** 49/49 continuation-handlers.test.ts (46 existing + 3 new: single-channel, no-repeat, rehydration-clean) + 4/4 daemon beforeSubmitPrompt. Evidence: .omo/evidence/task-8-{single-channel.json,no-repeat-error.json,rehydration.txt}.

**Cross-task contamination (working tree, NOT mine):** Task 9 (continuationStoppedAt tombstone + clearContinuationDurably/forceFlush in /stop) modifies types.ts + state-persistence.ts + (working-tree) /stop region; pre-existing tsc error `shared.ts:47 continuationStoppedAt missing from created literal` is Task 9's, non-blocking, NOT in my committed files. WARNING for future tasks: a partial setPersistence stub (missing forceFlush) in a unit test breaks Task 9's /stop tests via cross-test leak — use an inert Proxy `new Proxy({},{get:()=>()=>undefined})` to restore global persistence.
