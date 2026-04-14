Use **TodoWrite** to track phase progress. This is your FIRST action -- register all phases before doing anything else:

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

Then call `SwitchMode(plan)` if not already in Plan mode. Mark `plan-switchmode` as `completed`.

Now execute the Prometheus planning workflow. Auto-continue between steps -- never ask "should I continue?"

1. **Interview** -- Mark `plan-interview` in_progress. Ask 1-3 scoping questions via AskQuestion. Record decisions to `.cursor/drafts/{name}.md` immediately -- create the draft file on your first interview turn and update after EVERY meaningful user response. The draft is your working memory beyond the context window. Mark completed when clearance checklist passes (see `orchestrator-reference.mdc`). Proceed immediately.

2. **Explore** -- Mark `plan-explore` in_progress. Dispatch `Task(subagent_type="explore")` based on intent classification (see `orchestrator-reference.mdc`). Mark completed. Proceed immediately.

3. **Gap analysis (NEVER skip)** -- Mark `plan-metis` in_progress. Dispatch `Task(subagent_type="metis")` with explore results using this structured context template:

```
Task(subagent_type="metis", prompt=`Review this planning session:
  **User's Goal**: {summarize what user wants}
  **What We Discussed**: {key points from interview}
  **My Understanding**: {your interpretation of requirements}
  **Research Findings**: {key discoveries from explore/librarian}
  Please identify: missed questions, guardrails needed, scope creep risks, unvalidated assumptions, missing acceptance criteria, edge cases.`)
```

Skipping Metis is a hard constraint violation. Mark completed. Proceed immediately.

4. **Write plan** -- Mark `plan-write` in_progress. Write plan to `.cursor/plans/<name>.plan.md` using CreatePlan or Write. Must include: TL;DR, problem analysis, implementation tasks in parallel waves, dependency matrix (mandatory for 3+ tasks), per-task acceptance criteria, QA scenarios, commit strategy, final verification wave. Mark completed.

**DO NOT stop after writing the plan. Steps 5-7 are MANDATORY. Auto-continue immediately.**

5. **Self-review** -- Mark `plan-selfreview` in_progress. Read plan back. CRITICAL gaps -> ask user via AskQuestion. MINOR -> fix silently. AMBIGUOUS -> apply default, disclose. Verify dependency matrix exists and is non-empty for plans with 3+ tasks. Mark completed. Proceed immediately.

6. **Review** -- Mark `plan-review` in_progress. Ask user: "Would you like a Momus audit?" If yes -> dispatch `Task(subagent_type="momus")` with ONLY the plan file path as the prompt (e.g. `.cursor/plans/{name}.plan.md`). Do NOT wrap in explanations or markdown. Loop up to 3x if rejected. Mark completed.

7. **Handoff** -- Mark `plan-handoff` in_progress. Tell user: "Plan ready. Run `/start-work` or switch to Agent mode." Mark completed.

**Agent type restriction:** Only `explore`, `metis`, `momus`, and `librarian` subagent types are allowed in plan mode. Any other type (including `generalPurpose`) will be denied by the tool guard.

For detailed clearance checklist, intent classification table, allowed/forbidden tools, and subagent fallback: see `orchestrator-reference.mdc` Plan Mode section.

**Subagent fallback**: If `SwitchMode(plan)` is rejected, dispatch `Task(subagent_type="prometheus")` with the user's request instead.
