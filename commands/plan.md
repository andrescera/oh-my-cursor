Use **TodoWrite** to track phase progress. This is your FIRST action -- register all phases before doing anything else:

```
TodoWrite([
  { id: "plan-switchmode", content: "Switch to Plan mode", status: "in_progress" },
  { id: "plan-draft", content: "Create draft file for interview working memory", status: "pending" },
  { id: "plan-interview", content: "Interview: scope the request", status: "pending" },
  { id: "plan-explore", content: "Explore: dispatch Task(explore)", status: "pending" },
  { id: "plan-metis", content: "Gap analysis: dispatch Task(metis)", status: "pending" },
  { id: "plan-write", content: "Write plan to .cursor/plans/", status: "pending" },
  { id: "plan-selfreview", content: "Self-review: classify gaps", status: "pending" },
  { id: "plan-summary", content: "Present summary with decisions and defaults", status: "pending" },
  { id: "plan-review", content: "Offer choice: Start Work vs Momus review", status: "pending" },
  { id: "plan-handoff", content: "Delete draft, hand off to user", status: "pending" },
])
```

Then call `SwitchMode(plan)` if not already in Plan mode. Mark `plan-switchmode` as `completed`.

Now execute the Prometheus planning workflow. Auto-continue between steps -- never ask "should I continue?"

1. **Create draft** -- Mark `plan-draft` in_progress. Create `.cursor/drafts/{name}.md` immediately with this structure:

```markdown
# Draft: {Topic}

## Requirements (confirmed)
- [requirement]: [user's exact words or decision]

## Technical Decisions
- [decision]: [rationale]

## Research Findings
- [source]: [key finding]

## Open Questions
- [question not yet answered]

## Scope Boundaries
- INCLUDE: [what's in scope]
- EXCLUDE: [what's explicitly out]
```

This is your working memory beyond the context window. Mark completed. Proceed immediately.

2. **Interview** -- Mark `plan-interview` in_progress. Ask 1-3 scoping questions via AskQuestion. Update the draft after EVERY meaningful user response. Run clearance checklist after every turn (see `orchestrator-reference.mdc`). Mark completed when all clearance items pass. Proceed immediately.

3. **Explore** -- Mark `plan-explore` in_progress. Dispatch `Task(subagent_type="explore")` based on intent classification (see `orchestrator-reference.mdc`). Mark completed. Proceed immediately.

4. **Gap analysis (NEVER skip)** -- Mark `plan-metis` in_progress. Dispatch `Task(subagent_type="metis")` with explore results using this structured context template:

```
Task(subagent_type="metis", prompt=`Review this planning session:
  **User's Goal**: {summarize what user wants}
  **What We Discussed**: {key points from interview}
  **My Understanding**: {your interpretation of requirements}
  **Research Findings**: {key discoveries from explore/librarian}
  Please identify: missed questions, guardrails needed, scope creep risks, unvalidated assumptions, missing acceptance criteria, edge cases.`)
```

Skipping Metis is a hard constraint violation. Mark completed. Proceed immediately.

5. **Write plan** -- Mark `plan-write` in_progress. Write plan to `.cursor/plans/<name>.plan.md` using CreatePlan or Write. Must include: TL;DR, problem analysis, implementation tasks in parallel waves, dependency matrix (mandatory for 3+ tasks), per-task acceptance criteria, QA scenarios, commit strategy, final verification wave. Mark completed.

**DO NOT stop after writing the plan. Steps 6-9 are MANDATORY. Auto-continue immediately.**

6. **Self-review** -- Mark `plan-selfreview` in_progress. Read plan back. CRITICAL gaps -> ask user via AskQuestion. MINOR -> fix silently. AMBIGUOUS -> apply default, disclose. Verify dependency matrix exists and is non-empty for plans with 3+ tasks. Mark completed. Proceed immediately.

7. **Present summary** -- Mark `plan-summary` in_progress. Present to user:
- Key decisions made (with rationale)
- Scope: IN / OUT
- Guardrails applied (from Metis review)
- Auto-resolved items (minor gaps fixed)
- Defaults applied (ambiguous gaps with sensible defaults)
- Decisions needed (if any CRITICAL gaps remain -- ask via AskQuestion and wait)
Mark completed. Proceed immediately.

8. **Offer choice** -- Mark `plan-review` in_progress. Ask user via AskQuestion: "How would you like to proceed?" with options:
- **Start Work**: "Execute now with `/start-work`. Plan looks solid."
- **Momus Review**: "Have Momus rigorously verify every detail. Adds review loop."
If Momus: dispatch `Task(subagent_type="momus")` with ONLY the plan file path as the prompt. Do NOT wrap in explanations. Loop up to 3x if rejected. Mark completed.

9. **Handoff** -- Mark `plan-handoff` in_progress. Delete the draft file (`.cursor/drafts/{name}.md`). Tell user: "Plan ready. Run `/start-work` or switch to Agent mode." Mark completed.

**Agent type restriction:** Only `explore`, `metis`, `momus`, and `librarian` subagent types are allowed in plan mode. Any other type (including `generalPurpose`) will be denied by the tool guard.

For detailed clearance checklist, intent classification table, allowed/forbidden tools, and subagent fallback: see `orchestrator-reference.mdc` Plan Mode section.

**Subagent fallback**: If `SwitchMode(plan)` is rejected, dispatch `Task(subagent_type="prometheus")` with the user's request instead.
