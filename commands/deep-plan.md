You MUST use the **Task** tool to dispatch agents for each phase below. Do NOT describe what should happen -- actually make the tool calls. Use **TodoWrite** to track phase progress.

## Phase 1 -- Explore (parallel)

Dispatch one or more `Task(subagent_type="explore", run_in_background=true)` agents to map the codebase areas relevant to the user's request. Use the six-section brief. Batch related searches into a single explore dispatch.

## Phase 2 -- Gap analysis

Once Phase 1 completes, dispatch `Task(subagent_type="metis")` with Phase 1 results in CONTEXT. Metis identifies missing requirements, ambiguities, and technical risks.

## Phase 3 -- Strategic plan

Dispatch `Task(subagent_type="prometheus")` with Phase 1 + Phase 2 results in CONTEXT. Prometheus produces a detailed work plan with parallel execution waves, dependency matrix, per-task acceptance criteria, and QA scenarios. Instruct it to write the plan to `.cursor/plans/`.

## Phase 4 -- Plan review (optional)

Dispatch `Task(subagent_type="momus")` with the plan from Phase 3 in CONTEXT for quality audit. If momus identifies issues, resume prometheus to iterate.

## Six-section task brief template (required for every Task dispatch)

```
TASK: <one clear objective>
EXPECTED OUTCOME: <measurable done state>
REQUIRED TOOLS: <tool whitelist>
MUST DO: <numbered non-negotiables>
MUST NOT DO: <scope limits>
CONTEXT: <file paths, prior phase results, constraints>
```

Present the reviewed plan. Do NOT begin implementing until user confirms. After confirmation, run `/start-work` to begin execution.
