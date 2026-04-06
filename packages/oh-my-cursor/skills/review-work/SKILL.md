---
name: review-work
description: "Post-implementation review orchestrator. Runs 5 parallel review agents to verify code quality, plan compliance, and test coverage. Use after completing a work plan."
---

# Review Work Skill

Run a comprehensive post-implementation review with 5 parallel verification agents.

## When to Use

After completing a work plan or significant implementation, use this skill to verify quality.

## Review Agents (run in parallel)

1. **Plan Compliance**: Verify all plan requirements are met
2. **Code Quality**: Check for anti-patterns, type safety, test coverage
3. **QA Scenarios**: Execute all QA scenarios from the plan
4. **Scope Fidelity**: Verify no scope creep or missing deliverables
5. **Integration Check**: Verify cross-module interactions work

## Process

1. Launch all 5 review agents simultaneously
2. Collect results from each
3. ALL must APPROVE for the review to pass
4. Present consolidated results to user
5. Fix any issues and re-review if needed
