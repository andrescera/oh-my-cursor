You MUST use the **Task** tool to dispatch agents. Do NOT perform plan execution work yourself in this thread.

## Steps (you execute these tool calls)

1. **Discover plans**: Use **Glob** (and **Read** as needed) on `.cursor/plans/**` to list plan files.
2. **Choose plan**: If exactly one plan, use it. If multiple, use **AskQuestion** so the user picks which plan to run.
3. **Dispatch atlas**: Call **Task** with `subagent_type="atlas"`. Paste the **full** chosen plan file contents into the task prompt. Use the six-section brief below for that dispatch.

## What atlas must do (include verbatim in the atlas Task prompt)

- Decompose the plan into atomic steps (file, change, expected behavior, verification).
- Use **TodoWrite** to register and update todos for all steps before and during execution.
- Delegate implementation only via **Task**: `subagent_type="sisyphus-junior"` for single-file tasks; `subagent_type="sisyphus"` for multi-file or cross-cutting work. Each downstream **Task** must use the same six-section brief format.
- Never ask "should I continue?" between plan steps. Only stop when blocked by ambiguity.

## Six-section task brief template (required for atlas and every delegated Task)

```
TASK: <one clear objective>

EXPECTED OUTCOME: <measurable done state>

REQUIRED TOOLS: <e.g. Read, Write, Grep, Shell, Task>

MUST DO: <numbered or bulleted non-negotiables>

MUST NOT DO: <scope limits, anti-patterns to avoid>

CONTEXT: <plan excerpt, file paths, constraints, prior decisions>
```

Keep atlas’s **CONTEXT** section rich: full plan text, selected file paths, and dependency order from the plan.
