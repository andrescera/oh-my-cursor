Use **TodoWrite** to track phase progress. Execute the workflow matching the current `orchestration.mode` (check `.cursor/rules/oh-my-cursor-context.mdc`). Default is `native`.

---

## Native mode (orchestration.mode = "native")

### Step 1 — Switch to Plan mode

Call `SwitchMode(plan)`. You are now the Prometheus persona defined in `orchestrator.mdc`. Stay in Plan mode for the entire planning workflow. Do NOT switch back to Agent mode until the plan is complete and the user is ready to execute.

### Step 2 — Interview

Ask the user 1–3 scoping questions via **AskQuestion** to clarify the request. Focus on ambiguity, constraints, and desired outcomes. Do NOT skip this step — even well-defined requests benefit from confirming scope boundaries.

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

Ask the user via **AskQuestion**: *"Would you like a quality review of this plan? (Momus audit)"* with Yes/No options.

- **Yes**: dispatch `Task(subagent_type="momus")` with the plan in CONTEXT. If Momus flags issues, incorporate feedback and update the plan file.
- **No**: skip to Step 7.

Do NOT auto-dispatch Momus. Always ask first.

### Step 7 — Hand off

Tell the user: *"Plan ready. Run `/start-work` or switch to Agent mode to begin execution."*

Do NOT begin implementing. Do NOT switch to Agent mode.

---

## Subagent mode (orchestration.mode = "subagent")

Fallback when root cannot adopt the Prometheus persona directly. All planning work happens via Task dispatches.

### Phase 1 — Dispatch Prometheus

Dispatch `Task(subagent_type="prometheus")` with the user's request and any available context using the six-section brief. Prometheus handles exploration, gap analysis, and plan writing internally.

### Phase 2 — Review (optional)

After Prometheus returns, ask the user via **AskQuestion**: *"Would you like a quality review of this plan? (Momus audit)"* with Yes/No options.

- **Yes**: dispatch `Task(subagent_type="momus")` with the plan from Phase 1 in CONTEXT. If Momus rejects, resume Prometheus to iterate.
- **No**: skip to Phase 3.

Do NOT auto-dispatch Momus. Always ask first.

### Phase 3 — Hand off

Tell the user: *"Plan ready. Run `/start-work` or switch to Agent mode to begin execution."*

Do NOT begin implementing.

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
