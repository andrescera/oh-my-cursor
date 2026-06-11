# oh-my-cursor Audit Remediation

## TL;DR

> **Quick Summary**: Audit-driven remediation of the oh-my-cursor package: eliminate the confirmed root causes of duplicated context injection, daemon instability, and branch/worktree state corruption; fix hook-contract violations, security holes, installer divergences, contradictory agent instructions, and the token-burning sidecar test-string leak — while preserving two intentional behaviors (Write-tool-over-CreatePlan and explicit todos).
>
> **Deliverables**:
> - Context injected exactly once per channel (dual `user_message`+`additional_context` return removed; `consume()` wired into `/beforeSubmitPrompt`)
> - Single-daemon guarantee (per-project startup lock, PID-race-free, bind-then-signal upgrade)
> - Zombie `activePlan`/boulder loop fixed atomically (clear writes through to disk)
> - Atomic file writes (temp+rename) everywhere state crosses process boundaries
> - Hook responses aligned to Cursor's documented contract (verified per-event, no blind rename)
> - Localhost token auth + CORS removal + 0600 file perms + gated `interactive_bash`
> - Installer parity (Windows config seeding, test-file exclusion — 71 `*.test.ts` no longer ship)
> - Contradiction-free agent prompts (atlas auto-continue scoping) + drift-guard test locking rule surfaces
> - Regression tests for every fix + new tests for conversation/safety handlers
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves + final verification wave
> **Critical Path**: 3 → 8 → 14 → 20 → 22 → F1-F4 → user okay

---

## Context

### Original Request
User wants a deep audit of oh-my-cursor (their package extending Cursor), then fixes for: race conditions, "branch stuff" issues, contradictory/unexpected behavior degrading delivered quality, and pattern adherence — with latitude for the planner's own findings. During the session, spurious `echo test-from-mcp-sidecar` messages were injected into the live conversation as phantom user turns (token burn); user flagged this as a defect to fix.

### Interview Summary
**Key Discussions**:
- Symptoms confirmed: hooks firing twice / duplicated context; daemon instability (port conflicts, stale daemons); state issues when switching branches; plus "not sure — audit-driven"
- Preserved behaviors (DO NOT FIX): (1) Write-tool-over-CreatePlan plan creation; (2) the explicit todos behavior
- Test strategy: tests AFTER implementation (user's explicit choice, overriding repo AGENTS.md TDD note). Agent-executed QA mandatory per task.

**Research Findings** (10 parallel audits):
1. **Race conditions** (19 findings, zero locking): conversations Map races, agent-history RMW clobbering, event-logger buffer/flush loss, multi-daemon startup race, PID check-kill race, fire-and-forget state writes. *Caveat applied*: Bun is single-threaded — only async-interleaving, cross-process, crash-loss, and awaited-TOCTOU hazards are real; each fix task verifies the hazard first.
2. **Branch/worktree** (7 bugs): zombie `activePlan` (DURABLE, resurrects continuation loop after restart), idle deactivation not persisted, `activePlan`/`boulderState` partition mismatch, `worktree_path` documented but unimplemented, notepad path unvalidated, state keyed by convId only, `worktrees.json` dead code.
3. **Contradictions**: atlas.md auto-continue (line 239 vs 246-252/472); Momus phrasing drift. Write-over-CreatePlan confirmed consistent across 5+ surfaces — PRESERVED.
4. **Code quality**: `BackgroundTracker` TS2304 (conversation-handlers.ts:42); missing tests (conversation-handlers, safety-handlers); 3 swallowed-error sites; stale dist/.
5. **Sidecar echo**: string exists ONLY in hooks/mcp-sidecar.test.ts:206; production execution path unconfirmed — and installers ship 71 `*.test.ts` files (plausible leak vector).
6. **Context duplication ROOT CAUSES**: continuation-handlers.ts:441-451 returns the SAME content in `user_message` AND `additional_context`; `/beforeSubmitPrompt` never calls `contextCollector.consume()` (28 register sites vs 5 consume sites); rehydration doesn't clear the collector.
7. **Security**: no endpoint auth; CORS `*`; unauthenticated `interactive_bash` (RCE surface); world-readable state/logs; weak shell blocklist with unlogged blocks. Both servers bind localhost (good baseline).
8. **Install/distribution**: install.ps1 missing config seeding; test files shipped; hardcoded mcp.json port; non-fatal daemon-start failure → version skew.
9. **Hook contract**: `permission: "deny"` vs documented `decision` field (verify per-event before changing — known explorer false positives exist); sync I/O in 50ms-budget paths; prompt-type hook registered but unexecuted; retry-on-500 semantics unknown.
10. **Prompt/docs**: nonexistent `best-of-n-runner` agent reference; stale `../oh-my-openagent-original/` refs; README/03-hooks.md count drift; dev-browser vs playwright ambiguity. (context7 "broken ref" is a probable false positive — mcp.json registers it; verify.)

### Metis Review
**Identified Gaps** (addressed):
- "explicit todos" preserved behavior had no location anchor → Task 3 finds and records exact surfaces BEFORE any handler/rule edits
- Zombie activePlan + boulder auto-restart must be ONE atomic fix with write-through flush → Task 9
- `consume()` could starve multi-prompt context → Task 8 audits all 28 register sites first
- `Bun.write` is not atomic on Linux → Task 1 utility used in BOTH persistence paths
- Daemon lock must be per-project (path hash) with bind-then-signal upgrade ordering → Task 6
- BackgroundTracker error might be type-only (tests pass) → Task 2 verifies with tsc first
- Scope hard limits set (see Must NOT Have)
- Defaults applied & disclosed: security = localhost shared-secret token; state migration = empty-projectRoot grace path (self-migrating); dist/ = stays gitignored, build-on-install with clean-before-build

---

## Work Objectives

### Core Objective
Make oh-my-cursor deliver context exactly once, run exactly one daemon, never resurrect stopped plans, honor Cursor's hook contract, not ship test files or security holes, and give agents contradiction-free instructions — verified by regression tests and agent-executed QA, without touching the two preserved behaviors.

### Concrete Deliverables
- `hooks/lib/atomic-file.ts` (temp+rename utility) wired into state-persistence, port-manager, agent-history-store
- Fixed `hooks/handlers/continuation-handlers.ts` (no dual-channel context return; consume() wired; zombie activePlan+boulder atomic clear)
- Per-project daemon singleton lock in `hooks/daemon.ts` / `hooks/process-guard.ts`
- Isolated `hooks/mcp-sidecar.test.ts` harness + installers excluding `*.test.ts`
- Contract-aligned handler responses (per-event verified)
- Hardened daemon (token auth, no CORS `*`, 0600 perms, gated interactive_bash, logged blocks)
- install.ps1 config-seeding parity; mcp.json port templating; fatal fresh-install daemon failure
- Fixed agents/atlas.md, commands/best-of-n.md, README.md, docs/cursor/03-hooks.md, stale refs
- `hooks/drift-guard.test.ts` locking rule-surface consistency
- New tests: conversation-handlers.test.ts, safety-handlers.test.ts + regression tests per fix
- `docs/internal/preserved-behaviors.md` anchor inventory

### Definition of Done
- [ ] `cd hooks && bun test` → 0 failures (baseline 52+ recorded in Task 22, grown by new tests)
- [ ] `cd hooks && npx tsc --noEmit` → no NEW errors vs baseline; conversation-handlers.ts TS2304 gone
- [ ] AC probes for context single-delivery, daemon singleton, zombie clear, test-file exclusion all pass (per-task QA evidence in `.omo/evidence/`)
- [ ] Preserved-behavior anchors verified unchanged (Task 3 inventory re-checked in F1)

### Must Have
- Context delivered exactly once per channel (AC: `user_message` does not contain `additional_context`)
- Second daemon start exits cleanly while first keeps serving
- `/stop-continuation` clears `activePlan` AND `boulderState` in memory AND on disk (survives restart)
- Zero `*.test.ts` files in installed plugin output
- All file writes that cross process boundaries use temp+rename
- Every deny/block response field verified against `docs/cursor/03-hooks.md` before any change
- Preserved behaviors untouched: Write-tool-over-CreatePlan (all 5+ surfaces) and explicit-todos enforcement

### Must NOT Have (Guardrails)
- NO weakening/removal of Write-over-CreatePlan enforcement (rules/prometheus-plan-brief.mdc, rules/agent-tool-restrictions.mdc:40,67, commands/plan.md:186-187, commands/start-work.md:17-19, docs/cursor/19-known-sharp-edges.md)
- NO changes to explicit-todos enforcement surfaces (inventoried by Task 3)
- NO blanket mutex/lock abstractions for synchronous-only code paths (single-threaded Bun; verify hazard first)
- NO global search-replace of `permission` → `decision` (per-line verification only)
- NO auth redesign beyond localhost shared-secret token; NO OAuth, NO per-tool authorization framework, NO rate limiting
- NO dashboard-ui source changes; NO dashboard rebuild beyond installer's existing build step
- NO shell-blocklist expansion (only: log blocks + document known bypasses)
- NO worktree feature implementation (docs-to-reality alignment only)
- NO new test frameworks/runners (existing `bun test` only)
- NO TDD retrofit of unmodified handlers
- Known follow-ups EXPLICITLY out of scope (note, don't fix): contextHistory unbounded growth; orphaned fallback-UUID state accumulation; multi-window same-conversation isolation

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (`bun test`, 52+ passing tests, co-located `*.test.ts`)
- **Automated tests**: Tests AFTER implementation (user's choice). Every fix task ends with regression tests in the same task.
- **Framework**: bun test (existing). Type check: `cd hooks && npx tsc --noEmit` (pre-existing daemon/dashboard errors are non-blocking per AGENTS.md; record baseline before Wave 1).

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.
- **Daemon/HTTP**: Bash (curl) against a daemon started on a TEST port (`OH_MY_CURSOR_PORT=28847 OH_MY_CURSOR_MCP_PORT=28848`) — never against the live 27847/27848
- **CLI/process**: Bash / interactive_bash (tmux) for daemon lifecycle scenarios
- **Files/state**: Bash (ls, jq, stat) for permissions, atomicity, persistence assertions
- **Prompt surfaces**: Grep assertions on rule/agent/command files
- **CRITICAL SAFETY RULE**: QA must not kill or corrupt the live daemon serving the user's session. Use isolated ports, isolated state dirs (`OH_MY_CURSOR_PROJECT_DIR=/tmp/omc-qa-*`), and clean up spawned processes.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — foundations, 7 tasks):
├── 1: atomic-file utility + tests [quick]
├── 2: BackgroundTracker TS2304 verify+fix [quick]
├── 3: Preserved-behavior anchor inventory [quick]
├── 4: atlas.md auto-continue scoping + Momus phrasing [writing]
├── 5: Sidecar echo reproduce + test-harness isolation [deep]
├── 6: Daemon singleton lock + PID race fix [deep]
└── 7: Event-logger flush/shutdown hardening [unspecified-high]

Wave 2 (After Wave 1 — state & context correctness, 6 tasks):
├── 8: Context duplication CRITICAL #1+#2 (depends: 3) [deep]
├── 9: Zombie activePlan + boulder auto-restart atomic fix (depends: 1, 3) [deep]
├── 10: State-persistence atomicity + composite key (depends: 1) [deep]
├── 11: Agent-history-store RMW verify+fix (depends: 1) [unspecified-high]
├── 12: TOCTOU caches + port-manager atomic writes (depends: 1) [unspecified-low]
└── 13: Context-collector determinism + iteration-safety batch (depends: 3) [unspecified-high]

Wave 3 (After Wave 2 — contract, security, install, surfaces, 6 tasks):
├── 14: Hook contract per-event verify+align (depends: 8) [deep]
├── 15: Security hardening (depends: 6) [deep]
├── 16: Installer parity + test-file exclusion + port templating (depends: 5) [unspecified-high]
├── 17: Prompt-surface reference fixes (depends: 3) [unspecified-low]
├── 18: Worktree docs-to-reality + notepad path validation (depends: 9, 10) [unspecified-high]
└── 19: Docs drift + swallowed-error logging (depends: none in wave) [quick]

Wave 4 (After Wave 3 — test coverage & locks, 3 tasks):
├── 20: conversation-handlers + safety-handlers test files (depends: 8, 13, 14, 15) [unspecified-high]
├── 21: drift-guard.test.ts rule-surface lock (depends: 4, 17) [unspecified-high]
└── 22: Full-suite verification + CHANGELOG entry (depends: 20, 21) [quick]

Wave FINAL (After ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: 3 → 8 → 14 → 20 → 22 → F1-F4 → user okay
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

- **1** (atomic-file): — → blocks 9, 10, 11, 12
- **2** (TS2304): — → blocks none
- **3** (anchors): — → blocks 8, 9, 13, 17
- **4** (atlas): — → blocks 21
- **5** (sidecar echo): — → blocks 16
- **6** (singleton): — → blocks 15
- **7** (event-logger): — → blocks none
- **8** (context dup): 3 → blocks 14, 20
- **9** (zombie): 1, 3 → blocks 18
- **10** (state-persistence): 1 → blocks 18
- **11** (agent-history): 1 → blocks none
- **12** (TOCTOU): 1 → blocks none
- **13** (collector): 3 → blocks 20
- **14** (contract): 8 → blocks 20
- **15** (security): 6 → blocks 20
- **16** (installers): 5 → blocks none
- **17** (prompt refs): 3 → blocks 21
- **18** (worktree docs): 9, 10 → blocks none
- **19** (docs drift): — → blocks none
- **20** (handler tests): 8, 13, 14, 15 → blocks 22
- **21** (drift-guard): 4, 17 → blocks 22
- **22** (full verify): 20, 21 → blocks F1-F4

### Agent Dispatch Summary

- **Wave 1**: **7** — 1→`quick`, 2→`quick`, 3→`quick`, 4→`writing`, 5→`deep`, 6→`deep`, 7→`unspecified-high`
- **Wave 2**: **6** — 8→`deep`, 9→`deep`, 10→`deep`, 11→`unspecified-high`, 12→`unspecified-low`, 13→`unspecified-high`
- **Wave 3**: **6** — 14→`deep`, 15→`deep`, 16→`unspecified-high`, 17→`unspecified-low`, 18→`unspecified-high`, 19→`quick`
- **Wave 4**: **3** — 20→`unspecified-high`, 21→`unspecified-high`, 22→`quick`
- **FINAL**: **4** — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. Create atomic file-write utility (temp+rename)

  **What to do**:
  - Create `hooks/lib/atomic-file.ts` exporting `writeFileAtomic(path: string, data: string, opts?: { mode?: number })`: write to `${path}.tmp-${pid}-${random}` in the SAME directory, then `renameSync` over the target. Optionally apply `opts.mode` via `chmod` before rename.
  - Export an async variant `writeFileAtomicAsync` with identical semantics (used where callers already await).
  - Handle: target directory missing (mkdir recursive), rename across-device impossibility is not a concern (same dir), tmp-file cleanup on failure (try/finally unlink).
  - Write tests in `hooks/lib/atomic-file.test.ts`: content correctness, no partial file visible mid-write (write large payload, concurrent reader sees old-or-new never partial), mode applied, tmp files cleaned up on simulated failure.

  **Must NOT do**:
  - No fsync ceremony beyond rename semantics (keep it simple; this is crash-consistency for coordination files, not a database)
  - No mutex/queue abstractions — this is a pure function module
  - Do not modify any consumers yet (Tasks 9-12 wire it in)

  **Recommended Agent Profile**:
  - **Category**: `quick` — single new module + test, no integration
  - **Skills**: none needed

  **Parallelization**: Wave 1, parallel with 2-7. Blocks: 9, 10, 11, 12. Blocked By: none.

  **References**:
  - `hooks/state-persistence.ts:223-233` — `Bun.write` fire-and-forget pattern this will replace (non-atomic on Linux)
  - `hooks/port-manager.ts:11-12` — `writeFileSync` direct write to be replaced in Task 12
  - `hooks/lib/metrics.ts` — existing lib/ module style to match (plain functions, no classes unless stateful)
  - Existing test style: `hooks/handlers/tool-guard-handlers.test.ts` — bun:test describe/test/expect conventions

  **Acceptance Criteria**:
  - [ ] `cd hooks && bun test lib/atomic-file.test.ts` → all pass
  - [ ] `cd hooks && npx tsc --noEmit` → no new errors vs baseline

  **QA Scenarios**:
  ```
  Scenario: Atomic write leaves no partial state
    Tool: Bash
    Preconditions: hooks/lib/atomic-file.ts exists
    Steps:
      1. cd hooks && bun test lib/atomic-file.test.ts 2>&1 | tee /mnt/development/oh-my-cursor/.omo/evidence/task-1-atomic-tests.txt
      2. Run a one-off script: bun -e 'import {writeFileAtomic} from "./lib/atomic-file.ts"; writeFileAtomic("/tmp/omc-qa-1/x.json", JSON.stringify({a:1}), {mode: 0o600})' (workdir hooks/)
      3. stat -c "%a" /tmp/omc-qa-1/x.json && cat /tmp/omc-qa-1/x.json
    Expected Result: tests pass; file contains {"a":1}; mode is 600; no *.tmp-* files remain in /tmp/omc-qa-1
    Failure Indicators: leftover tmp files; wrong mode; partial content
    Evidence: .omo/evidence/task-1-atomic-write.txt

  Scenario: Failure cleanup (error path)
    Tool: Bash
    Preconditions: none
    Steps:
      1. bun -e script calling writeFileAtomic with a path whose parent is a FILE (e.g., /tmp/omc-qa-1/x.json/child.json) — must throw
      2. ls /tmp/omc-qa-1/ — assert no stray tmp files
    Expected Result: throws a clear error; no tmp artifacts
    Evidence: .omo/evidence/task-1-atomic-write-error.txt
  ```

  **Commit**: YES — `feat(hooks): add atomic temp+rename file write utility`; Files: `hooks/lib/atomic-file.ts`, `hooks/lib/atomic-file.test.ts`; Pre-commit: `cd hooks && bun test lib/atomic-file.test.ts`

- [x] 2. Verify and fix BackgroundTracker type error in conversation-handlers

  **What to do**:
  - FIRST verify: `cd hooks && npx tsc --noEmit 2>&1 | grep -n "conversation-handlers"` — capture the exact TS2304 error and save full tsc output as the project baseline to `.omo/evidence/task-2-tsc-baseline.txt` (Wave 4 Task 22 and F2 compare against this).
  - Read `hooks/handlers/conversation-handlers.ts:1-60` to see how `BackgroundTracker` is used (likely a type-only parameter). Fix minimally: add `import type { BackgroundTracker } from "./background-tracker"` (or the correct relative path/export name — verify against `hooks/handlers/background-tracker.ts` exports).
  - Re-run tsc; confirm the conversation-handlers error is gone and NO new errors appeared.

  **Must NOT do**:
  - No refactoring of conversation-handlers logic (Task 8/13 territory)
  - Do not fix other pre-existing tsc errors (daemon.test.ts, dashboard-ui) — they are documented non-blocking

  **Recommended Agent Profile**:
  - **Category**: `quick` — one-line import fix with verification
  - **Skills**: none needed

  **Parallelization**: Wave 1, parallel with 1, 3-7. Blocks: none. Blocked By: none.

  **References**:
  - `hooks/handlers/conversation-handlers.ts:42` — reported TS2304 site
  - `hooks/handlers/background-tracker.ts:34` — `BackgroundTracker` class definition and export
  - `AGENTS.md` — "pre-existing errors in daemon/dashboard are non-blocking" (do not chase those)

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit 2>&1 | grep conversation-handlers` → empty output
  - [ ] `bun test` → same pass count as before the change
  - [ ] Baseline file `.omo/evidence/task-2-tsc-baseline.txt` exists with pre-fix full output

  **QA Scenarios**:
  ```
  Scenario: Type error eliminated without behavior change
    Tool: Bash
    Preconditions: repo at task start
    Steps:
      1. cd hooks && npx tsc --noEmit 2>&1 | tee /mnt/development/oh-my-cursor/.omo/evidence/task-2-tsc-baseline.txt (BEFORE fix)
      2. Apply fix
      3. npx tsc --noEmit 2>&1 | tee /mnt/development/oh-my-cursor/.omo/evidence/task-2-tsc-after.txt
      4. diff the two outputs — assert conversation-handlers error removed, nothing added
      5. bun test 2>&1 | tail -5 — assert 0 failures
    Expected Result: error count decreased by exactly the conversation-handlers error(s); tests unchanged
    Failure Indicators: new tsc errors; test failures
    Evidence: .omo/evidence/task-2-tsc-after.txt

  Scenario: Import resolves at runtime (not just types)
    Tool: Bash
    Preconditions: fix applied
    Steps:
      1. cd hooks && bun -e 'await import("./handlers/conversation-handlers.ts"); console.log("LOADED")'
    Expected Result: prints LOADED, no module-resolution error
    Evidence: .omo/evidence/task-2-import-error.txt
  ```

  **Commit**: YES — `fix(hooks): resolve BackgroundTracker type error in conversation-handlers`; Files: `hooks/handlers/conversation-handlers.ts`; Pre-commit: `cd hooks && bun test`

- [x] 3. Inventory preserved-behavior anchors (Write-over-CreatePlan + explicit todos)

  **What to do**:
  - Create `docs/internal/preserved-behaviors.md` documenting EXACT file:line anchors (with quoted text) for:
    1. **Write-tool-over-CreatePlan**: `rules/prometheus-plan-brief.mdc:65-71`, `rules/agent-tool-restrictions.mdc:40,67`, `commands/plan.md:186-187`, `commands/start-work.md:17-19`, `docs/cursor/19-known-sharp-edges.md:100-101` — verify each anchor exists NOW (line numbers may have drifted; record actual current lines).
    2. **Explicit todos behavior**: FIND it — grep rules/, commands/, agents/, hooks/handlers/ for TodoWrite enforcement, todo-state parsing (`parseTodoStates`, `todoStates`), the `tasks-todowrite-disabler` handler if present, and any rule mandating explicit todo lists. Record every surface with quoted text.
  - For each anchor: file, current line range, verbatim quote, and a one-line "why preserved" note.
  - Add a header warning: "Tasks 4, 8, 9, 13, 14, 17, 21 touch adjacent files — these anchors MUST be byte-identical after each task (except where a task explicitly edits adjacent non-anchor text)."

  **Must NOT do**:
  - Do not modify ANY of the anchored files — read-only task
  - Do not editorialize about whether the behaviors are good — they are user-mandated

  **Recommended Agent Profile**:
  - **Category**: `quick` — research + one doc file
  - **Skills**: none needed

  **Parallelization**: Wave 1, parallel with 1, 2, 4-7. Blocks: 8, 9, 13, 17. Blocked By: none.

  **References**:
  - Audit 3 findings (in plan Context §3) — the five Write-over-CreatePlan surfaces
  - `hooks/handlers/tool-guard-handlers.ts` — TodoWrite-related handling lives here per audit (sets activePlan from TodoWrite)
  - `rules/orchestrator.mdc` + `rules/orchestrator-reference.mdc` — likely homes of explicit-todo mandates
  - `docs/cursor/19-known-sharp-edges.md:25` — "TodoWrite does NOT fire hooks at 3.6.21" context

  **Acceptance Criteria**:
  - [ ] `docs/internal/preserved-behaviors.md` exists, lists ≥5 Write-over-CreatePlan anchors and ≥1 explicit-todos anchor with verbatim quotes
  - [ ] Every quoted anchor verified present: each quote greps successfully against its file

  **QA Scenarios**:
  ```
  Scenario: Every recorded anchor greps true
    Tool: Bash
    Preconditions: docs/internal/preserved-behaviors.md written
    Steps:
      1. For each quoted anchor in the doc, run grep -F "<distinctive 30+ char substring of quote>" <file>
      2. Collect results: every grep must return ≥1 match
    Expected Result: 100% of anchors verified present; output saved
    Failure Indicators: any quote that fails to grep (stale anchor recorded)
    Evidence: .omo/evidence/task-3-anchor-verification.txt

  Scenario: Explicit-todos surface actually located (negative check)
    Tool: Bash
    Preconditions: doc written
    Steps:
      1. grep -c "todo" docs/internal/preserved-behaviors.md (case-insensitive)
      2. Assert the doc contains at least one hooks/ or rules/ anchor for todo enforcement, not just "couldn't find"
    Expected Result: concrete file:line anchors for todos behavior exist in the doc
    Evidence: .omo/evidence/task-3-todos-anchor.txt
  ```

  **Commit**: YES — `docs(internal): inventory preserved-behavior anchors`; Files: `docs/internal/preserved-behaviors.md`; Pre-commit: none (docs only)

- [x] 4. Fix atlas.md auto-continue contradiction + standardize Momus phrasing

  **What to do**:
  - `agents/atlas.md`: resolve the three-way contradiction. Lines ~239-242 (Final Wave approval gate: "Do NOT auto-continue") vs ~246-252 and ~472 ("auto-continue mandatory, NEVER ask"). Rewrite so the policy is unambiguous:
    - The approval pause applies ONLY to the Final Verification Wave (F-tasks) — state this explicitly inside the gate paragraph: "This pause applies ONLY after the Final Verification Wave; it is the single exception to the Auto-Continue Policy below."
    - In the Auto-Continue Policy section, add the mirror clause: "Exception: after the Final Verification Wave completes, STOP and wait for explicit user approval (see Final Wave Approval Gate)."
    - Fix line ~472 to: "Ask 'should I continue?' between regular waves — forbidden; auto-continue is mandatory. The Final Verification Wave approval gate is the only exception."
  - Standardize the Momus option description so `commands/plan.md:~220-222` and `agents/prometheus.md:~575-580` use IDENTICAL wording (keep the richer variant: "Have Momus rigorously verify every detail. Adds review loop but guarantees precision.").
  - Verify actual line numbers first — audit line refs may have drifted.

  **Must NOT do**:
  - Do not change the auto-continue SEMANTICS (auto-continue between regular waves stays mandatory; final-wave pause stays mandatory) — only remove the ambiguity
  - Do not touch the Write-over-CreatePlan or TodoWrite text in plan.md/prometheus.md (preserved anchors — Task 3 inventory)
  - Do not restructure atlas.md sections

  **Recommended Agent Profile**:
  - **Category**: `writing` — precise prose surgery in agent prompt files
  - **Skills**: none needed

  **Parallelization**: Wave 1, parallel with 1-3, 5-7. Blocks: 21. Blocked By: none (Task 3 runs parallel; coordinate by NOT touching anchor lines — anchors are in different sections).

  **References**:
  - `agents/atlas.md:239, 246-252, 472` — the three contradiction sites (verify current lines)
  - `commands/plan.md:220-222` and `agents/prometheus.md:575-580` — Momus phrasing drift
  - Audit 3 root-cause note: line 239 is the Final-Wave gate, 244-272 is the general policy — the scoping language is what's missing

  **Acceptance Criteria**:
  - [ ] atlas.md contains the word "exception" (or "only exception") in BOTH the gate paragraph and the auto-continue policy, cross-referencing each other
  - [ ] `grep -c "Adds review loop but guarantees precision" commands/plan.md agents/prometheus.md` → 1 each
  - [ ] No other atlas.md lines changed (git diff shows only the three edited regions)

  **QA Scenarios**:
  ```
  Scenario: Contradiction resolved — both directives now scoped
    Tool: Bash
    Preconditions: edits applied
    Steps:
      1. grep -n "auto-continue" agents/atlas.md > /mnt/development/oh-my-cursor/.omo/evidence/task-4-autocontinue-lines.txt
      2. Assert: every "Do NOT auto-continue"-style line contains a Final-Wave scoping qualifier on the same line or within 2 lines
      3. Assert: the mandatory-auto-continue section names the Final Wave exception
      4. git diff --stat agents/atlas.md commands/plan.md agents/prometheus.md — only these 3 files
    Expected Result: zero unscoped contradictory directives remain
    Failure Indicators: any absolute "never ask" without the exception clause; diff touching other files
    Evidence: .omo/evidence/task-4-autocontinue-lines.txt

  Scenario: Preserved anchors untouched (negative check)
    Tool: Bash
    Preconditions: edits applied, Task 3 doc may or may not exist yet
    Steps:
      1. grep -F "DO NOT" commands/plan.md | grep -i "createplan" — Write-over-CreatePlan warning still present
      2. git diff commands/plan.md | grep -E "^[-+].*CreatePlan" — assert empty (no CreatePlan lines modified)
    Expected Result: CreatePlan enforcement text byte-identical
    Evidence: .omo/evidence/task-4-anchors-error.txt
  ```

  **Commit**: YES — `fix(agents): scope atlas auto-continue policy to non-final waves`; Files: `agents/atlas.md`, `commands/plan.md`, `agents/prometheus.md`; Pre-commit: none (prompt files)

- [x] 5. Reproduce and fix the sidecar echo leak (test-harness isolation)

  **What to do**:
  - INVESTIGATE FIRST (reproduce-before-fix, Metis G7): determine how `echo test-from-mcp-sidecar` (hooks/mcp-sidecar.test.ts:206) reached a live session. Check in order:
    1. Does the installed plugin location contain test files? (`find ~/.cursor -path "*oh-my-cursor*" -name "mcp-sidecar.test.ts"`)
    2. Does `hooks/mcp-sidecar.test.ts` beforeAll mutate `process.env.OH_MY_CURSOR_MCP_PORT` then `import("./mcp-sidecar.ts")` — and could that import start a sidecar that the REAL Cursor mcp.json (port 27848) routes to? Check the test PORT value vs 27848 and whether port-manager coordination files (`/tmp/oh-my-cursor-ports.json`) get overwritten by test runs.
    3. Does `interactive_bash` default to the SAME tmux session name (`oh-my-cursor`) that a live session uses — so a test running `echo test-from-mcp-sidecar` types into the user's live tmux pane?  ← most plausible: the test sends keys to a shared tmux session.
    4. Check daemon/sidecar logs (`/tmp/oh-my-cursor-daemon.log`, sidecar log) for the test string timestamps.
  - Document the confirmed mechanism in the task notepad and in `docs/cursor/19-known-sharp-edges.md` (short entry).
  - FIX accordingly (apply all that are real):
    - Test harness: use a RANDOM dedicated port AND a dedicated tmux session name (`omc-test-${pid}`) in mcp-sidecar.test.ts and interactive-bash tests; never touch `/tmp/oh-my-cursor-ports.json` from tests (point port-manager at a temp dir via env or injection).
    - Add an env guard to the sidecar entrypoint if tests import it: when `NODE_ENV=test`/`BUN_TEST=1`, skip port-coordination writes.
    - interactive-bash tool: kill-session or use a unique disposable session in tests; ensure tool's default session for PRODUCTION stays unchanged.
  - Add regression test: running `bun test mcp-sidecar.test.ts` must not write to the real ports file and must not create/send-keys to the `oh-my-cursor` tmux session.

  **Must NOT do**:
  - Do not delete the test or the test string — fix the isolation, keep coverage
  - Do not change installer copy globs here (Task 16 owns installers)
  - Do not modify interactive-bash PRODUCTION behavior (session name, command flow) beyond what isolation requires

  **Recommended Agent Profile**:
  - **Category**: `deep` — root-cause investigation with multiple hypotheses, then targeted fix
  - **Skills**: none needed

  **Parallelization**: Wave 1, parallel with 1-4, 6, 7. Blocks: 16. Blocked By: none.

  **References**:
  - `hooks/mcp-sidecar.test.ts:19-23` — beforeAll: env port mutation + live `import("./mcp-sidecar.ts")`
  - `hooks/mcp-sidecar.test.ts:206` — the literal echo string (interactive_bash tool test)
  - `hooks/mcp/tools/interactive-bash.ts:52-110` — tmux send-keys mechanics, default session name
  - `hooks/port-manager.ts:11-25` — `/tmp/oh-my-cursor-ports.json` coordination file tests may clobber
  - `mcp.json:14` — Cursor connects to `http://localhost:27848/mcp`

  **Acceptance Criteria**:
  - [ ] Written root-cause statement with evidence (log lines or reproduction transcript) in `.omo/evidence/task-5-root-cause.md`
  - [ ] `bun test mcp-sidecar.test.ts` passes AND leaves `/tmp/oh-my-cursor-ports.json` unmodified (checksum before/after identical)
  - [ ] No tmux session named `oh-my-cursor` is created or receives keys during the test run

  **QA Scenarios**:
  ```
  Scenario: Test run cannot reach live surfaces
    Tool: Bash
    Preconditions: tmux available; live ports file may exist
    Steps:
      1. md5sum /tmp/oh-my-cursor-ports.json 2>/dev/null > /tmp/before.txt; tmux list-sessions > /tmp/sessions-before.txt 2>&1
      2. cd hooks && bun test mcp-sidecar.test.ts 2>&1 | tee /mnt/development/oh-my-cursor/.omo/evidence/task-5-test-run.txt
      3. md5sum /tmp/oh-my-cursor-ports.json 2>/dev/null > /tmp/after.txt; tmux list-sessions > /tmp/sessions-after.txt 2>&1
      4. diff /tmp/before.txt /tmp/after.txt && diff /tmp/sessions-before.txt /tmp/sessions-after.txt (ignoring test-created omc-test-* sessions, which must also be cleaned up — assert none remain)
    Expected Result: ports file untouched; no new persistent tmux sessions; tests pass
    Failure Indicators: ports file hash changed; session named oh-my-cursor created; leftover omc-test-* sessions
    Evidence: .omo/evidence/task-5-isolation.txt

  Scenario: Echo string cannot reach a live tmux pane (negative reproduction)
    Tool: interactive_bash
    Preconditions: create a decoy tmux session named "oh-my-cursor" with a shell
    Steps:
      1. tmux new-session -d -s oh-my-cursor
      2. cd hooks && bun test mcp-sidecar.test.ts
      3. tmux capture-pane -t oh-my-cursor -p | grep -c "test-from-mcp-sidecar"
      4. tmux kill-session -t oh-my-cursor
    Expected Result: grep count = 0 — the test never typed into the decoy live session
    Failure Indicators: count ≥ 1 (leak still present)
    Evidence: .omo/evidence/task-5-no-leak-error.txt
  ```

  **Commit**: YES — `fix(hooks): isolate mcp-sidecar test harness from live ports`; Files: `hooks/mcp-sidecar.test.ts`, `hooks/mcp/tools/interactive-bash.ts` (test-isolation paths only), `hooks/port-manager.ts` (env-injectable path if needed), `docs/cursor/19-known-sharp-edges.md`; Pre-commit: `cd hooks && bun test`

- [x] 6. Daemon singleton lock + PID-race elimination

  **What to do**:
  - VERIFY the hazard surface first: read `hooks/daemon.ts:268-314, 890-910` and `hooks/process-guard.ts:17-48` — confirm the startup sequence (cleanup stale → bind → write PID/port files) and that two concurrent starts can interleave (cross-PROCESS race: real even in single-threaded Bun).
  - Implement a per-project exclusive startup lock:
    - Lock path: `/tmp/oh-my-cursor-${hash(projectRoot)}.lock` (short hash of `DAEMON_PROJECT_ROOT`); create with `openSync(path, "wx")` (O_EXCL) writing `{pid, startedAt}`.
    - If lock exists: read PID; if alive AND responds to `GET /health` on the recorded port → exit cleanly with "daemon already running" (code 0 or documented nonzero). If dead/stale (PID dead or health check fails) → remove lock, proceed (atomically retry O_EXCL once; if it fails again, another starter won — exit).
    - Release lock on gracefulShutdown and on process exit handlers.
  - Bind-then-signal upgrade ordering (Metis EC3): when replacing a stale-but-alive daemon, the NEW daemon must bind a port and be ready before killing the old one — if the standard port is taken, follow existing bind-with-retry behavior; only after successful bind + health self-check, send SIGTERM to the old PID, then write coordination files (using Task-1 atomic writes if available, else writeFileSync to a temp+rename inline).
  - Fix `process-guard.ts` check-kill race: after `process.kill(pid, "SIGTERM")`, wait (poll isProcessAlive with timeout ~2s) before unlinking the PID file; tolerate ESRCH.
  - Fix `daemon.ts:49-54` delete-during-iteration in /health (iterate over a snapshot array: `[...conversations]`).
  - Regression tests: lock acquisition/stale-takeover unit tests (mock PID liveness); /health iteration test.

  **Must NOT do**:
  - No global cross-project lock (two projects must run two daemons)
  - Do not change ports, endpoints, or the health response shape
  - Do not add a supervisor/restart loop — out of scope

  **Recommended Agent Profile**:
  - **Category**: `deep` — process lifecycle correctness with ordering constraints
  - **Skills**: none needed

  **Parallelization**: Wave 1, parallel with 1-5, 7. Blocks: 15. Blocked By: none (uses inline temp+rename if Task 1 not merged yet; converge in Wave 2).

  **References**:
  - `hooks/daemon.ts:268-314` — gracefulShutdown + isShuttingDown flag
  - `hooks/daemon.ts:890-910` — writePidFile/writePortFile/writePortCoordination startup ordering
  - `hooks/process-guard.ts:17-48` — cleanupStaleProcess read-check-kill-unlink sequence
  - `hooks/bind-with-retry.ts` — existing port binding/retry logic to reuse, not replace
  - `hooks/port-manager.ts` — coordination file the lock must serialize access to
  - Audit 1 findings #12, #13 — concrete interleaving failure scenarios

  **Acceptance Criteria**:
  - [ ] Unit tests for lock module pass (`bun test`)
  - [ ] Concurrent-start QA (below) shows exactly one daemon serving
  - [ ] `process-guard` no longer unlinks PID file while target may still be alive (kill→wait→unlink visible in code)

  **QA Scenarios**:
  ```
  Scenario: Three simultaneous starts → exactly one survivor
    Tool: Bash
    Preconditions: no daemon on test port; isolated env OH_MY_CURSOR_PORT=28847 OH_MY_CURSOR_MCP_PORT=28848 OH_MY_CURSOR_PROJECT_DIR=/tmp/omc-qa-6
    Steps:
      1. for i in 1 2 3; do (cd hooks && OH_MY_CURSOR_PORT=28847 OH_MY_CURSOR_PROJECT_DIR=/tmp/omc-qa-6 bun daemon.ts >> /tmp/omc-qa-6/start-$i.log 2>&1 &) ; done
      2. sleep 3; curl -s http://localhost:28847/health | head -c 200
      3. pgrep -fc "bun daemon.ts" (count daemons for this test env via lock file pid)
      4. cat /tmp/omc-qa-6/start-*.log | grep -c "already running"
      5. cleanup: curl -s -X POST http://localhost:28847/shutdown; pkill -f "28847" || true
    Expected Result: /health returns 200; exactly 1 daemon process for the project; ≥2 "already running" exits
    Failure Indicators: 2+ daemons alive; health flapping; zero "already running" messages
    Evidence: .omo/evidence/task-6-singleton.txt

  Scenario: Stale lock takeover (crashed daemon)
    Tool: Bash
    Preconditions: write a lock file containing a dead PID (e.g., 999999) for /tmp/omc-qa-6b
    Steps:
      1. printf '{"pid":999999,"startedAt":"2026-01-01T00:00:00Z"}' > "/tmp/oh-my-cursor-$(hash-of /tmp/omc-qa-6b).lock" (compute hash the same way the code does — read it from code first)
      2. Start daemon with that project dir on port 28849
      3. curl -s http://localhost:28849/health
      4. cleanup shutdown
    Expected Result: daemon detects stale lock, takes over, serves health 200
    Failure Indicators: daemon refuses to start ("already running" against a dead PID)
    Evidence: .omo/evidence/task-6-stale-takeover-error.txt
  ```

  **Commit**: YES — `fix(daemon): per-project singleton lock, eliminate startup races`; Files: `hooks/daemon.ts`, `hooks/process-guard.ts`, new `hooks/lib/startup-lock.ts` (+ test); Pre-commit: `cd hooks && bun test`

- [x] 7. Event-logger flush/shutdown hardening

  **What to do**:
  - VERIFY each reported hazard against single-threaded reality first (`hooks/event-logger.ts:86-92, 121-160, 189-199`): the buffer-trim "race" is synchronous (likely false positive — document and close); the REAL hazards are (a) pending events lost when the process exits before the debounced flush fires, (b) unawaited flush errors.
  - Fix: export `flushNow(): Promise<void>` that cancels the timer and writes all pending entries; call it from daemon `gracefulShutdown` (and `process.on("beforeExit")` as backstop).
  - Make the flush write path awaited and error-logged (no fire-and-forget `.catch(() => {})`).
  - Keep the debounce for steady-state (performance); only shutdown/exit paths force-flush.
  - Regression tests: logEvent → flushNow → file contains entries; simulated rapid logEvent burst near MAX_BUFFER trims correctly (oldest dropped, newest kept).

  **Must NOT do**:
  - No mutexes around the synchronous buffer (single-threaded — verified-not-a-race goes in the task notes, not the code)
  - Do not change the log file format or location (security perms are Task 15)
  - Do not make every logEvent synchronous (keep hot path cheap)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — careful async-lifecycle work in a shared module
  - **Skills**: none needed

  **Parallelization**: Wave 1, parallel with 1-6. Blocks: none. Blocked By: none.

  **References**:
  - `hooks/event-logger.ts:86-92` — buffer/pending arrays; `:121-160` — scheduleFlush/flushPending; `:189-199` — logEvent
  - `hooks/daemon.ts:268-314` — gracefulShutdown, where flushNow must be called
  - Audit 1 findings #3, #15 — reported scenarios (validate which are real)

  **Acceptance Criteria**:
  - [ ] `flushNow` exists, awaited in gracefulShutdown
  - [ ] New tests pass; existing event-logger tests still pass
  - [ ] Task notes document the buffer-trim false-positive determination (or the fix, if an await was found in the path)

  **QA Scenarios**:
  ```
  Scenario: Events survive immediate shutdown
    Tool: Bash
    Preconditions: isolated daemon on port 28850, OH_MY_CURSOR_PROJECT_DIR=/tmp/omc-qa-7
    Steps:
      1. Start daemon; POST 5 hook events (curl /preToolUse with minimal valid payloads, conversation_id "qa7")
      2. Immediately POST /shutdown (within the debounce window, < 500ms after last event)
      3. Wait for exit; grep -c "qa7" <session log file under /tmp/omc-qa-7 or configured log dir>
    Expected Result: all 5 events present in the log file despite shutdown inside debounce window
    Failure Indicators: missing events (flush-on-shutdown not working)
    Evidence: .omo/evidence/task-7-flush-on-shutdown.txt

  Scenario: Burst beyond MAX_BUFFER trims sanely (edge)
    Tool: Bash
    Preconditions: unit test environment
    Steps:
      1. cd hooks && bun test event-logger.test.ts (must include the new burst test)
    Expected Result: trim keeps newest entries; no exceptions; count assertions pass
    Evidence: .omo/evidence/task-7-burst-error.txt
  ```

  **Commit**: YES — `fix(hooks): flush event logger on shutdown, correct buffer trim`; Files: `hooks/event-logger.ts`, `hooks/daemon.ts`, `hooks/event-logger.test.ts`; Pre-commit: `cd hooks && bun test`

- [x] 8. Fix context duplication (dual-channel return + missing consume)

  **What to do** (the user's #1 symptom — two confirmed root causes, fix both):
  - **PRE-STEP (Metis G1)**: read `docs/internal/preserved-behaviors.md` (Task 3); record which anchors live in files this task touches; verify them again after the change.
  - **Fix A — dual-channel return** (`hooks/handlers/continuation-handlers.ts:441-451`): the handler returns `user_message: userMessage + "\n\n" + trimmed` AND `additional_context: trimmed`. Decide the single channel by reading `docs/cursor/03-hooks.md` beforeSubmitPrompt response contract: if `additional_context` alone is documented to inject, return ONLY `additional_context` and leave `user_message` absent/original (Metis G2). If the docs show `user_message` is required for injection, keep `user_message` augmented and DROP `additional_context`. Record the doc citation in code comment.
  - **Fix B — missing consume** (`continuation-handlers.ts:263-456`): before building its own additionalContext, `/beforeSubmitPrompt` must call `contextCollector.consume(conversationId)` and prepend/merge those pending entries — BUT FIRST audit all ~28 `contextCollector.register()` call sites (tool-guard-handlers.ts:182-596 et al.): for each, confirm one-shot semantics (registered → should be delivered once on next prompt). Any register site that expects multi-prompt persistence must be listed and handled (re-register or exclude). Produce the audit table in the task notes (Metis G3).
  - **Fix C — rehydration staleness** (`hooks/shared.ts:22-91`): when a conversation is rehydrated from persistence, clear the contextCollector for that conversation (`contextCollector.clearConversation(id)` or equivalent) so stale pre-restart context can't re-inject.
  - Regression tests: (a) beforeSubmitPrompt response never contains the same string in two fields; (b) registered-then-consumed context does not appear on the SECOND prompt; (c) rehydration starts with empty pending context.

  **Must NOT do**:
  - Do not remove the continuation/boulder followup logic (Task 9's domain) — only the duplication
  - Do not modify TodoWrite/explicit-todos handling in tool-guard-handlers (preserved; register-site audit is read-only there unless a site is provably one-shot-broken)
  - Do not change context-collector internals (Task 13's domain) — use its existing API

  **Recommended Agent Profile**:
  - **Category**: `deep` — contract-sensitive change with a mandatory pre-audit and high blast radius
  - **Skills**: none needed

  **Parallelization**: Wave 2, parallel with 9-13 (different primary files; coordinate with 9 on continuation-handlers.ts — 8 owns the /beforeSubmitPrompt + return-shape region, 9 owns /stop + stop-continuation region; sequential edits within the file if dispatched to the same wave, declare overlap). Blocks: 14, 20. Blocked By: 3.

  **References**:
  - `hooks/handlers/continuation-handlers.ts:441-451` — dual return (Fix A); `:263-456` — beforeSubmitPrompt body (Fix B)
  - `hooks/context-collector.ts:73-93 (register), :107 (consume), :170 (clear)` — API to use
  - `hooks/handlers/tool-guard-handlers.ts:182,212,261,284,391,401,420,463,533,555,566,579,596` — register sites to audit
  - `hooks/shared.ts:22-91` — getOrCreateConversation rehydration path (Fix C)
  - `docs/cursor/03-hooks.md` — beforeSubmitPrompt response contract (authoritative for Fix A channel choice)
  - Audit 6 (Context duplication) — full duplication-path ranking

  **Acceptance Criteria**:
  - [ ] curl probe (below) shows no content duplication across fields
  - [ ] Register-site audit table exists in task notes listing all sites with one-shot/persistent classification
  - [ ] All existing continuation-handler tests pass + 3 new regression tests pass

  **QA Scenarios**:
  ```
  Scenario: Context appears in exactly one channel
    Tool: Bash
    Preconditions: isolated daemon port 28851, project dir /tmp/omc-qa-8; a context entry registered (trigger a postToolUse that registers a reminder, or seed via a preceding hook call)
    Steps:
      1. curl -s -X POST http://localhost:28851/beforeSubmitPrompt -H "Content-Type: application/json" -d '{"conversation_id":"qa8","prompt":"continue working","mode":"agent"}' > resp.json
      2. jq '{um:(.user_message//""), ac:(.additional_context//"")}' resp.json
      3. Assert: if ac != "" then (um does not contain ac) AND (um == "" or um == original prompt)
    Expected Result: no string from additional_context duplicated inside user_message
    Failure Indicators: same sentence present in both fields
    Evidence: .omo/evidence/task-8-single-channel.json

  Scenario: Consumed context does not repeat on second prompt (negative)
    Tool: Bash
    Preconditions: same daemon; register one one-shot context entry for qa8
    Steps:
      1. POST /beforeSubmitPrompt (prompt #1) — capture response; assert context present
      2. POST /beforeSubmitPrompt (prompt #2, same conversation) — capture response
      3. Assert the context string from #1 is ABSENT in #2's fields
    Expected Result: one-shot delivery; second prompt clean
    Failure Indicators: same reminder injected twice across prompts
    Evidence: .omo/evidence/task-8-no-repeat-error.json

  Scenario: Rehydration starts clean
    Tool: Bash
    Preconditions: daemon with state persistence enabled, /tmp/omc-qa-8 state dir
    Steps:
      1. Register context for qa8; restart daemon (shutdown + start, same state dir)
      2. POST /beforeSubmitPrompt for qa8
      3. Assert pre-restart pending context is not injected
    Expected Result: no stale context after restart
    Evidence: .omo/evidence/task-8-rehydration.txt
  ```

  **Commit**: YES — `fix(hooks): deliver context once — drop dual-channel return, wire consume()`; Files: `hooks/handlers/continuation-handlers.ts`, `hooks/shared.ts`, tests; Pre-commit: `cd hooks && bun test`

- [x] 9. Zombie activePlan + boulder auto-restart — one atomic fix

  **What to do** (Metis EC4: these MUST ship together):
  - **PRE-STEP**: verify preserved-behavior anchors (Task 3 doc) for files touched here; trace the full activePlan lifecycle (set via TodoWrite handler → persisted DURABLE → /stop reads → boulder re-creates boulderState at continuation-handlers.ts:211-218 → /stop-continuation clears in-memory at :369-376).
  - **Decision (validated by audit)**: keep `activePlan` DURABLE (legitimate: plan execution must survive daemon restarts mid-run) but make CLEARING durable too:
    - `/stop-continuation` handler: set `activePlan = null` AND `boulderState = null`, then `markDirty(conversationId)` + `await forceFlush()` (write-through, NOT debounced — Metis G4). Also write a durable tombstone field (e.g., `continuationStoppedAt: ISO`) so rehydration logic can distinguish "stopped" from "never started".
    - Idle-deactivation path (continuation-handlers.ts:199-207): same write-through treatment when it clears activePlan.
    - Boulder auto-restart guard (:211-218): only re-create `boulderState` when `activePlan` exists AND `continuationStoppedAt` is not set after plan activation; never resurrect within the same conversation after an explicit stop.
  - Update `hooks/state-partition.ts` / `hooks/types.ts` if the tombstone field needs DURABLE registration; document the partition rationale inline (why activePlan durable + boulderState ephemeral + tombstone durable is now coherent).
  - Regression tests: stop → simulate restart (new ConversationState from persisted file) → boulder does NOT reactivate; plan running → crash-restart WITHOUT stop → boulder DOES resume (intended behavior preserved); idle-deactivate → restart → no resurrection.

  **Must NOT do**:
  - Do not flip activePlan to EPHEMERAL wholesale (breaks legitimate mid-plan restart recovery — the audit's "move to EPHEMERAL" suggestion is rejected; the tombstone approach preserves resume-after-crash)
  - Do not touch the TodoWrite path that SETS activePlan (preserved explicit-todos behavior)
  - Do not modify /beforeSubmitPrompt return shape (Task 8's region)

  **Recommended Agent Profile**:
  - **Category**: `deep` — state-machine correctness across restart boundaries
  - **Skills**: none needed

  **Parallelization**: Wave 2, parallel with 8, 10-13 (declared overlap with 8 on continuation-handlers.ts — different regions; with 10 on state-persistence flush API — 10 owns internals, 9 only calls forceFlush). Blocks: 18. Blocked By: 1, 3.

  **References**:
  - `hooks/handlers/continuation-handlers.ts:199-207 (idle), :211-218 (auto-restart), :369-376 (/stop-continuation)`
  - `hooks/state-partition.ts:13-24, 47, 66` — DURABLE/EPHEMERAL field registry
  - `hooks/types.ts:111` — DurableConversationFields
  - `hooks/state-persistence.ts` — markDirty/forceFlush API (Task 10 hardens it; coordinate)
  - `.cursor/plans/fix-continuation-zombie.plan.md` — the repo's own prior analysis of this bug (read it; align or supersede)
  - Audit 2 BUG#1-#3 — failure scenarios

  **Acceptance Criteria**:
  - [ ] QA below: stop → restart → no boulder resurrection (disk-verified)
  - [ ] Crash-without-stop → restart → plan resumes (existing behavior intact)
  - [ ] All regression tests pass

  **QA Scenarios**:
  ```
  Scenario: /stop-continuation kills the zombie permanently
    Tool: Bash
    Preconditions: isolated daemon 28852, state dir /tmp/omc-qa-9; conversation qa9 with activePlan set (seed by POSTing the hook sequence that sets it, or write a valid persisted state file and rehydrate)
    Steps:
      1. Trigger /stop-continuation for qa9 (the command path — POST /beforeSubmitPrompt with prompt "/stop-continuation" or the documented trigger)
      2. jq '.activePlan, .continuationStoppedAt' /tmp/omc-qa-9/**/qa9.json — assert null + timestamp BEFORE any restart
      3. POST /shutdown; restart daemon same state dir
      4. POST /stop for qa9 (the hook that would resurrect boulder)
      5. Assert response has no followup_message; jq persisted file: boulder/activePlan still null
    Expected Result: no resurrection in memory or on disk
    Failure Indicators: activePlan restored after restart; followup_message returned
    Evidence: .omo/evidence/task-9-zombie-killed.txt

  Scenario: Crash mid-plan still resumes (intended behavior preserved)
    Tool: Bash
    Preconditions: same setup, conversation qa9b with activePlan set, NO stop issued
    Steps:
      1. kill -9 the daemon (simulate crash); restart with same state dir
      2. POST /stop for qa9b
      3. Assert continuation behaves per pre-fix semantics (boulder state re-created, followup issued)
    Expected Result: resume-after-crash works; only explicit stop is permanent
    Failure Indicators: plan lost after crash (over-correction)
    Evidence: .omo/evidence/task-9-resume-preserved-error.txt
  ```

  **Commit**: YES — `fix(hooks): atomically clear activePlan+boulderState with write-through`; Files: `hooks/handlers/continuation-handlers.ts`, `hooks/state-partition.ts`, `hooks/types.ts`, tests; Pre-commit: `cd hooks && bun test`

- [x] 10. State-persistence atomicity, await discipline, project-scoped keys

  **What to do**:
  - Replace BOTH write paths with Task 1's atomic writes: `writeDirty` (currently `Bun.write` — non-atomic) and `forceFlush` (currently `writeFileSync` — non-atomic). Per Metis A3, both must use temp+rename.
  - Await discipline: `writeDirty` promises must be awaited and errors logged with the conversation id (no silent `.catch(() => {})`); `save()` returns a promise that resolves when the flush it (eventually) triggers completes OR document the debounce contract clearly and add `forceFlushAll()` for shutdown — called from daemon `gracefulShutdown` (pair with Task 7's event-logger flush).
  - Debounce correctness: capture the dirty-set atomically at flush time (swap `this.dirty` with a fresh Set before writing) so markDirty during a flush is never lost.
  - Project-scoped state keys (Audit 2 BUG#7, Metis EC1): change the state filename to include a short projectRoot hash (`${hash}-${convId}.json`) OR enforce the existing `projectRoot` field check strictly. Choose filename-hash (prevents cross-project collisions at the FS level). Migration: keep reading legacy `${convId}.json` files when the embedded `projectRoot` matches or is empty (grace path) — write-back always uses the new name; legacy file unlinked after successful new-name write. Document this migration inline and in CHANGELOG (Task 22).
  - Regression tests: atomic write used (no partial JSON after simulated crash — write then kill is hard to unit test; instead assert tmp+rename calls via the atomic-file module), dirty-set swap correctness, legacy-file migration (old name in, new name out), projectRoot mismatch refuses load (existing behavior preserved).

  **Must NOT do**:
  - Do not change the serialized ConversationState schema beyond what Task 9 adds (tombstone)
  - Do not delete user state files except the legacy-name unlink AFTER successful migration write
  - Do not implement multi-window isolation (out-of-scope follow-up)

  **Recommended Agent Profile**:
  - **Category**: `deep` — persistence correctness + migration path
  - **Skills**: none needed

  **Parallelization**: Wave 2, parallel with 8, 9, 11-13 (coordinate with 9: 9 calls flush APIs, 10 owns their internals — land 10's API surface first within the wave if possible). Blocks: 18. Blocked By: 1.

  **References**:
  - `hooks/state-persistence.ts:50-57 (debounce), :117-123 (projectRoot check + empty-string grace path), :212-233 (writeDirty/forceFlush)`
  - `hooks/lib/atomic-file.ts` — Task 1 utility
  - `hooks/daemon.ts:268-314` — gracefulShutdown integration point
  - Audit 1 findings #4, #14; Audit 2 BUG#7; Metis EC1 (empty-projectRoot grace path is the migration mechanism)

  **Acceptance Criteria**:
  - [ ] grep shows no direct `Bun.write`/`writeFileSync` for state files in state-persistence.ts (all through atomic-file)
  - [ ] Migration test: legacy-named file with matching projectRoot loads and is rewritten under hashed name
  - [ ] All tests pass

  **QA Scenarios**:
  ```
  Scenario: State survives shutdown inside debounce window
    Tool: Bash
    Preconditions: isolated daemon 28853, state dir /tmp/omc-qa-10
    Steps:
      1. POST hook events for conversation qa10 (creates dirty state)
      2. POST /shutdown within 1s
      3. After exit: ls /tmp/omc-qa-10/ — find the qa10 state file (hashed name); jq . validates as complete JSON
    Expected Result: state file exists, valid JSON, contains qa10 data
    Failure Indicators: missing file; truncated/partial JSON
    Evidence: .omo/evidence/task-10-flush-on-shutdown.txt

  Scenario: Legacy state file migrates on load
    Tool: Bash
    Preconditions: daemon stopped; craft /tmp/omc-qa-10/qa10legacy.json with valid old-format state, projectRoot matching the test project dir
    Steps:
      1. Start daemon; POST an event for qa10legacy (forces load + dirty + flush)
      2. POST /shutdown; ls /tmp/omc-qa-10/
    Expected Result: new hashed-name file exists with the data; legacy name removed
    Failure Indicators: state lost; both files present (no cleanup); load refused
    Evidence: .omo/evidence/task-10-migration.txt

  Scenario: Wrong-project state refused (negative)
    Tool: Bash
    Preconditions: craft a state file with projectRoot "/some/other/project"
    Steps:
      1. Start daemon with project dir /tmp/omc-qa-10; trigger load for that conversation id
      2. Assert daemon logs the mismatch and starts a FRESH conversation (does not import foreign state)
    Expected Result: cross-project contamination blocked
    Evidence: .omo/evidence/task-10-mismatch-error.txt
  ```

  **Commit**: YES — `fix(hooks): atomic state persistence + project-scoped state keys`; Files: `hooks/state-persistence.ts`, `hooks/daemon.ts`, tests; Pre-commit: `cd hooks && bun test`

- [x] 11. Agent-history-store: verify hazard, then serialize + atomic write

  **What to do**:
  - VERIFY FIRST (Metis SC6): read `hooks/agent-history-store.ts:227-250`. If `record()` is fully synchronous (no await between `readEntriesFromDisk` and the writes), the in-PROCESS race is a false positive — document that. The remaining REAL issues regardless: (a) double-write inefficiency/corruption window (appendFileSync followed by full writeFileSync rewrite — a crash between them leaves duplicated entries), (b) cross-process clobbering if anything else writes the file.
  - Fix: single atomic write via Task 1 utility (drop the append+rewrite double write — one temp+rename with the pruned list). If an await IS found in the path, additionally serialize `record()` calls through a simple promise-chain queue (`this.writeChain = this.writeChain.then(...)`) — only then.
  - Regression tests: record N entries rapidly → file contains exactly N (deduped/pruned per existing rules); no `.tmp` leftovers.

  **Must NOT do**:
  - No queue if the path is fully synchronous (verify first, fix only what's real)
  - Do not change dedupe/prune semantics

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — verify-then-fix with restraint
  - **Skills**: none needed

  **Parallelization**: Wave 2, parallel with 8-10, 12, 13. Blocks: none. Blocked By: 1.

  **References**:
  - `hooks/agent-history-store.ts:227-250` — record() double-write
  - `hooks/lib/atomic-file.ts` — Task 1
  - Audit 1 finding #2 — reported scenario (validate)

  **Acceptance Criteria**:
  - [ ] One write call per record() (no append+rewrite pair)
  - [ ] Hazard verification note in task output (sync vs async determination)
  - [ ] Tests pass

  **QA Scenarios**:
  ```
  Scenario: Rapid records produce complete, valid history
    Tool: Bash
    Preconditions: unit test env
    Steps:
      1. cd hooks && bun test agent-history-store.test.ts (must include new rapid-record test: 50 records, assert all present post-prune rules)
    Expected Result: pass; file valid JSONL; no tmp leftovers in the store dir
    Failure Indicators: lost entries; duplicate entries from the old append path
    Evidence: .omo/evidence/task-11-history.txt

  Scenario: Corrupt-file resilience (edge)
    Tool: Bash
    Preconditions: write garbage bytes into the history file path used by a test store
    Steps:
      1. Call record() once via test; assert it recovers (treats unreadable as empty or skips bad lines per existing behavior) and writes valid output
    Expected Result: no crash; valid file after
    Evidence: .omo/evidence/task-11-corrupt-error.txt
  ```

  **Commit**: YES — `fix(hooks): serialize agent-history writes` (or `chore(hooks): single atomic write for agent history` if race disproven); Files: `hooks/agent-history-store.ts`, test; Pre-commit: `cd hooks && bun test`

- [x] 12. Single-flight config caches + atomic port files

  **What to do**:
  - `hooks/config.ts:127-149` and `hooks/hook-config.ts:16-50`: VERIFY whether loads are synchronous (likely — readFileSync). If synchronous, the TOCTOU is benign (worst case: duplicate load, last-write-wins identical data) — document as false positive but ADD one cheap improvement: when two logical "loads" race across an await elsewhere, prevent thundering reloads with a single-flight guard ONLY if an async path exists. Otherwise leave caching as is and just add a comment documenting the TTL semantics.
  - `hooks/port-manager.ts:11-25`: switch `writePortCoordination` to Task 1 atomic write; tolerate partial/corrupt JSON on read (try/catch → null, already partially present — verify and harden with a unit test).
  - Make port file paths env-injectable (`OH_MY_CURSOR_PORTS_FILE` or a dir override) if Task 5 needs it for test isolation — coordinate (Task 5 may have already added this; do not duplicate).
  - Regression tests: corrupt ports file returns null; atomic write produces valid JSON; config cache TTL behavior unchanged.

  **Must NOT do**:
  - No event-driven config invalidation system (audit suggested it; out of scope — TTL stays)
  - No locking around synchronous cache reads

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low` — small, well-bounded hardening
  - **Skills**: none needed

  **Parallelization**: Wave 2, parallel with 8-11, 13. Blocks: none. Blocked By: 1.

  **References**:
  - `hooks/config.ts:127-149`; `hooks/hook-config.ts:16-50`; `hooks/port-manager.ts:11-25`
  - Audit 1 findings #5-#7 (validate single-threaded reality first)

  **Acceptance Criteria**:
  - [ ] port-manager writes via atomic-file; corrupt-read test passes
  - [ ] Verification notes state sync/async determination for both caches
  - [ ] Tests pass

  **QA Scenarios**:
  ```
  Scenario: Corrupt ports file does not break startup
    Tool: Bash
    Preconditions: write "{invalid json" to the ports file path used by an isolated daemon (28854)
    Steps:
      1. Start daemon; observe it starts cleanly and REWRITES a valid ports file
      2. jq . <ports file> — valid JSON
      3. shutdown + cleanup
    Expected Result: graceful recovery, valid file after
    Failure Indicators: crash on parse; ports file left corrupt
    Evidence: .omo/evidence/task-12-corrupt-ports.txt

  Scenario: Hook-config TTL still honored (no regression)
    Tool: Bash
    Preconditions: unit test env
    Steps:
      1. cd hooks && bun test hook-config.test.ts config.test.ts
    Expected Result: existing cache tests pass unchanged
    Evidence: .omo/evidence/task-12-cache-error.txt
  ```

  **Commit**: YES — `fix(hooks): single-flight config caches, atomic port files`; Files: `hooks/port-manager.ts`, `hooks/config.ts`, `hooks/hook-config.ts` (comments/guards), tests; Pre-commit: `cd hooks && bun test`

- [x] 13. Context-collector determinism + iteration-safety batch

  **What to do**:
  - **Registration-order counter** (`hooks/context-collector.ts:54-92`): VERIFY whether register() has awaits (likely fully synchronous → counter race is a false positive in-process). Regardless, make ordering deterministic and documented: counter increment is fine synchronously; ADD a tiebreak (registrationOrder, then key) in sortEntries so equal-priority ordering is stable. Document.
  - **Iteration-safety one-liners** (Metis SC7 — only one-line-style fixes, defer anything structural):
    - `hooks/daemon.ts:49-54`: iterate `[...conversations]` snapshot before deleting (if not already fixed by Task 6 — coordinate; skip if done).
    - `hooks/handlers/background-tracker.ts:102-121` cleanup(): collect expired ids first, then delete after the loop.
    - `hooks/daemon.ts:620-685` SSE shutdown: iterate `[...activeStreams]`.
    - `hooks/lib/budget-middleware.ts` + `hooks/lib/metrics.ts`: VERIFY synchronous (almost certainly) → document false positives; fix ONLY if an await sits inside the read-modify-write.
  - Per-finding verification note (real vs false positive) in task output.
  - Regression tests: stable sort order test for context-collector; background-tracker cleanup-during-track test.

  **Must NOT do**:
  - No rewrite of the budget/priority algorithm (audit verified it correct)
  - No locks/mutexes anywhere in this task
  - Do not touch consume()/register() call sites (Task 8's domain)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — many small verifications + surgical fixes
  - **Skills**: none needed

  **Parallelization**: Wave 2, parallel with 8-12 (coordinate with 6 on daemon.ts /health snapshot — skip if already landed; with 8: 13 owns context-collector.ts internals, 8 only calls its API). Blocks: 20. Blocked By: 3.

  **References**:
  - `hooks/context-collector.ts:54-92 (register/counters), :180-185 (sortEntries)`
  - `hooks/handlers/background-tracker.ts:34, 41-47, 102-121`
  - `hooks/daemon.ts:49-54, 620-685`; `hooks/lib/budget-middleware.ts:36-69`; `hooks/lib/metrics.ts:47-56`
  - Audit 1 findings #8-#11, #16-#17 (validate each)

  **Acceptance Criteria**:
  - [ ] Verification table (finding → real/false-positive → action) in task output
  - [ ] Stable-ordering test passes; cleanup-safety test passes; all existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Context ordering is deterministic
    Tool: Bash
    Preconditions: unit test env
    Steps:
      1. cd hooks && bun test context-collector.test.ts — includes new test registering 10 same-priority entries and asserting identical consume order across 5 repeated runs
    Expected Result: identical order every run
    Failure Indicators: order varies between runs
    Evidence: .omo/evidence/task-13-ordering.txt

  Scenario: Cleanup during active tracking does not skip/crash (edge)
    Tool: Bash
    Preconditions: unit test env
    Steps:
      1. bun test handlers/background-tracker.test.ts — includes new test: track 5 (2 stale), call cleanup while tracking a 6th; assert exactly the 2 stale removed
    Expected Result: precise removal, no exception
    Evidence: .omo/evidence/task-13-cleanup-error.txt
  ```

  **Commit**: YES — `fix(hooks): deterministic context ordering, iteration-safe collections`; Files: `hooks/context-collector.ts`, `hooks/handlers/background-tracker.ts`, `hooks/daemon.ts`, `hooks/lib/*` (only if hazards verified), tests; Pre-commit: `cd hooks && bun test`

- [ ] 14. Hook-contract per-event verify and align

  **What to do**:
  - **NO GLOBAL RENAME (Metis G5).** For EACH flagged line individually — `hooks/handlers/safety-handlers.ts:25, 74, 120, 190` and `hooks/handlers/tool-guard-handlers.ts:~190` — open `docs/cursor/03-hooks.md` at the matching event's response contract and record: documented field name (`decision` vs `permission`), documented values (`deny`/`allow`/`ask` vs `block`). Build a verification table. ONLY where code deviates from the documented contract, fix the field/value. Where the docs are ambiguous or show `permission` as valid, leave code unchanged and note it.
  - Verify the explorer's "missing handlers" claim: grep the merged HandlerMap construction in `hooks/daemon.ts` and each `create*Handlers()` for routes `sessionStart`, `sessionEnd`, `beforeSubmitPrompt`, `preCompact`, `workspaceOpen` vs `hooks/hooks.json` registrations. For any event registered in hooks.json with NO daemon route: add a no-op handler returning `{}` (prevents 404s back to Cursor) OR remove the registration — choose per docs (if docs say the event is useful later, no-op handler; if dead, deregister). Document each.
  - Prompt-type hook (hooks.json:15, beforeMCPExecution `type: "prompt"`): verify whether the daemon ever receives/handles it; if non-functional, remove the registration and note in sharp-edges doc.
  - Retry-on-500: add a short documented section to `docs/cursor/19-known-sharp-edges.md`: "Cursor behavior on hook HTTP 500 is unverified — daemon now returns 200 `{}` for handler errors on observe-only events to avoid retry-driven double-firing; guard events still 500" — IMPLEMENT that split: handler errors on pure-observe routes (postToolUse-style) fail-open with `{}` + error logged; guard routes (preToolUse, beforeShellExecution) keep explicit error response. Verify the existing top-level catch (daemon.ts:845-863) and adjust.
  - Sync-I/O budget items: move `appendFileSync` (subagent-handlers.ts:120-132) off the hot path (queue to event-logger or setImmediate write); cache the `existsSync` check (tool-guard-handlers.ts:210) with a short TTL. Only these two — no broader I/O refactor.
  - Regression tests: response-shape tests per fixed handler (field names assert against the doc-derived table); no-op handler routes return 200 {}.

  **Must NOT do**:
  - No mass rename; no "fixing" fields the docs don't contradict
  - Do not alter deny LOGIC (what gets blocked) — only response shape
  - Do not touch the TodoWrite/activePlan logic in tool-guard-handlers (preserved + Task 9 domain)

  **Recommended Agent Profile**:
  - **Category**: `deep` — contract verification with authoritative-source discipline
  - **Skills**: none needed

  **Parallelization**: Wave 3, parallel with 15-19 (coordinate with 15 on safety-handlers.ts — 14 owns response shapes, 15 owns block-logging; both small, declare overlap). Blocks: 20. Blocked By: 8.

  **References**:
  - `docs/cursor/03-hooks.md` — THE authoritative response contract per event (read the actual event sections, not the audit summary)
  - `hooks/handlers/safety-handlers.ts:14-35, 74, 120, 190`; `hooks/handlers/tool-guard-handlers.ts:182-199, 210`
  - `hooks/hooks.json` — registration inventory; `hooks/daemon.ts:318-356, 764-776, 845-863` — routing, disabled-gate, error path
  - `hooks/handlers/subagent-handlers.ts:120-132` — sync append in 50ms budget
  - `docs/internal/hooks-experiments-runbook.md` — experiment evidence (e.g., 'ask' not enforced) to respect
  - Audit 9 full table

  **Acceptance Criteria**:
  - [ ] Verification table (line → documented contract → action taken) in task output, citing 03-hooks.md sections
  - [ ] Every hooks.json-registered event has a daemon route (200 on POST with minimal payload) or was deregistered with rationale
  - [ ] Response-shape tests pass

  **QA Scenarios**:
  ```
  Scenario: Every registered hook route answers 200
    Tool: Bash
    Preconditions: isolated daemon 28855
    Steps:
      1. jq -r 'keys[]' hooks/hooks.json (or the event list) → for each event, curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:28855/<event> -H "Content-Type: application/json" -d '{"conversation_id":"qa14"}'
      2. Collect status codes
    Expected Result: all 200 (no 404s for registered events)
    Failure Indicators: any 404/500 on a registered event with minimal payload
    Evidence: .omo/evidence/task-14-route-coverage.txt

  Scenario: Deny response uses the documented field (contract probe)
    Tool: Bash
    Preconditions: same daemon
    Steps:
      1. curl -s -X POST http://localhost:28855/beforeShellExecution -d '{"conversation_id":"qa14","command":"rm -rf /"}' -H "Content-Type: application/json" | jq .
      2. Assert the deny field name/value EXACTLY matches the table derived from 03-hooks.md (recorded in evidence)
    Expected Result: response matches documented contract byte-for-field
    Failure Indicators: legacy field still emitted where docs say otherwise
    Evidence: .omo/evidence/task-14-deny-shape.json

  Scenario: Observe-route handler error fails open (negative)
    Tool: Bash
    Preconditions: daemon with a test-only forced-error injection (env flag or malformed-but-parseable payload that triggers a handler throw on an observe route)
    Steps:
      1. Trigger the error; capture status + body
    Expected Result: 200 {} on observe route, error logged in daemon log; guard route still surfaces the error
    Evidence: .omo/evidence/task-14-fail-open-error.txt
  ```

  **Commit**: YES — `fix(handlers): align hook response fields to Cursor contract`; Files: `hooks/handlers/safety-handlers.ts`, `hooks/handlers/tool-guard-handlers.ts`, `hooks/handlers/subagent-handlers.ts`, `hooks/daemon.ts`, `hooks/hooks.json`, `docs/cursor/19-known-sharp-edges.md`, tests; Pre-commit: `cd hooks && bun test`

- [ ] 15. Security hardening (localhost token, CORS, perms, gated interactive_bash, logged blocks)

  **What to do** (scope-locked per Metis SC1 — token + cheap wins ONLY):
  - **Shared-secret token**: on daemon startup, generate (or read from user config `daemon.auth_token`) a random token; persist to a 0600 file (e.g., `~/.config/oh-my-cursor/daemon.token`); require header `X-OMC-Token` on all daemon endpoints EXCEPT `/health` and the hook-event routes called by Cursor's hooks runner — CHECK how Cursor's hooks.json invokes the daemon (can it send headers? read hooks.json/start scripts): if hook routes can't carry headers, scope the token to the diagnostic/sensitive routes (`/session-log*`, `/config*`, `/status`, `/shutdown`, `/metrics`, `/dashboard`, `/agentHistory`, `/backgroundTasks`) — these are the data-exfil surface. Document the decision.
  - Wire the token into legitimate clients: MCP sidecar tools that call the daemon (`session-log.ts` etc. read the token file), install scripts' `/shutdown` curl calls (read token file).
  - **CORS**: remove `Access-Control-Allow-Origin: *` (daemon.ts:142-146). No CORS headers at all (the dashboard is served same-origin from the daemon — verify by reading the dashboard fetch paths; if same-origin, browsers need no CORS).
  - **File permissions**: 0600 on state files, event logs, daemon logs, token file; 0700 on their dirs (state-persistence mkdir, event-logger logDir, /tmp state dir). Use atomic-file `mode` option from Task 1.
  - **Gate interactive_bash**: require config opt-in `mcp.interactive_bash_enabled` (default TRUE to avoid breaking existing users, but token-gate the sidecar /mcp route the same way IF the MCP client (Cursor) can send headers — read mcp.json format docs; if not, leave sidecar localhost-only and document the residual risk in sharp-edges).
  - **Log blocked commands**: safety-handlers + tool-guard denials → `logEvent({action: "blocked", ...})` with the command (secret-redacted via existing secret-redactor).
  - Document known shell-blocklist bypasses in `docs/cursor/19-known-sharp-edges.md` (DO NOT expand the blocklist — Metis SC3).
  - Regression tests: token required on protected routes (401 without), health open, perms asserted via stat in tests where portable.

  **Must NOT do**:
  - NO OAuth/per-tool authz/rate limiting/session frameworks
  - NO blocklist pattern additions
  - NO breaking Cursor's hook calls (verify header capability BEFORE scoping the token)
  - Do not break the dashboard (it must still load served same-origin)

  **Recommended Agent Profile**:
  - **Category**: `deep` — security change with compatibility constraints
  - **Skills**: none needed

  **Parallelization**: Wave 3, parallel with 14, 16-19 (overlap with 14 on safety-handlers.ts — 15 adds logging lines only). Blocks: 20. Blocked By: 6.

  **References**:
  - `hooks/daemon.ts:142-146 (CORS), :360-864 (routes), :567-584 (existing HMAC webhook pattern to imitate)`
  - `hooks/event-logger.ts:79`; `hooks/state-persistence.ts:6,32`; `hooks/mcp/tools/daemon-logs.ts:21` — perm targets
  - `hooks/mcp/tools/session-log.ts:43-151` — daemon-calling client to carry token
  - `hooks/secret-redactor.ts` — redaction to apply to block logs
  - `install.sh:147,184,205,232,254` — curl callers needing the token
  - `hooks/hooks.json` + `hooks/scripts/start-daemon.sh` — determine whether hook calls can carry headers
  - Audit 7 full table; Metis SC1 scope limit

  **Acceptance Criteria**:
  - [ ] `curl /session-log` without token → 401; with token → 200; `/health` → 200 tokenless
  - [ ] `stat -c %a` on a fresh state file and log file → 600
  - [ ] No `Access-Control-Allow-Origin` header in any response
  - [ ] Blocked command produces a `blocked` event in the session log

  **QA Scenarios**:
  ```
  Scenario: Token gates the exfil surface
    Tool: Bash
    Preconditions: isolated daemon 28856 with token configured
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}\n" http://localhost:28856/session-log → expect 401
      2. TOKEN=$(cat <token file>); curl -s -o /dev/null -w "%{http_code}\n" -H "X-OMC-Token: $TOKEN" http://localhost:28856/session-log → expect 200
      3. curl -s -o /dev/null -w "%{http_code}\n" http://localhost:28856/health → expect 200
      4. curl -sI http://localhost:28856/health | grep -ci "access-control-allow-origin" → expect 0
    Expected Result: 401 / 200 / 200 / 0
    Failure Indicators: tokenless 200 on /session-log; CORS header present
    Evidence: .omo/evidence/task-15-token-cors.txt

  Scenario: Hook routes still work for Cursor (no auth regression)
    Tool: Bash
    Preconditions: same daemon
    Steps:
      1. curl -s -X POST http://localhost:28856/preToolUse -H "Content-Type: application/json" -d '{"conversation_id":"qa15","tool":"Read"}' -o /dev/null -w "%{http_code}\n" (NO token header)
    Expected Result: 200 — hook ingestion unaffected
    Failure Indicators: 401 on hook routes (would break all of Cursor)
    Evidence: .omo/evidence/task-15-hooks-open-error.txt

  Scenario: Blocked command is audit-logged
    Tool: Bash
    Preconditions: same daemon
    Steps:
      1. POST /beforeShellExecution with command "rm -rf /" for qa15
      2. With token: GET /session-log?limit=20 | jq '[.[] | select(.action=="blocked")] | length' → ≥ 1
      3. stat -c "%a" on the session log file → 600
    Expected Result: deny is logged with redaction; perms 600
    Evidence: .omo/evidence/task-15-block-logged.txt
  ```

  **Commit**: YES — `feat(daemon): localhost token auth, strict CORS, 0600 perms, gated interactive_bash`; Files: `hooks/daemon.ts`, `hooks/event-logger.ts`, `hooks/state-persistence.ts`, `hooks/handlers/safety-handlers.ts`, `hooks/mcp/tools/session-log.ts`, `hooks/mcp-sidecar.ts`, `hooks/schemas/config.ts`, `config.default.jsonc`, `install.sh`, `install.ps1`, `docs/cursor/19-known-sharp-edges.md`, tests; Pre-commit: `cd hooks && bun test`

- [ ] 16. Installer parity: test-file exclusion, Windows config seeding, port templating, fatal start

  **What to do**:
  - **Test-file exclusion (BOTH installers)**: the copy step (`install.sh:~488`, `install.ps1:~573`) copies `hooks/` wholesale — exclude `*.test.ts` (and any `__tests__`/fixtures dirs found). bash: rsync `--exclude='*.test.ts'` or find+cp; PowerShell: `Get-ChildItem -Recurse -Exclude` carefully (note: -Exclude with -Recurse is shallow — use a Where-Object filter on FullName).
  - **Windows config seeding parity**: port install.sh's `seed_user_config` (lines ~544-566) to install.ps1 — copy `config.default.jsonc` to the user config location IF absent (find the correct Windows path convention by reading how the daemon resolves user config on Windows — `hooks/config.ts` HOME handling — and match it; if config.ts only handles `$HOME/.config`, ensure that path resolution works on Windows or fix config.ts path resolution in the same task and document).
  - **mcp.json port templating**: at install time, write the actual MCP port (from env/config, default 27848) into the installed mcp.json registration instead of relying on the hardcoded value; both installers.
  - **Fatal fresh-install daemon failure**: on FRESH install (no prior version file), a failed daemon start aborts the install with a clear error (no silent version skew); on UPDATE, keep non-fatal but print a loud warning including the running daemon's version vs installed version if obtainable.
  - QA both installers (bash live; PowerShell via `pwsh` if available, else static lint `pwsh -NoProfile -Command "Get-Command -Syntax"`-style parse check + careful review — document which level was achieved).

  **Must NOT do**:
  - Do not restructure installer flow; minimal surgical edits
  - Do not change what NON-test files ship
  - Do not remove the `--skip-dashboard-build` flag; just add the stale-dist warning (echo) when used

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — dual-platform script work with verification limits
  - **Skills**: none needed

  **Parallelization**: Wave 3, parallel with 14, 15, 17-19 (overlap with 15 on install scripts — 15 adds token to curl calls; declare and sequence within wave). Blocks: none. Blocked By: 5.

  **References**:
  - `install.sh:488 (copy dirs), :511, 544-566 (seed_user_config), :142-217 (stop), :600-628 (dashboard build), :825 (start)`
  - `install.ps1:573 (copy dirs), :148-193 (stop), :451-488 (build), :793 (start), :596 (version file)`
  - `hooks/config.ts` — user config path resolution (Windows correctness check)
  - `mcp.json:14` — hardcoded port
  - Audit 8 full table; Task 5 root-cause (exclusion is defense-in-depth for the echo leak)

  **Acceptance Criteria**:
  - [ ] Install to a sandbox prefix → `find <installed hooks dir> -name "*.test.ts" | wc -l` = 0 AND non-test file count matches source non-test count
  - [ ] install.ps1 contains a seed-config function called in the install path (verified by pwsh parse or execution)
  - [ ] Installed mcp.json contains the templated port
  - [ ] Fresh-install with daemon start forced to fail (e.g., port squatted) exits nonzero with clear message

  **QA Scenarios**:
  ```
  Scenario: Installed tree ships zero test files
    Tool: Bash
    Preconditions: sandbox HOME (HOME=/tmp/omc-qa-16 bash install.sh ... or the installer's prefix override — read installer flags first)
    Steps:
      1. Run install.sh into sandbox (skip dashboard build for speed)
      2. find /tmp/omc-qa-16 -path "*oh-my-cursor*" -name "*.test.ts" | wc -l → 0
      3. Compare non-test .ts counts source vs installed → equal
      4. grep the installed mcp.json for the port → matches env/default
    Expected Result: 0 test files; counts match; port templated
    Failure Indicators: any test file installed; missing production file (over-exclusion)
    Evidence: .omo/evidence/task-16-install-tree.txt

  Scenario: Fresh-install failure is fatal (negative)
    Tool: Bash
    Preconditions: sandbox HOME; squat the daemon port with `nc -l 28847 &` (or python http.server) and force installer to use it
    Steps:
      1. Run installer fresh with the squatted port; capture exit code + stderr
    Expected Result: nonzero exit, message names the daemon start failure
    Failure Indicators: exit 0 with broken daemon (silent skew)
    Evidence: .omo/evidence/task-16-fatal-start-error.txt

  Scenario: PowerShell installer parses and seeds config
    Tool: Bash
    Preconditions: pwsh available (check `command -v pwsh`; if absent, document + static review evidence instead)
    Steps:
      1. pwsh -NoProfile -Command '$ErrorActionPreference="Stop"; . ./install.ps1 -WhatIf' or at minimum: pwsh -NoProfile -Command '[scriptblock]::Create((Get-Content -Raw install.ps1)) | Out-Null; "PARSE-OK"'
      2. grep -n "seed" install.ps1 — function exists and is invoked
    Expected Result: PARSE-OK; seeding present in install flow
    Evidence: .omo/evidence/task-16-ps1.txt
  ```

  **Commit**: YES — `fix(install): test-file exclusion, Windows config seeding, port templating`; Files: `install.sh`, `install.ps1`, `mcp.json` (if templated source changes), possibly `hooks/config.ts`; Pre-commit: `bash -n install.sh` + pwsh parse check

- [ ] 17. Prompt-surface reference fixes (verify-then-fix each)

  **What to do** (each item: VERIFY the audit claim, then fix or close as false positive):
  - `commands/best-of-n.md:18` — `best-of-n-runner` agent: confirm `agents/` has no such file. Fix by either mapping to an existing agent that fulfills the role (read the command's intent — likely `sisyphus-junior` or `general` dispatch) or rewriting the command to not name a nonexistent subagent_type. Do NOT create a new agent.
  - `agents/librarian.md` context7 references — PROBABLE FALSE POSITIVE: `mcp.json` registers context7 (`https://mcp.context7.com/mcp`). Verify the tool naming the librarian uses matches how Cursor exposes that server's tools. If reachable/valid → close, no change. If the naming is wrong → align the prompt to actual tool names.
  - `agents/atlas.md:203` dev-browser vs playwright: read both `skills/dev-browser/SKILL.md` and `skills/playwright/SKILL.md`; write ONE clarifying sentence in atlas.md choosing the right one per their actual capabilities (or legitimately keep "either" with a use-case split).
  - Stale `../oh-my-openagent-original/` refs (`agents/prometheus.md:~1138-1141`, `commands/plan.md:~3`): confirm the directory doesn't exist; remove the references (they're informational dead links) — CAREFUL: plan.md contains preserved Write-over-CreatePlan anchors; touch ONLY the stale-ref lines (verify against Task 3 inventory).
  - `rules/orchestrator.mdc` routing table: add `multimodal-looker` row (read agents/multimodal-looker.md for its purpose first).
  - `automations/README.md:139`: one clarifying sentence — cloud agents don't read `.cursor/rules/`.

  **Must NOT do**:
  - No new agents, no behavior redesigns — reference repair only
  - Byte-identical preserved anchors (Task 3 inventory check before commit)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low` — multiple tiny verified edits
  - **Skills**: none needed

  **Parallelization**: Wave 3, parallel with 14-16, 18, 19. Blocks: 21. Blocked By: 3.

  **References**:
  - Audit 10 items with file:lines (verify each — explorer had false positives)
  - `mcp.json` — context7 IS registered (the false-positive evidence)
  - `docs/internal/preserved-behaviors.md` — anchors that MUST survive plan.md/prometheus.md edits
  - `skills/dev-browser/SKILL.md`, `skills/playwright/SKILL.md`, `agents/multimodal-looker.md`

  **Acceptance Criteria**:
  - [ ] Per-item verification table (claim → verified true/false → action) in task output
  - [ ] `grep -rn "best-of-n-runner" commands/ agents/ rules/` → 0 (or only as a documented alias to a real agent)
  - [ ] `grep -rn "oh-my-openagent-original" .` (excl. node_modules/dist/.git) → 0
  - [ ] Anchor re-verification passes (every Task 3 quote still greps)

  **QA Scenarios**:
  ```
  Scenario: No dangling references remain
    Tool: Bash
    Preconditions: edits applied
    Steps:
      1. grep -rn "best-of-n-runner\|oh-my-openagent-original" --include="*.md" --include="*.mdc" . | grep -v node_modules | grep -v "^./dist" | tee /mnt/development/oh-my-cursor/.omo/evidence/task-17-dangling.txt
      2. For every subagent_type named in commands/*.md: assert a matching agents/<name>.md exists (scripted loop)
    Expected Result: zero dangling refs; all named agents exist
    Failure Indicators: any orphan reference
    Evidence: .omo/evidence/task-17-dangling.txt

  Scenario: Preserved anchors byte-identical (negative)
    Tool: Bash
    Preconditions: Task 3 doc exists
    Steps:
      1. Re-run the Task 3 anchor grep loop against current files
      2. git diff commands/plan.md | grep -E "^[-+].*CreatePlan" → empty
    Expected Result: 100% anchors intact
    Evidence: .omo/evidence/task-17-anchors-error.txt
  ```

  **Commit**: YES — `fix(prompts): repair broken references in commands/agents/rules`; Files: `commands/best-of-n.md`, `agents/atlas.md`, `agents/prometheus.md`, `commands/plan.md`, `rules/orchestrator.mdc`, `automations/README.md`, possibly `agents/librarian.md`; Pre-commit: anchor grep loop

- [ ] 18. Worktree docs-to-reality + notepad path validation

  **What to do** (docs-alignment ONLY — Metis SC5: no worktree feature implementation):
  - `commands/start-work.md` (~lines 46-54): the `worktree_path`/boulder.json claims describe unimplemented behavior. Verify nothing in hooks/ reads `worktree_path` (grep). Rewrite that section to describe what ACTUALLY happens, and mark worktree execution as a manual workflow (reference `commands/worktree.md`), removing the implication that the hook system tracks it.
  - `worktrees.json` at repo root: confirm nothing consumes it at runtime (grep source, not dist). It's Cursor's native worktree-setup config (per Cursor docs in docs/cursor/ — verify before deciding!). If it IS a Cursor-native file that Cursor itself reads for worktree setup → KEEP it and instead document its purpose in README/ARCHITECTURE (the audit may have misjudged "dead code"). If genuinely dead → remove it and its installer copy steps. Record the determination.
  - **Notepad path validation** (`hooks/handlers/sisyphus-junior-notepad.ts:14-15`): before deriving notepad paths from `activePlan.path`, validate the plan file exists relative to the daemon's project root (`existsSync(join(projectRoot, activePlan.path))`); if missing (wrong cwd/branch context), log + skip notepad creation rather than fragment state into the wrong directory.
  - Regression test for the notepad guard (missing plan file → no notepad dir created, warning logged).

  **Must NOT do**:
  - Do not implement worktree_path tracking, branch detection, or cwd switching (feature work — excluded)
  - Do not delete worktrees.json without the Cursor-native-file determination

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — docs surgery + one code guard, with a genuine verify decision
  - **Skills**: none needed

  **Parallelization**: Wave 3, parallel with 14-17, 19. Blocks: none. Blocked By: 9, 10.

  **References**:
  - `commands/start-work.md:46-54` — worktree_path claims; `commands/worktree.md` — manual workflow doc
  - `worktrees.json` + `install.sh:501` + `install.ps1:587` — copy steps; docs/cursor/ — search for Cursor-native worktree config documentation
  - `hooks/handlers/sisyphus-junior-notepad.ts:14-15` — unvalidated path derivation
  - Audit 2 BUG#4, #5, #6

  **Acceptance Criteria**:
  - [ ] `grep -rn "worktree_path" hooks/` → 0 matches in code; start-work.md no longer claims hook-side tracking
  - [ ] worktrees.json determination documented (kept-with-docs or removed-with-installer-cleanup)
  - [ ] Notepad guard test passes

  **QA Scenarios**:
  ```
  Scenario: Notepad refuses to fragment state
    Tool: Bash
    Preconditions: unit test env
    Steps:
      1. cd hooks && bun test handlers/sisyphus-junior-notepad.test.ts — includes new test: activePlan.path points at a nonexistent file → handler returns without creating dirs, logs warning
    Expected Result: no notepad dir created for missing plan
    Failure Indicators: dir created in wrong location
    Evidence: .omo/evidence/task-18-notepad-guard.txt

  Scenario: Docs match implementation (grep proof)
    Tool: Bash
    Preconditions: edits applied
    Steps:
      1. grep -n "worktree_path" commands/start-work.md → only in honest "not tracked by hooks" phrasing or absent
      2. grep -rn "worktree" hooks/ --include="*.ts" | grep -v test | tee evidence — confirm no phantom feature references remain
    Expected Result: docs describe reality
    Evidence: .omo/evidence/task-18-docs-error.txt
  ```

  **Commit**: YES — `docs(worktree): align worktree docs to implementation, validate notepad paths`; Files: `commands/start-work.md`, `worktrees.json` (maybe), `install.sh`/`install.ps1` (maybe), `hooks/handlers/sisyphus-junior-notepad.ts`, test; Pre-commit: `cd hooks && bun test`

- [ ] 19. Docs drift + swallowed-error logging

  **What to do**:
  - README.md:51 — correct to actual counts (recount at execution time: wired events from hooks/hooks.json, handler files from hooks/handlers/*.ts excluding tests; don't trust the audit's numbers blindly).
  - `docs/cursor/03-hooks.md:17` — update "18 of 21" to the recounted wired number; keep consistent with `docs/cursor/18-adoption-matrix.md`.
  - Swallowed errors → add logging (keep behavior non-fatal): `hooks/handlers/continuation-handlers.ts:20-22` (notification spawn failure → console.error once), `hooks/handlers/tool-guard-handlers.ts:405` (log at debug level with path), `hooks/daemon.ts:213-219` (MDC cleanup failure → console.error).
  - Sharp-edges entry for `OH_MY_CURSOR_DISABLED_HOOKS` env-change-requires-restart (30s TTL reads config file only) — Metis EC6.

  **Must NOT do**:
  - No doc rewrites beyond the drifted claims; no error-handling redesign (logging only)

  **Recommended Agent Profile**:
  - **Category**: `quick` — counted corrections + three log lines
  - **Skills**: none needed

  **Parallelization**: Wave 3, parallel with 14-18 (tiny overlap with 8/9 on continuation-handlers.ts line 20 — additive single line, declare). Blocks: none. Blocked By: none.

  **References**:
  - `README.md:51`; `docs/cursor/03-hooks.md:17`; `docs/cursor/18-adoption-matrix.md:10`
  - `hooks/hooks.json` — source of truth for the recount
  - The three swallowed-error sites (Audit 4)

  **Acceptance Criteria**:
  - [ ] README/hook-doc counts match a scripted recount (jq keys length on hooks.json; ls count on handlers)
  - [ ] Three error sites log (grep shows console.error/log-call inside the formerly-empty catches)

  **QA Scenarios**:
  ```
  Scenario: Counts are script-verified
    Tool: Bash
    Preconditions: edits applied
    Steps:
      1. WIRED=$(jq -r '.hooks | keys | length' hooks/hooks.json 2>/dev/null || <correct jq path per actual schema>); HANDLERS=$(ls hooks/handlers/*.ts | grep -vc test)
      2. grep -o "[0-9]* hook events" README.md; grep -o "[0-9]* of 21" docs/cursor/03-hooks.md
      3. Assert doc numbers equal recount
    Expected Result: numbers consistent across hooks.json, README, 03-hooks, adoption matrix
    Failure Indicators: any count mismatch
    Evidence: .omo/evidence/task-19-counts.txt

  Scenario: Swallowed errors now visible (negative path)
    Tool: Bash
    Preconditions: unit test or isolated daemon
    Steps:
      1. Trigger MDC-cleanup failure (make .cursor/rules/oh-my-cursor-context.mdc an unremovable dir in a sandbox project) and start daemon → daemon log contains the new error line
    Expected Result: failure logged, daemon still starts
    Evidence: .omo/evidence/task-19-logged-error.txt
  ```

  **Commit**: YES — `docs: correct hook/handler counts, log swallowed errors`; Files: `README.md`, `docs/cursor/03-hooks.md`, `hooks/handlers/continuation-handlers.ts`, `hooks/handlers/tool-guard-handlers.ts`, `hooks/daemon.ts`, `docs/cursor/19-known-sharp-edges.md`; Pre-commit: `cd hooks && bun test`

- [ ] 20. Test files for conversation-handlers and safety-handlers

  **What to do**:
  - Create `hooks/handlers/conversation-handlers.test.ts`: cover sessionStart/sessionEnd lifecycle (conversation created/deleted), snapshot/status reporting, rehydration interaction (post-Task 8: collector cleared), fallback conversation-id path. Follow the existing test pattern (factory call + direct handler invocation with synthetic payloads — copy structure from `tool-guard-handlers.test.ts`).
  - Create `hooks/handlers/safety-handlers.test.ts`: each blocked pattern denies with the CONTRACT-CORRECT field (post-Task 14 shapes); benign commands allow; blocked attempts produce `blocked` log events (post-Task 15); the documented bypass examples (chaining etc.) are intentionally NOT blocked — assert current behavior to lock it (documents the boundary; prevents accidental blocklist expansion).
  - Both files must use isolated state (no live ports, temp dirs), per the repo's existing test conventions.

  **Must NOT do**:
  - No testing of unmodified third modules (wisdom-tracker stays untested — out of scope)
  - No new test helpers/frameworks beyond what existing tests use

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — substantial test authoring against fresh code
  - **Skills**: none needed

  **Parallelization**: Wave 4, parallel with 21. Blocks: 22. Blocked By: 8, 13, 14, 15.

  **References**:
  - `hooks/handlers/tool-guard-handlers.test.ts` — canonical test structure to copy
  - `hooks/handlers/conversation-handlers.ts`, `hooks/handlers/safety-handlers.ts` — as modified by Tasks 2, 8, 14, 15
  - Task 14's verification table — the authoritative expected response shapes

  **Acceptance Criteria**:
  - [ ] Both files exist; `bun test handlers/conversation-handlers.test.ts handlers/safety-handlers.test.ts` → ≥10 tests total, 0 failures
  - [ ] Full suite still 0 failures

  **QA Scenarios**:
  ```
  Scenario: New suites pass and raise coverage
    Tool: Bash
    Preconditions: tasks 8/13/14/15 merged
    Steps:
      1. cd hooks && bun test handlers/conversation-handlers.test.ts handlers/safety-handlers.test.ts 2>&1 | tee /mnt/development/oh-my-cursor/.omo/evidence/task-20-new-tests.txt
      2. bun test 2>&1 | tail -3
    Expected Result: all pass; total test count strictly greater than the Task 2 baseline count
    Failure Indicators: failures; flaky port collisions (must use isolated ports)
    Evidence: .omo/evidence/task-20-new-tests.txt

  Scenario: Deny-shape locked (regression tripwire)
    Tool: Bash
    Preconditions: same
    Steps:
      1. Temporarily revert one Task-14 field fix in a scratch branch; run safety tests → must FAIL; restore
    Expected Result: tests actually guard the contract (fail on regression)
    Evidence: .omo/evidence/task-20-tripwire-error.txt
  ```

  **Commit**: YES — `test(handlers): cover conversation and safety handlers`; Files: the two test files; Pre-commit: `cd hooks && bun test`

- [ ] 21. Drift-guard test locking rule-surface consistency

  **What to do**:
  - Create `hooks/drift-guard.test.ts` (pure file-content assertions, no daemon):
    1. **Write-over-CreatePlan presence**: each of the 5 surfaces (from `docs/internal/preserved-behaviors.md`) contains its distinctive enforcement phrase.
    2. **Auto-continue coherence**: `agents/atlas.md` — every "do not auto-continue"-style passage contains a Final-Wave scoping qualifier; the auto-continue-mandatory section names the exception (string-level assertions on the Task 4 wording).
    3. **Momus phrasing**: the standardized sentence appears identically in `commands/plan.md` and `agents/prometheus.md`.
    4. **Agent references resolve**: every `subagent_type="X"` mentioned in commands/*.md and rules/*.mdc has a matching `agents/X.md`.
    5. **Explicit-todos anchors**: the Task 3 todos anchors still grep true.
    6. **Doc counts**: README hook-event number equals `hooks/hooks.json` key count (locks Task 19).
  - Keep assertions resilient (distinctive substrings, not full-line matches) so innocent rewording elsewhere doesn't false-alarm.

  **Must NOT do**:
  - No network, no daemon spawning — pure fs reads
  - No assertions on file line NUMBERS (content anchors only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — meta-test design needing judgment on assertion brittleness
  - **Skills**: none needed

  **Parallelization**: Wave 4, parallel with 20. Blocks: 22. Blocked By: 4, 17.

  **References**:
  - `docs/internal/preserved-behaviors.md` (Task 3) — anchor inventory to assert
  - Task 4's final wording; Task 17's reference-fix outcomes
  - `hooks/hooks.json`, `README.md` — count lock
  - Audit 3 next-steps recommendation (drift-guard quarterly check → now a permanent test)

  **Acceptance Criteria**:
  - [ ] `bun test drift-guard.test.ts` → ≥6 assertions, all pass
  - [ ] Mutation check: temporarily removing the CreatePlan prohibition line from prometheus-plan-brief.mdc makes the test FAIL (then restore)

  **QA Scenarios**:
  ```
  Scenario: Drift-guard passes on healthy tree
    Tool: Bash
    Preconditions: tasks 4, 17, 19 merged
    Steps:
      1. cd hooks && bun test drift-guard.test.ts 2>&1 | tee /mnt/development/oh-my-cursor/.omo/evidence/task-21-driftguard.txt
    Expected Result: all assertions pass
    Evidence: .omo/evidence/task-21-driftguard.txt

  Scenario: Drift-guard catches anchor removal (mutation, negative)
    Tool: Bash
    Preconditions: clean git status
    Steps:
      1. sed -i a temporary deletion of the CreatePlan-prohibition line in rules/prometheus-plan-brief.mdc
      2. bun test drift-guard.test.ts → expect FAILURE
      3. git checkout -- rules/prometheus-plan-brief.mdc; re-run → pass
    Expected Result: failure on mutation, pass after restore
    Failure Indicators: test passes with the anchor removed (toothless guard)
    Evidence: .omo/evidence/task-21-mutation-error.txt
  ```

  **Commit**: YES — `test(rules): drift-guard for rule-surface consistency`; Files: `hooks/drift-guard.test.ts`; Pre-commit: `cd hooks && bun test drift-guard.test.ts`

- [ ] 22. Full-suite verification + CHANGELOG

  **What to do**:
  - Run `cd hooks && bun test` (full) and `npx tsc --noEmit`; diff tsc output against the Task 2 baseline — ZERO new errors (pre-existing daemon.test/dashboard errors tolerated per AGENTS.md).
  - Run the four Success Criteria verification commands from this plan; capture outputs.
  - Add CHANGELOG.md entry (next minor version per repo convention — read CHANGELOG header format): summarize the remediation (context single-delivery, daemon singleton, zombie fix, atomic persistence + state-key migration note, contract alignment, security hardening incl. NEW token file location, installer fixes incl. test-file exclusion, doc corrections). Mention the state-file migration is automatic (grace path).
  - Update AGENTS.md ONLY if a test command or convention changed (e.g., token file existence for QA) — minimal.

  **Must NOT do**:
  - No fixes here — if anything fails, report back to the owning task (Atlas re-dispatches); this task only verifies and documents

  **Recommended Agent Profile**:
  - **Category**: `quick` — run, compare, document
  - **Skills**: none needed

  **Parallelization**: Wave 4, AFTER 20 and 21. Blocks: F1-F4. Blocked By: 20, 21.

  **References**:
  - `.omo/evidence/task-2-tsc-baseline.txt` — comparison base
  - `CHANGELOG.md` — entry format (e.g., 0.7.0 entry style)
  - Plan Success Criteria section — the command list

  **Acceptance Criteria**:
  - [ ] Full suite 0 failures; tsc no new errors (diff attached)
  - [ ] CHANGELOG entry exists, mentions migration + token
  - [ ] All Success Criteria commands output as expected

  **QA Scenarios**:
  ```
  Scenario: Green board
    Tool: Bash
    Preconditions: all tasks 1-21 merged
    Steps:
      1. cd hooks && bun test 2>&1 | tee /mnt/development/oh-my-cursor/.omo/evidence/task-22-full-suite.txt
      2. npx tsc --noEmit 2>&1 | diff /mnt/development/oh-my-cursor/.omo/evidence/task-2-tsc-baseline.txt - | tee /mnt/development/oh-my-cursor/.omo/evidence/task-22-tsc-diff.txt (expect: only REMOVED error lines)
      3. Run the 4 Success Criteria commands; append outputs
    Expected Result: 0 failures; tsc diff shows only removals; criteria pass
    Failure Indicators: any new tsc error line; test failure
    Evidence: .omo/evidence/task-22-full-suite.txt

  Scenario: CHANGELOG entry well-formed
    Tool: Bash
    Preconditions: entry written
    Steps:
      1. head -40 CHANGELOG.md — new version header matches existing format (compare to 0.7.0 entry); contains "migration" and "token"
    Expected Result: format-consistent entry
    Evidence: .omo/evidence/task-22-changelog-error.txt
  ```

  **Commit**: YES — `chore: changelog for audit remediation`; Files: `CHANGELOG.md`, possibly `AGENTS.md`; Pre-commit: `cd hooks && bun test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> Do NOT auto-proceed after verification. Never mark F1-F4 checked before user okay. Rejection/feedback → fix → re-run → present again → wait for okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read this plan end-to-end. For each "Must Have": verify implementation exists (read file, curl test-port daemon, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Specifically re-verify the preserved-behavior anchors from `docs/internal/preserved-behaviors.md` are byte-identical (except where Task 4/17 intentionally edited adjacent text). Check evidence files exist in `.omo/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cd hooks && npx tsc --noEmit` (compare to baseline from Task 22 — no new errors) + `cd hooks && bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches (the fixed ones must now log), console.log noise, commented-out code, unused imports, AI slop (over-abstraction, generic names, mutex-where-unneeded).
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state (fresh test-port daemon, empty `/tmp/omc-qa-final` state dir). Execute EVERY QA scenario from EVERY task — exact steps, capture evidence to `.omo/evidence/final-qa/`. Then integration: full lifecycle (start daemon → submit prompts → set plan → stop-continuation → restart daemon → verify no zombie, no duplicate context, single daemon). Edge cases: concurrent daemon starts (3 simultaneous), corrupted state file recovery, missing config.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git diff per task commits). Verify 1:1 — everything specified was built, nothing beyond spec. Check "Must NOT do" compliance per task. Detect cross-task contamination (task N touching task M's files outside declared overlap). Confirm out-of-scope follow-ups (contextHistory growth, orphan state, multi-window) were NOT implemented.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

One commit per task (or declared group), conventional commits, pre-commit gate = `cd hooks && bun test` for any task touching hooks/:
- **1**: `feat(hooks): add atomic temp+rename file write utility`
- **2**: `fix(hooks): resolve BackgroundTracker type error in conversation-handlers`
- **3**: `docs(internal): inventory preserved-behavior anchors`
- **4**: `fix(agents): scope atlas auto-continue policy to non-final waves`
- **5**: `fix(hooks): isolate mcp-sidecar test harness from live ports`
- **6**: `fix(daemon): per-project singleton lock, eliminate startup races`
- **7**: `fix(hooks): flush event logger on shutdown, correct buffer trim`
- **8**: `fix(hooks): deliver context once — drop dual-channel return, wire consume()`
- **9**: `fix(hooks): atomically clear activePlan+boulderState with write-through`
- **10**: `fix(hooks): atomic state persistence + project-scoped state keys`
- **11**: `fix(hooks): serialize agent-history writes` (or `chore` if false positive)
- **12**: `fix(hooks): single-flight config caches, atomic port files`
- **13**: `fix(hooks): deterministic context ordering, iteration-safe collections`
- **14**: `fix(handlers): align hook response fields to Cursor contract`
- **15**: `feat(daemon): localhost token auth, strict CORS, 0600 perms, gated interactive_bash`
- **16**: `fix(install): test-file exclusion, Windows config seeding, port templating`
- **17**: `fix(prompts): repair broken references in commands/agents/rules`
- **18**: `docs(worktree): align worktree docs to implementation, validate notepad paths`
- **19**: `docs: correct hook/handler counts, log swallowed errors`
- **20**: `test(handlers): cover conversation and safety handlers`
- **21**: `test(rules): drift-guard for rule-surface consistency`
- **22**: `chore: changelog for audit remediation`

---

## Success Criteria

### Verification Commands
```bash
cd hooks && bun test                      # Expected: 0 failures
cd hooks && npx tsc --noEmit 2>&1 | grep conversation-handlers  # Expected: no output
find ~/.cursor -path "*oh-my-cursor*" -name "*.test.ts" | wc -l # Expected: 0 (after reinstall QA)
grep -rn "NEVER use" rules/prometheus-plan-brief.mdc  # Expected: CreatePlan prohibition still present (preserved)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass, no new tsc errors
- [ ] F1-F4 all APPROVE
- [ ] User gave explicit okay
