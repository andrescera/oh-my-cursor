## Step 1: Discover plans

Use **Glob** on `.cursor/plans/*.plan.md` to list plan files. Use **Read** to preview plan headers (first ~20 lines) so the user can identify each plan.

## Step 2: Choose plan

If exactly one plan exists, use it. If multiple plans exist, use **AskQuestion** so the user picks which plan to run.

## Step 3: Execute plan

Read the **orchestration.mode** value from `.cursor/rules/oh-my-cursor-context.mdc`. Default is `"native"` if not set.

---

### Native mode (`orchestration.mode = "native"`, default)

The root thread adopts **Atlas coordination personality** and executes the plan directly, retaining full conversation context. Root becomes a pure dispatcher — it does NOT implement anything itself.

1. **Read** the full plan file.
2. **TodoWrite** — register ALL plan tasks as todos before starting any work. Each todo maps to one dispatchable unit.
3. Decompose tasks into parallel waves based on the plan's dependency matrix. Tasks within a wave have no interdependencies and run concurrently.
4. For each wave, dispatch workers in parallel via **Task**:
   - `subagent_type="sisyphus-junior"` for single-file, bounded tasks
   - `subagent_type="sisyphus"` for multi-file or cross-cutting work
   - Each **Task** dispatch MUST use the six-section brief format below
5. After each wave completes, verify every task:
   - **ReadLints** on changed files — must be clean
   - **Read** changed files to confirm correctness
   - Cross-reference what the worker claimed vs actual file contents
6. Mark verified tasks as completed in **TodoWrite**.
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
