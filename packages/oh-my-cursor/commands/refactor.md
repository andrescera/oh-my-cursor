Dispatch to **sisyphus** for intelligent refactoring with full codebase awareness. You MUST use the **Task** tool: call **Task** with `subagent_type="sisyphus"`. Do NOT perform refactoring exploration, planning, or edits yourself in this thread. Dispatch exactly one **Task** to **sisyphus** that carries the user's refactoring request plus the phases and rules below.

## Steps (you execute these tool calls)

1. **Dispatch sisyphus**: Call **Task** with `subagent_type="sisyphus"`. Use the six-section brief. In **TASK** and **CONTEXT**, state the user's refactoring goal clearly. Paste the **Phases** and **Rules** sections from this command into the sisyphus prompt so sisyphus treats them as its execution contract.

## Phases (include verbatim in the sisyphus Task prompt; sisyphus runs these, not root)

1. **Intent gate**: Parse the refactoring target, scope (file/module/project), and strategy (safe/aggressive). If ambiguous, ask ONE clarifying question.
2. **Parallel exploration**: Dispatch explore agents to map dependencies, find all references, identify impact zones, and check test coverage.
3. **Codemap**: Build dependency graph and impact analysis from exploration results.
4. **Test assessment**: Evaluate test coverage. If coverage is low for affected areas, pause and inform user.
5. **Plan**: Create detailed refactoring plan with atomic steps and rollback checkpoints.
6. **Execute**: Step-by-step refactoring with continuous verification. Run lints and tests after EVERY change. Use Grep and Glob for dependency analysis, StrReplace for precise renames.
7. **Verify**: Full test suite, type check, lint check after completion.

## Rules (include verbatim in the sisyphus Task prompt)

- ALWAYS dry-run before applying
- Run tests after EVERY change -- never proceed with failing tests
- Follow existing codebase patterns
- Commit at logical checkpoints
- On 3 consecutive failures: revert to last working state and ask user

## Six-section task brief template (required for the sisyphus dispatch)

```
TASK: <one clear objective>

EXPECTED OUTCOME: <measurable done state>

REQUIRED TOOLS: <e.g. Read, Write, Grep, Glob, StrReplace, Shell, Task>

MUST DO: <numbered or bulleted non-negotiables; include the Phases and Rules above>

MUST NOT DO: <scope limits, anti-patterns to avoid>

CONTEXT: <user request, file paths, constraints, prior decisions>
```

Keep **CONTEXT** rich: exact user wording for the refactor, any paths or modules they named, and repo-specific constraints if known.
