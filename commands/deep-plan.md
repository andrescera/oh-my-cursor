Use **TodoWrite** to track phase progress. Execute the workflow matching the current `orchestration.mode` (check `.cursor/rules/oh-my-cursor-context.mdc`). Default is `native`.

---

## Native mode (orchestration.mode = "native")

### Step 1 — Switch to Plan mode

Call `SwitchMode(plan)`. You are now the Prometheus persona defined in `orchestrator.mdc`. Stay in Plan mode for the entire planning workflow. Do NOT switch back to Agent mode until the plan is complete and the user is ready to execute.

### Step 2 — Interview

Ask the user 1–3 scoping questions to clarify the request. Focus on ambiguity, constraints, and desired outcomes. Do NOT skip this step — even well-defined requests benefit from confirming scope boundaries.

### Step 3 — Explore (parallel)

Dispatch one or more `Task(subagent_type="explore", run_in_background=true)` agents to map relevant codebase areas. Use the six-section brief. Batch related searches into a single explore dispatch.

### Step 4 — Gap analysis

Once explore completes, dispatch `Task(subagent_type="metis")` with explore results as CONTEXT. Metis identifies missing requirements, ambiguities, and technical risks.

### Step 5 — Write the plan

Write the plan directly to `.cursor/plans/<name>.plan.md` using the **Write** tool. The plan MUST include:

- **TL;DR** — one-paragraph summary
- **Problem analysis** — what exists, what's wrong, what's needed
- **Implementation tasks** — organized in parallel execution waves with dependency matrix
- **Per-task acceptance criteria** — measurable done state for each task
- **QA scenarios** — how to verify the plan worked
- **Commit strategy** — logical commit boundaries
- **Final verification wave** — post-implementation consistency checks

### Step 6 — Review (optional)

Ask the user: *"Would you like a quality review of this plan? (Momus audit)"*

If yes: dispatch `Task(subagent_type="momus")` with the plan in CONTEXT. If Momus rejects, fix the issues and resubmit until it passes.

If no: skip to Step 7.

### Step 7 — Present and hand off

Present the plan summary. Tell the user to run `/start-work` to begin execution. Do NOT begin implementing.

---

## Subagent mode (orchestration.mode = "subagent")

Fallback when root cannot use SwitchMode. All work happens via Task dispatches.

### Phase 1 — Explore (parallel)

Dispatch one or more `Task(subagent_type="explore", run_in_background=true)` agents to map relevant codebase areas. Use the six-section brief. Batch related searches into a single explore dispatch.

### Phase 2 — Gap analysis

Once Phase 1 completes, dispatch `Task(subagent_type="metis")` with Phase 1 results in CONTEXT. Metis identifies missing requirements, ambiguities, and technical risks.

### Phase 3 — Strategic plan

Dispatch `Task(subagent_type="prometheus")` with Phase 1 + Phase 2 results in CONTEXT. Prometheus writes the plan to `.cursor/plans/<name>.plan.md`.

### Phase 4 — Plan review (optional)

Ask the user: *"Would you like a quality review? (Momus audit)"*

If yes: dispatch `Task(subagent_type="momus")` with the plan from Phase 3 in CONTEXT. If Momus rejects, resume Prometheus to iterate.

Present the reviewed plan. Do NOT begin implementing until user confirms. Tell user to run `/start-work` to begin execution.

---

## Six-section task brief template (required for every Task dispatch)

```
TASK: <one clear objective>
EXPECTED OUTCOME: <measurable done state>
REQUIRED TOOLS: <tool whitelist>
MUST DO: <numbered non-negotiables>
MUST NOT DO: <scope limits>
CONTEXT: <file paths, prior phase results, constraints>
```
