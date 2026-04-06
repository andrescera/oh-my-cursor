You MUST use the **Task** tool to dispatch `Task(subagent_type="sisyphus")` for AI slop cleanup. Do NOT run `git diff` yourself in this thread. Do NOT edit files yourself. Sisyphus owns diff discovery, parallel workers, review, and fix loops.

## Steps (you execute these tool calls)

1. **Dispatch sisyphus**: Call **Task** with `subagent_type="sisyphus"`. Use the six-section brief below. Put the following block in **CONTEXT** so Sisyphus runs the full workflow internally.

## What Sisyphus must do (include in the Sisyphus Task prompt)

1. **Diff**: Run `git diff --name-only` against the default branch to find changed files.
2. **Parallel cleanup**: Dispatch parallel `Task(subagent_type="sisyphus-junior")` workers with the `ai-slop-remover` skill, one per changed file.
3. **Review**: Collect results and review each file for remaining issues.
4. **Fix loop**: If issues remain, re-run cleanup on affected files.

Each worker applies the ai-slop-remover skill to identify and fix: over-commenting, unnecessary abstractions, generic names, AI-generated boilerplate, and redundant type assertions.

## Six-section task brief template (required for the Sisyphus dispatch)

```
TASK: <one clear objective>

EXPECTED OUTCOME: <measurable done state>

REQUIRED TOOLS: <tool whitelist>

MUST DO: <numbered non-negotiables>

MUST NOT DO: <scope limits>

CONTEXT: <file paths, branch name if relevant, constraints>
```

Keep Sisyphus **CONTEXT** explicit: default branch for diff, list of concerns above, and that downstream juniors must load `ai-slop-remover` per file.
