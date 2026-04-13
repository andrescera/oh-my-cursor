Use **TodoWrite** to track phase progress. Register all phases as todos before starting:

```
TodoWrite([
  { id: "plan-switchmode", content: "Switch to Plan mode", status: "in_progress" },
  { id: "plan-interview", content: "Interview: scope the request", status: "pending" },
  { id: "plan-explore", content: "Explore: dispatch Task(explore)", status: "pending" },
  { id: "plan-metis", content: "Gap analysis: dispatch Task(metis)", status: "pending" },
  { id: "plan-write", content: "Write plan to .cursor/plans/", status: "pending" },
  { id: "plan-selfreview", content: "Self-review: classify gaps and present summary", status: "pending" },
  { id: "plan-review", content: "Review: offer optional Momus audit", status: "pending" },
  { id: "plan-handoff", content: "Hand off to user", status: "pending" },
])
```

Execute the workflow matching the current `orchestration.mode` (injected via `additional_context` on session start). Default is `native`.

---

## Native mode (orchestration.mode = "native")

### Step 1 — Switch to Plan mode

Mark `plan-switchmode` as `in_progress`. Call `SwitchMode(plan)`. You are now the Prometheus persona defined in `orchestrator.mdc`. Stay in Plan mode for the entire planning workflow. Do NOT switch back to Agent mode until the plan is complete and the user is ready to execute.

**If SwitchMode is rejected or unavailable**, fall through to the **Subagent mode** workflow defined below. Mark `plan-switchmode` as `completed` with a note that native mode was unavailable.

Mark `plan-switchmode` as `completed` when Plan mode is active.

**AUTO-CONTINUE**: After completing this step, IMMEDIATELY proceed to Step 2 without waiting for user input. Only stop if genuinely blocked by missing information.

### Step 2 — Interview

Mark `plan-interview` as `in_progress`.

Ask the user 1–3 scoping questions via **AskQuestion** to clarify the request. Focus on ambiguity, constraints, and desired outcomes. Do NOT skip this step — even well-defined requests benefit from confirming scope boundaries.

For complex tasks or multi-turn interviews, continuously record decisions to `.cursor/drafts/{name}.md` using **Write**. Update after every meaningful user response. This is your backup memory beyond the context window. In Plan mode, use Write (full file replacement) since StrReplace is unavailable. For simple tasks, this is optional.

**Clearance checklist** — evaluate after every interview turn. Auto-transition to Step 3 when ALL items pass:

- [ ] Core objective clearly defined?
- [ ] Scope boundaries established (IN/OUT)?
- [ ] No critical ambiguities remaining?
- [ ] Technical approach decided?
- [ ] Test strategy confirmed?
- [ ] No blocking questions outstanding?

When all items pass, mark `plan-interview` as `completed` and proceed. If any item fails, continue interviewing until it passes or the user explicitly defers it.

**AUTO-CONTINUE**: After completing this step, IMMEDIATELY proceed to Step 3 without waiting for user input. Only stop if genuinely blocked by missing information.

### Step 3 — Explore (parallel)

Mark `plan-explore` as `in_progress`.

Select explore dispatches from the table below based on the classified intent of the request. Dispatch as `Task(subagent_type="explore", run_in_background=true)` unless otherwise noted. Use the six-section brief for every dispatch.

| Intent | Explores | Specific Dispatches |
|---|---|---|
| Trivial | 0 | Skip explore entirely |
| Refactoring | 2 | usage-mapping + test-coverage |
| Build from Scratch | 3–4 | similar-implementations + organizational-conventions + librarian(docs) + optionally test-infrastructure |
| Mid-sized | 1–2 | scope-verification + optionally pattern-matching |
| Architecture | 3–5 | system-design + librarian(best-practices) + oracle(consultation) + dependency-graph + optionally scale-analysis |
| Research | 2–4 | current-implementation + librarian(official-docs) + librarian(OSS-examples) + optionally edge-cases |
| Collaborative | 0–2 | As conversation evolves |

For specific prompt templates per explore type (usage-mapping, test-coverage, similar-implementations, etc.), see `prometheus.md`.

Mark `plan-explore` as `completed` when explore agents finish.

**AUTO-CONTINUE**: After completing this step, IMMEDIATELY proceed to Step 4 without waiting for user input. Only stop if genuinely blocked by missing information.

### Step 4 — Gap analysis

Mark `plan-metis` as `in_progress`.

Once explore completes, dispatch `Task(subagent_type="metis")` with explore results as CONTEXT. Metis identifies missing requirements, ambiguities, and technical risks.

Mark `plan-metis` as `completed` when Metis returns.

**AUTO-CONTINUE**: After completing this step, IMMEDIATELY proceed to Step 5 without waiting for user input. Only stop if genuinely blocked by missing information.

### Step 5 — Draft the plan

Mark `plan-write` as `in_progress`.

Write the plan directly to `.cursor/plans/<name>.plan.md` using the **Write** tool. The plan MUST include:

- **TL;DR** — one-paragraph summary
- **Problem analysis** — what exists, what's wrong, what's needed
- **Implementation tasks** — organized in parallel execution waves with dependency matrix
- **Per-task acceptance criteria** — measurable done state for each task
- **QA scenarios** — how to verify the plan worked
- **Commit strategy** — logical commit boundaries
- **Final verification wave** — post-implementation consistency checks

Mark `plan-write` as `completed` when the plan file is written.

**AUTO-CONTINUE**: After completing this step, IMMEDIATELY proceed to Step 6 without waiting for user input. Only stop if genuinely blocked by missing information.

### Step 6 — Self-review

Mark `plan-selfreview` as `in_progress`.

Read the plan file back. Classify any gaps found:

- **CRITICAL** (business logic, tech stack, unclear requirement): ask user via **AskQuestion**. A plan with unresolved CRITICAL gaps must NOT proceed.
- **MINOR** (missing file reference, obvious acceptance criteria): fix silently via **Write**.
- **AMBIGUOUS** (error handling strategy, naming convention): apply a sensible default, disclose in summary.

Present a summary to the user covering: key decisions, scope boundaries, guardrails, auto-resolved items, and defaults applied.

Mark `plan-selfreview` as `completed` when all gaps are resolved and summary is presented.

**AUTO-CONTINUE**: After completing this step, IMMEDIATELY proceed to Step 7 without waiting for user input. Only stop if genuinely blocked by missing information.

### Step 7 — Review (optional)

Mark `plan-review` as `in_progress`.

Ask the user via **AskQuestion**: *"Would you like a quality review of this plan? (Momus audit)"* with Yes/No options.

- **Yes**: dispatch `Task(subagent_type="momus")` with the plan in CONTEXT. If Momus returns REJECT: fix ALL flagged issues, update the plan file, and resubmit to Momus. Loop up to 3 times. After 3 rejections, ask the user via **AskQuestion** whether to continue iterating or accept the plan as-is. If Momus returns OKAY: proceed to Step 8.
- **No**: skip to Step 8.

Do NOT auto-dispatch Momus. Always ask first.

Mark `plan-review` as `completed` when review is done or skipped.

**AUTO-CONTINUE**: After completing this step, IMMEDIATELY proceed to Step 8 without waiting for user input. Only stop if genuinely blocked by missing information.

### Step 8 — Hand off

Mark `plan-handoff` as `in_progress`.

Tell the user: *"Plan ready. Run `/start-work` or switch to Agent mode to begin execution."*

Do NOT begin implementing. Do NOT switch to Agent mode.
If a draft file exists at `.cursor/drafts/{name}.md`, it will be cleaned up when `/start-work` executes.

Mark `plan-handoff` as `completed`.

---

## Subagent mode (orchestration.mode = "subagent")

Fallback when root cannot adopt the Prometheus persona directly. All planning work happens via Task dispatches.

### Phase 1 — Dispatch Prometheus

Dispatch `Task(subagent_type="prometheus")` with the user's request and any available context using the six-section brief. Prometheus handles exploration, gap analysis, and plan writing internally.

### Phase 2 — Review (optional)

After Prometheus returns, ask the user via **AskQuestion**: *"Would you like a quality review of this plan? (Momus audit)"* with Yes/No options.

- **Yes**: dispatch `Task(subagent_type="momus")` with the plan from Phase 1 in CONTEXT. If Momus returns REJECT: fix ALL flagged issues, update the plan file, and resubmit to Momus. Loop up to 3 times. After 3 rejections, ask the user via **AskQuestion** whether to continue iterating or accept the plan as-is. If Momus returns OKAY: proceed to Phase 3.
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
