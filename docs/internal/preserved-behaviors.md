# Preserved Behaviors — Exact Anchors

**⚠️ CRITICAL:** Tasks 4, 8, 9, 13, 14, 17, 21 touch adjacent files — these anchors **MUST be byte-identical** after each task. Do NOT modify any anchored lines without explicit user approval.

---

## 1. Write-over-CreatePlan Behavior

**Rationale:** Plans created with Cursor's native `CreatePlan` tool store at `cursor-plan://` URIs invisible to `/start-work` and Atlas. This breaks the entire downstream execution flow. Plans MUST be written with the `Write` tool to `.cursor/plans/<name>.plan.md` on disk.

### Anchor 1: prometheus-plan-brief.mdc:69

**File:** `rules/prometheus-plan-brief.mdc`  
**Line:** 69  
**Verbatim quote:**
```
NEVER use `CreatePlan` / `cursor.create_plan` / Cursor's native plan tool. `CreatePlan` stores plans at virtual `cursor-plan://plan/{uuid}.plan.md` URIs that `/start-work` and Atlas cannot read. Using it breaks the entire downstream execution flow.
```
**Why preserved:** Foundational rule preventing plan creation via native tool; blocks entire execution pipeline if violated.

---

### Anchor 2: agent-tool-restrictions.mdc:40

**File:** `rules/agent-tool-restrictions.mdc`  
**Line:** 40  
**Verbatim quote:**
```
  - **Forbidden:** Write (non-.md), Shell (implementation), StrReplace (source code), Task(worker/coordinator agents), CreatePlan
```
**Why preserved:** Explicit tool restriction in Plan mode; prevents CreatePlan dispatch.

---

### Anchor 3: agent-tool-restrictions.mdc:67

**File:** `rules/agent-tool-restrictions.mdc`  
**Line:** 67  
**Verbatim quote:**
```
- **Forbidden:** Write (non-.md files), Shell (implementation commands), StrReplace (source code), Task (sub-agent dispatch), CreatePlan
```
**Why preserved:** Explicit tool restriction for Planner Agents (prometheus as subagent); prevents CreatePlan dispatch.

---

### Anchor 4: plan.md:187

**File:** `commands/plan.md`  
**Line:** 187  
**Verbatim quote:**
```
> Use the `Write` tool. **DO NOT** use `CreatePlan` / `cursor.create_plan` / the native plan tool. Plans MUST land at `.cursor/plans/<slug>.plan.md` on disk so `/start-work` and Atlas can read them. The native tool stores plans at `cursor-plan://` URIs invisible to downstream tools.
```
**Why preserved:** Explicit user-facing instruction in `/plan` command; prevents CreatePlan misuse.

---

### Anchor 5: start-work.md:19

**File:** `commands/start-work.md`  
**Line:** 19  
**Verbatim quote:**
```
> No plan files found at `.cursor/plans/*.plan.md`. If you just ran `/plan` and saw the model emit a "create plan" tool call, it likely used Cursor's native `CreatePlan` (which stores plans at `cursor-plan://` URIs invisible to `/start-work`). Re-run `/plan` and verify the model uses `Write` to `.cursor/plans/<slug>.plan.md`. See `docs/cursor/19-known-sharp-edges.md` for context.
```
**Why preserved:** Diagnostic message in `/start-work` Step 1; guides user recovery when CreatePlan is misused.

---

### Anchor 6: 19-known-sharp-edges.md:101

**File:** `docs/cursor/19-known-sharp-edges.md`  
**Line:** 101  
**Verbatim quote:**
```
- **Non-deterministic placement:** `CreatePlan` sometimes writes to `~/.cursor/plans/` (user-level) and sometimes to `.cursor/plans/` (workspace-level). Workflows that expect plans at a fixed workspace-relative path cannot rely on `CreatePlan`. [repro-local]
```
**Why preserved:** Documents CreatePlan non-determinism; justifies Write-only approach.

---

### Anchor 7: 19-known-sharp-edges.md:102

**File:** `docs/cursor/19-known-sharp-edges.md`  
**Line:** 102  
**Verbatim quote:**
```
- **No hook events:** `CreatePlan` does not fire `preToolUse` or `postToolUse` hooks (see Hook Tool Coverage above). This means the hook system cannot detect when a plan is created, track it, or trigger continuation logic afterward. After `CreatePlan` executes, `/stop` fires with no information about what just happened — the continuation handler cannot distinguish "agent just created a plan" from "agent finished talking." [repro-local]
```
**Why preserved:** Documents CreatePlan hook invisibility; justifies Write-only approach for hook visibility.

---

### Anchor 8: 19-known-sharp-edges.md:103

**File:** `docs/cursor/19-known-sharp-edges.md`  
**Line:** 103  
**Verbatim quote:**
```
- **Required approach:** Use `Write` to create plan files directly at `.cursor/plans/<name>.plan.md`. `Write` fires `postToolUse`, giving the hook system visibility into plan creation. The plan format is YAML frontmatter (`name`, `overview`, `todos`, `isProject`) followed by a markdown body. [repro-local] A `preToolUse` deny for `CreatePlan` was considered and rejected — it would be dead code today.
```
**Why preserved:** Prescriptive guidance on Write-only approach; explains why CreatePlan deny was rejected.

---

## 2. Explicit TodoWrite Enforcement

**Rationale:** Multi-step work MUST register todos via TodoWrite BEFORE starting implementation. This enables progress tracking, continuation, and plan state persistence. Skipping TodoWrite breaks the execution model.

### Anchor 9: orchestrator-reference.mdc:223

**File:** `rules/orchestrator-reference.mdc`  
**Line:** 223  
**Verbatim quote:**
```
2+ steps → TodoWrite immediately. Mark in_progress on dispatch, completed on success.
```
**Why preserved:** Mandatory rule for multi-step work; enforces explicit todo registration.

---

### Anchor 10: start-work.md:59

**File:** `commands/start-work.md`  
**Line:** 59  
**Verbatim quote:**
```
2. **Task breakdown (MANDATORY)** — Decompose every plan task into granular, implementation-level sub-steps and register **ALL** of them as todos via **TodoWrite** **before** starting any implementation or dispatch work. Do not begin waves or **Task** dispatches until every sub-step is registered. Each sub-step should be specific enough that it touches a clear set of files/functions (e.g. "add validateToken() to src/auth/middleware.ts" not "implement auth").
```
**Why preserved:** Explicit MANDATORY directive in `/start-work` Step 2; blocks implementation until todos registered.

---

## Verification Evidence

All anchors verified present via grep on 2026-06-11:

```
✓ prometheus-plan-brief.mdc:69 — "NEVER use `CreatePlan`..."
✓ agent-tool-restrictions.mdc:40 — "Forbidden: ... CreatePlan"
✓ agent-tool-restrictions.mdc:67 — "Forbidden: ... CreatePlan"
✓ plan.md:187 — "DO NOT use `CreatePlan`..."
✓ start-work.md:19 — "If you just ran `/plan` and saw the model emit..."
✓ 19-known-sharp-edges.md:101 — "Non-deterministic placement: `CreatePlan`..."
✓ 19-known-sharp-edges.md:102 — "No hook events: `CreatePlan`..."
✓ 19-known-sharp-edges.md:103 — "Required approach: Use `Write`..."
✓ orchestrator-reference.mdc:223 — "2+ steps → TodoWrite immediately..."
✓ start-work.md:59 — "Task breakdown (MANDATORY)..."
```

See `.omo/evidence/task-3-anchor-verification.txt` and `.omo/evidence/task-3-todos-anchor.txt` for full grep output.
