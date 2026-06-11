Use **TodoWrite** to track phase progress. This is your FIRST action -- register all phases before doing anything else:

> **Pattern provenance**: This workflow is adapted from the oh-my-openagent-original Prometheus planning workflow. See `../oh-my-openagent-original/src/agents/prometheus/` for the TypeScript source. These are informational references, not runtime dependencies.

```
TodoWrite([
  { id: "plan-draft", content: "Create draft file for interview working memory", status: "in_progress" },
  { id: "plan-explore", content: "Explore: ground in codebase before asking questions", status: "pending" },
  { id: "plan-interview", content: "Interview: ask informed scoping questions", status: "pending" },
  { id: "plan-metis", content: "Gap analysis: dispatch Task(metis)", status: "pending" },
  { id: "plan-oracle", content: "Oracle consultation: dispatch or skip with reason", status: "pending" },
  { id: "plan-write", content: "Write plan to .cursor/plans/ via Write tool (NOT CreatePlan)", status: "pending" },
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

**The `## Test Strategy Decision` section MUST be filled before clearance can pass for non-Trivial intents (see Step 3a below).**

This is your working memory beyond the context window.

**Update Triggers** -- update the draft after:
- EVERY meaningful user response
- Receiving agent research results (explore/librarian)
- A decision is confirmed
- Scope is clarified or changed

Mark completed. Proceed immediately.

2. **Explore** -- Mark `plan-explore` in_progress. Ground yourself in the codebase BEFORE asking the user anything. Silent exploration before your first question is mandatory for non-trivial intents.

   **Step A — ALWAYS fire `explore` agents** (for non-trivial intents, AT LEAST 2):
   - **Codebase patterns**: Map directory structure, similar implementations, naming conventions.
   - **Test infrastructure**: Find test framework, config, representative tests, CI setup.
   - **Architecture**: Module boundaries, imports, dependency direction, key abstractions.

   **Step B — Fire `librarian` agents when the task involves external technologies:**
   If the task touches external libraries, frameworks, APIs, version migrations, or third-party tooling config, ALSO dispatch `Task(subagent_type="librarian")` for official docs, API reference, and recommended patterns. Do NOT skip librarian and rely on training data — docs change.

   Librarian is MANDATORY when ANY of these apply:
   - External library, framework, or SDK (e.g., Zod, React, Express, Prisma)
   - Version migration or upgrade
   - API integration (REST, GraphQL, MCP, cloud services)
   - Configuration patterns for a third-party tool (bundler, linter, CI)
   - User mentions a technology the codebase doesn't already use

   For trivial/collaborative intents, 0-2 agents total is acceptable. For non-trivial intents, fire AT LEAST 2 explore + librarian when triggers apply (typically 3-5 agents total).

After collecting results, synthesize findings before proceeding. Note what you discovered, what it means for the plan, and what you still need to learn from the user. Mark completed. Proceed immediately.

3. **Interview** -- Mark `plan-interview` in_progress.

   **3a. Test Strategy Assessment (MANDATORY for Build/Refactor/Mid-sized/Architecture intents)**

   Trivial/Standard/Collaborative: skip the question; record `## Test Strategy Decision: SKIPPED — reason: <brief reason>` in the draft.

   For Build, Refactor, Mid-sized, and Architecture intents, you MUST elicit and record the test strategy before clearance can pass.

**Step 1: Detect** — dispatch `Task(subagent_type="explore")` to find: test framework (package.json, config files), test patterns (representative files), coverage config, CI integration.

**Step 2: Ask the Test Question via `AskQuestion`** — two scripted variants (byte-aligned across surfaces):
If test infrastructure EXISTS:
> I see test infrastructure ([framework]). Should this work include automated tests?
> - YES (TDD): RED-GREEN-REFACTOR structure
> - YES (Tests after): Test tasks follow implementation tasks
> - NO: No unit/integration tests
> Regardless, every task includes agent-executed QA scenarios.

If test infrastructure DOES NOT exist:
> I don't see test infrastructure. Would you like to set up testing?
> - YES: Infrastructure setup included in plan (framework selection, config, example test)
> - NO: No unit tests
> Either way, every task includes agent-executed QA scenarios.

**Step 3: Record** in `.cursor/drafts/{name}.md` immediately:
```
## Test Strategy Decision
- Infrastructure exists: YES/NO
- Automated tests: YES (TDD) / YES (after) / NO
- Framework: [discovered or TBD]
- Agent-Executed QA: ALWAYS (mandatory regardless of test choice)
```

   Source of truth: `rules/prometheus-plan-brief.mdc` (always-applied rule). The drift-guard test in `hooks/drift-guard.test.ts` enforces alignment between this script and the brief.

   **3b. Scoping Questions**

   Ask 1-3 scoping questions via AskQuestion, informed by explore findings: "I found pattern X, should we follow it?" or "The codebase uses Y -- should we match that?"

**Clearance checklist** — evaluate after every interview turn. ALL YES → auto-transition to plan generation without user prompt:

- [ ] Core objective clearly defined?
- [ ] Scope boundaries established (IN/OUT)?
- [ ] No critical ambiguities remaining?
- [ ] Technical approach decided?
- [ ] Test strategy confirmed?
- [ ] No blocking questions outstanding?

> **Auto-transition rule:** When every item is YES, advance directly to plan generation without prompting the user. If any item is NO, resolve it first via interview or explore.

Update the draft after EVERY meaningful user response. Mark completed when all clearance items pass. Proceed immediately. (See also: `rules/orchestrator-reference.mdc` for the full Plan-mode clearance reference.)

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

5. **Oracle consultation** -- Mark `plan-oracle` in_progress.

   Always evaluate whether Oracle consultation would add value. Consider: Metis intent classification, number of tasks/modules affected, risk assessment from Metis, whether unfamiliar patterns or multi-system tradeoffs are involved.

   **IF dispatching Oracle** (Metis classified as Architecture, OR 5+ tasks, OR 3+ module boundaries, OR unfamiliar patterns, OR significant risk flags):

   Dispatch `Task(subagent_type="oracle")` with this structured context:

   ```
   Task(subagent_type="oracle", prompt=`Architecture consultation for planning:
     **User's Goal**: {summarize what user wants}
     **Metis Gap Analysis**: {full Metis output}
     **Research Findings**: {key discoveries from explore/librarian}
     **Current Understanding**: {your interpretation of requirements and approach}

     Analyze: architectural options, trade-offs, long-term implications, risks.
     Recommend a single primary approach with effort estimate.`)
   ```

   Incorporate Oracle's recommendations into the plan. Add an `## Oracle Consultation` section documenting the findings.

   **IF skipping Oracle** (simple scope, well-understood patterns, no architectural risks from Metis):

   Mark completed, but add a structured `## Oracle Consultation` section to the plan with ALL of the following:
   - **Metis Intent**: {intent classification from Metis output}
   - **Skip Reason**: {specific reason Oracle adds no marginal value -- "not Architecture" alone is NOT sufficient}
   - **What Was Reviewed Instead**: {Metis risks assessed, files/modules examined, complexity evaluation}

   Empty or generic skip reasons are forbidden. Every skip must demonstrate that Oracle's concerns were evaluated through other means.

   Mark completed. Proceed immediately.

> **STOP — read this before writing the plan.**
> Use the `Write` tool. **DO NOT** use `CreatePlan` / `cursor.create_plan` / the native plan tool. Plans MUST land at `.cursor/plans/<slug>.plan.md` on disk so `/start-work` and Atlas can read them. The native tool stores plans at `cursor-plan://` URIs invisible to downstream tools.

6. **Write plan** -- Mark `plan-write` in_progress. Write plan to `.cursor/plans/<name>.plan.md` using Write. The file must start with YAML frontmatter (`name`, `overview`, `todos`, `isProject`) before the markdown body so Cursor's plan UI can detect it; the `todos` array uses `{id, content, status}` shape matching the plan's TODOs section. Must include: TL;DR, problem analysis, implementation tasks in parallel waves, dependency matrix (mandatory for 3+ tasks), per-task acceptance criteria, QA scenarios, commit strategy, final verification wave. The dependency matrix MUST use the 4-column table format (`Task | Depends On | Blocks | Can Parallelize With`). ASCII diagrams and bullet lists are NOT valid substitutes. Mark completed.

   **Parallel execution notes:**
   - **Build in Parallel** (plan UI quick action) maps to dispatching all tasks in a wave simultaneously as `Task(run_in_background=true)` during `/start-work` — do NOT serialize independent wave tasks.
   - **`/multitask`** is the interactive equivalent for users running multi-session parallel work outside the Task orchestration flow.

   The plan's Final Verification Wave MUST include these four review tasks with their assigned agents (see `agents/prometheus.md` for full descriptions):
   - F1: Plan Compliance Audit — `oracle`
   - F2: Code Quality Review
   - F3: QA Scenario Execution
   - F4: Scope Fidelity Check

**DO NOT stop after writing the plan. Steps 7-10 are MANDATORY. Auto-continue immediately.**

7. **Self-review + summary** -- Mark `plan-review` in_progress. Read plan back and classify gaps:
- CRITICAL gaps -> flag for step 8.
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

8. **Resolve decisions** -- Mark `plan-decisions` in_progress. If critical gaps were flagged in step 7, ask user via AskQuestion and WAIT for answers. Update the plan with resolutions. If no critical gaps remain, mark completed immediately. Proceed immediately.

9. **Offer choice** -- Mark `plan-momus` in_progress. Ask user via AskQuestion: "How would you like to proceed?" with options:
- **Start Work**: "Execute now with `/start-work`. Plan looks solid."
- **Momus High Accuracy Review**: "Have Momus rigorously verify every detail. Adds review loop but guarantees precision."
If Momus: dispatch `Task(subagent_type="momus")` with ONLY the plan file path as the prompt. Do NOT wrap in explanations.
  - If REJECT: fix ALL issues raised in the plan and automatically resubmit to Momus. Do NOT ask between iterations -- the loop runs automatically up to the cap. If the user explicitly requests to stop mid-loop (e.g. "stop Momus", "accept the plan"), honor that and proceed to handoff.
  - If at iteration cap (4): ask user via AskQuestion: "Momus iteration limit reached. Continue reviewing or accept current plan?" If continue, resubmit. If accept, proceed to handoff.
  - If OKAY: proceed to handoff. BUT if user subsequently requests plan changes after Momus approval, you MUST ask via AskQuestion: "Plan changed since Momus approved it. Want a new Momus review?" This is NOT optional -- always ask, never skip or defer. If yes, mark `plan-momus` in_progress (resets iteration counter) and resubmit. If no, proceed to handoff.
  - If user chose Start Work initially (Momus never ran) but later requests significant plan changes, you MUST ask via AskQuestion: "Significant plan changes detected. Would you like a Momus review before proceeding?" This is NOT optional -- always ask when the agent judges the changes are significant. If yes, mark `plan-momus` in_progress and submit. If no, proceed to handoff.
Mark completed when user chooses Start Work, Momus says OKAY with no further changes, or user explicitly stops the loop mid-iteration.

10. **Handoff** -- Mark `plan-handoff` in_progress. Delete the draft file (`.cursor/drafts/{sessionId-short}-{name}.md`). Tell user: "Plan ready. Run `/start-work` or switch to Agent mode." Mark completed.

**Agent type restriction:** Only `explore`, `metis`, `momus`, `librarian`, and `oracle` subagent types are allowed in plan mode. Any other type (including `generalPurpose`) will be denied by the tool guard.

For detailed clearance checklist, intent classification table, allowed/forbidden tools, and subagent fallback: see `orchestrator-reference.mdc` Plan Mode section.

**Subagent fallback**: If `SwitchMode(plan)` is rejected, dispatch `Task(subagent_type="prometheus")` with the user's request instead.
