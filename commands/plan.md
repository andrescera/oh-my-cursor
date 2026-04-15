Use **TodoWrite** to track phase progress. This is your FIRST action -- register all phases before doing anything else:

```
TodoWrite([
  { id: "plan-draft", content: "Create draft file for interview working memory", status: "in_progress" },
  { id: "plan-explore", content: "Explore: ground in codebase before asking questions", status: "pending" },
  { id: "plan-interview", content: "Interview: ask informed scoping questions", status: "pending" },
  { id: "plan-metis", content: "Gap analysis: dispatch Task(metis)", status: "pending" },
  { id: "plan-write", content: "Write plan to .cursor/plans/", status: "pending" },
  { id: "plan-review", content: "Self-review + present summary to user", status: "pending" },
  { id: "plan-decisions", content: "Resolve critical gaps if any remain", status: "pending" },
  { id: "plan-momus", content: "Offer choice: Start Work vs Momus High Accuracy Review", status: "pending" },
  { id: "plan-handoff", content: "Delete draft, hand off to user", status: "pending" },
])
```

Call `SwitchMode(plan)` if not already in Plan mode.

Now execute the Prometheus planning workflow. Auto-continue between steps -- never ask "should I continue?"

1. **Create draft** -- Mark `plan-draft` in_progress. Create `.cursor/drafts/{sessionId-short}-{name}.md` immediately with this structure:

Use the first 8 characters of the Session ID from the `## oh-my-cursor Context` section as `{sessionId-short}` (e.g., `78d7f663-my-topic.md`).

Tell the user: "I'm recording our discussion in `.cursor/drafts/{name}.md` -- feel free to review it anytime."

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

## Test Strategy Decision
- Infrastructure exists: YES/NO
- Automated tests: YES (TDD) / YES (after) / NO
- Framework: [discovered or TBD]
- Agent-Executed QA: ALWAYS (mandatory regardless of test choice)
```

This is your working memory beyond the context window.

**Update Triggers** -- update the draft after:
- EVERY meaningful user response
- Receiving agent research results (explore/librarian)
- A decision is confirmed
- Scope is clarified or changed

Mark completed. Proceed immediately.

2. **Explore** -- Mark `plan-explore` in_progress. Ground yourself in the codebase BEFORE asking the user anything. Fire `explore` or `librarian` agents based on intent classification (see `orchestrator-reference.mdc`). For non-trivial intents, fire AT LEAST 3 agents. For trivial/collaborative intents, 0-2 is acceptable:

- **Codebase patterns**: Map directory structure, similar implementations, naming conventions.
- **Test infrastructure**: Find test framework, config, representative tests, CI setup.
- **Architecture**: Module boundaries, imports, dependency direction, key abstractions.
- **External libraries** (if relevant): Dispatch `Task(subagent_type="librarian")` for official docs, API reference, recommended patterns.

After collecting results, synthesize findings before proceeding. Note what you discovered, what it means for the plan, and what you still need to learn from the user. Mark completed. Proceed immediately.

3. **Interview** -- Mark `plan-interview` in_progress. Ask 1-3 scoping questions via AskQuestion, informed by explore findings: "I found pattern X, should we follow it?" or "The codebase uses Y -- should we match that?"

Update the draft after EVERY meaningful user response. Run clearance checklist after every turn (see `orchestrator-reference.mdc`). Mark completed when all clearance items pass. Proceed immediately.

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

5. **Write plan** -- Mark `plan-write` in_progress. Write plan to `.cursor/plans/<name>.plan.md` using Write. The file must start with YAML frontmatter (`name`, `overview`, `todos`, `isProject`) before the markdown body so Cursor's plan UI can detect it; the `todos` array uses `{id, content, status}` shape matching the plan's TODOs section. Must include: TL;DR, problem analysis, implementation tasks in parallel waves, dependency matrix (mandatory for 3+ tasks), per-task acceptance criteria, QA scenarios, commit strategy, final verification wave. Mark completed.

**DO NOT stop after writing the plan. Steps 6-9 are MANDATORY. Auto-continue immediately.**

6. **Self-review + summary** -- Mark `plan-review` in_progress. Read plan back and classify gaps:
- CRITICAL gaps -> flag for step 7.
- MINOR -> fix silently in the plan.
- AMBIGUOUS -> apply default, disclose.
- Verify dependency matrix exists and is non-empty for plans with 3+ tasks.

Then present summary to user:
- Key decisions made (with rationale)
- Scope: IN / OUT
- Guardrails applied (from Metis review)
- Auto-resolved items (minor gaps fixed)
- Defaults applied (ambiguous gaps with sensible defaults)
- Critical gaps remaining (if any)
Mark completed. Proceed immediately.

7. **Resolve decisions** -- Mark `plan-decisions` in_progress. If critical gaps were flagged in step 6, ask user via AskQuestion and WAIT for answers. Update the plan with resolutions. If no critical gaps remain, mark completed immediately. Proceed immediately.

8. **Offer choice** -- Mark `plan-momus` in_progress. Ask user via AskQuestion: "How would you like to proceed?" with options:
- **Start Work**: "Execute now with `/start-work`. Plan looks solid."
- **Momus High Accuracy Review**: "Have Momus rigorously verify every detail. Adds review loop."
If Momus: dispatch `Task(subagent_type="momus")` with ONLY the plan file path as the prompt. Do NOT wrap in explanations. Loop up to 3x if rejected. Mark completed.

9. **Handoff** -- Mark `plan-handoff` in_progress. Delete the draft file (`.cursor/drafts/{sessionId-short}-{name}.md`). Tell user: "Plan ready. Run `/start-work` or switch to Agent mode." Mark completed.

**Agent type restriction:** Only `explore`, `metis`, `momus`, `librarian`, and `oracle` subagent types are allowed in plan mode. Any other type (including `generalPurpose`) will be denied by the tool guard.

For detailed clearance checklist, intent classification table, allowed/forbidden tools, and subagent fallback: see `orchestrator-reference.mdc` Plan Mode section.

**Subagent fallback**: If `SwitchMode(plan)` is rejected, dispatch `Task(subagent_type="prometheus")` with the user's request instead.
