## Session resume (before-submit hook)

When you run `/start-work`, the hook inspects in-memory session state (`activePlan`). It injects one of three hints so execution matches reality after a crash or new tab:

| Tag | When | What to do |
|-----|------|------------|
| `[start-work:resume]` | `activePlan` exists and `completedTasks` is non-empty | Resume that plan path; skip redoing listed tasks; continue from the saved phase. |
| `[start-work:fresh]` | `activePlan` exists but `completedTasks` is empty | Same plan path is active; start at Wave 1 (or Step 3 fresh) without assuming prior wave completion. |
| `[start-work:discover]` | No `activePlan` in session | No loaded plan in memory — use **Glob** / **Read** on `.cursor/plans/` (and optionally `.cursor/state/active-plan-{conversationId}.json`) to choose a plan, then proceed with Step 2 onward. |

Persistent progress lives in `.cursor/state/active-plan-{conversationId}.json` per conversation (**`conversationId`** from the oh-my-cursor session context). The hook’s session snapshot is what drives immediate resume vs discover until the agent reloads state from disk.

## Step 1: Discover plans

Use **Glob** on `.cursor/plans/*.plan.md` to list plan files. Use **Read** to preview plan headers (first ~20 lines) so the user can identify each plan.

## Step 2: Choose plan

If exactly one plan exists, use it. If multiple plans exist, use **AskQuestion** so the user picks which plan to run.

## Step 2.5: Resume detection

After the plan is chosen:

- Use **Read** on `.cursor/state/active-plan-{conversationId}.json` (**`conversationId`** from session context). If missing or unreadable, continue to Step 3.
- If the file exists, use **AskQuestion** to offer **Resume** (continue from saved `completedTasks` / `currentWave`) versus **Start fresh** (discard prior state for this run). If **`path`** in the file does not match the chosen plan, treat state as stale: default to **Start fresh** or confirm overwrite via **AskQuestion** before proceeding.

## Step 3: Execute plan

**Active plan state** — At the start of Step 3 (before reading orchestration mode):

Before registering execution todos, call TodoWrite with `merge: false` to clear all plan-phase todos from the previous planning session. This prevents stale plan-phase todos from contaminating the execution phase.

1. Ensure `.cursor/state/` exists (create the directory if needed).
2. Create or update `.cursor/state/active-plan-{conversationId}.json` (**`conversationId`** from the oh-my-cursor session context) with:
   - **`path`**: path to the chosen plan file (workspace-relative or absolute, consistent across the run)
   - **`startedAt`**: ISO 8601 timestamp (set to now on **Start fresh**; preserve when **Resume**)
   - **`completedTasks`**: array of completed task or todo identifiers (`[]` on **Start fresh**; restore from file on **Resume**)
   - **`currentWave`**: integer wave index (`0` at a fresh start; restore or reset to match **Resume** / **Start fresh**)
3. As execution proceeds, **update** the same file after each verified wave: advance **`currentWave`**, append completed items to **`completedTasks`**, and keep **`path`** accurate.

If the per-conversation file does not exist yet, there is no persisted resume state until Step 3 creates it; always write updates to the per-conversation file so parallel chats do not overwrite each other’s progress.

Read the **orchestration.mode** value from the session's `additional_context` (injected on session start). Default is `"native"` if not set.

---

### Native mode (`orchestration.mode = "native"`, default)

The root thread adopts **Atlas coordination personality** and executes the plan directly, retaining full conversation context. Root becomes a pure dispatcher — it does NOT implement anything itself.

1. **Read** the full plan file.
2. **Task breakdown (MANDATORY)** — Decompose every plan task into granular, implementation-level sub-steps and register **ALL** of them as todos via **TodoWrite** **before** starting any implementation or dispatch work. Do not begin waves or **Task** dispatches until every sub-step is registered. Each sub-step should be specific enough that it touches a clear set of files/functions (e.g. "add validateToken() to src/auth/middleware.ts" not "implement auth").
2.5. **Notepad setup** — Create `.cursor/notepads/{plan-name}/` with `learnings.md`, `decisions.md`, `issues.md` before starting Wave 1. These files accumulate wisdom across delegations.
3. Decompose tasks into parallel waves based on the plan's dependency matrix. Tasks within a wave have no interdependencies and run concurrently.
4. For each wave, dispatch workers in parallel via **Task**:
   - `subagent_type="sisyphus-junior"` for single-file, bounded tasks
   - `subagent_type="sisyphus"` for multi-file or cross-cutting work
   - Each **Task** dispatch MUST use the six-section brief format below
5. After each wave completes, verify every task:
   - **ReadLints** on changed files — must be clean
   - **Read** changed files to confirm correctness
   - Cross-reference what the worker claimed vs actual file contents
6. Mark verified tasks as completed in **TodoWrite**. Persist progress in the active plan state file from Step 3 (**`currentWave`**, **`completedTasks`** ).
6.5. **Wave commit (mandatory)** — After each wave passes verification, commit with a wave-descriptive message (e.g. `feat(wave-2): implement API handlers`) before starting the next wave. Do not begin the next wave until that commit is done.
7. **Auto-continue** — dispatch the next wave immediately. Never ask "should I continue?" — only stop when blocked by genuine ambiguity requiring user input.
8. Run the **Final Verification Wave** from the plan (if present).

---

### Subagent mode (`orchestration.mode = "subagent"`, fallback)

Dispatch `Task(subagent_type="atlas")`. Paste the **full** chosen plan file contents into the task prompt. Use the six-section brief format below for that dispatch.

Atlas will:
- Decompose the plan into atomic steps (file, change, expected behavior, verification).
- Use **TodoWrite** to register and update todos for all steps before and during execution.
- Delegate implementation only via **Task**: `subagent_type="sisyphus-junior"` for single-file tasks; `subagent_type="sisyphus"` for multi-file or cross-cutting work. Each downstream **Task** must use the same six-section brief format.
- Never ask "should I continue?" between plan steps. Only stop when blocked by ambiguity.

Keep atlas's **CONTEXT** section rich: full plan text, selected file paths, and dependency order from the plan.

Atlas will also create `.cursor/notepads/{plan-name}/` with `learnings.md`, `decisions.md`, `issues.md` to accumulate wisdom across delegations, and commit after each verified wave.

---

## Six-section task brief template (required for every Task dispatch)

```
TASK: <one clear objective>

EXPECTED OUTCOME: <measurable done state>

REQUIRED TOOLS: <e.g. Read, Write, Grep, Shell, Task>

MUST DO: <numbered or bulleted non-negotiables>

MUST NOT DO: <scope limits, anti-patterns to avoid>

CONTEXT: <plan excerpt, file paths, constraints, prior decisions>
```
