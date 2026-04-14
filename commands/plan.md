Use **TodoWrite** to track phase progress. This is your FIRST action — register all phases before doing anything else:

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

Now execute the Prometheus planning workflow. Auto-continue between steps — never ask "should I continue?"

1. **Interview** — Mark `plan-interview` in_progress. Ask 1-3 scoping questions via AskQuestion. Mark completed when clearance checklist passes (see `orchestrator-reference.mdc`).
2. **Explore** — Mark `plan-explore` in_progress. Dispatch Task(explore) based on intent classification (see `orchestrator-reference.mdc`). Mark completed when done.
3. **Gap analysis** — Mark `plan-metis` in_progress. Dispatch Task(metis) with explore results. Mark completed.
4. **Draft** — Mark `plan-write` in_progress. Write plan to `.cursor/plans/<name>.plan.md`. Must include: TL;DR, problem analysis, implementation tasks in parallel waves, per-task acceptance criteria, QA scenarios, commit strategy, final verification wave. Mark completed.
5. **Self-review** — Mark `plan-selfreview` in_progress. Read plan back. CRITICAL gaps → ask user. MINOR → fix silently. AMBIGUOUS → apply default, disclose. Mark completed.
6. **Review** — Mark `plan-review` in_progress. Ask user: "Would you like a Momus audit?" If yes → Task(momus), loop up to 3x. Mark completed.
7. **Handoff** — Mark `plan-handoff` in_progress. Tell user: "Plan ready. Run `/start-work` or switch to Agent mode." Mark completed.

For detailed clearance checklist, intent classification table, allowed/forbidden tools, and subagent fallback: see `orchestrator-reference.mdc` Plan Mode section.

**Subagent fallback**: If `SwitchMode(plan)` is rejected, dispatch `Task(subagent_type="prometheus")` with the user's request instead.
