Run a **Ralph loop**: a self-referential development loop that continues until the task is complete. You MUST use the **Task** tool: call **Task** with `subagent_type="sisyphus"`. Do NOT drive the loop, implement work, or substitute for sisyphus in this thread. Dispatch exactly one **Task** to **sisyphus** that carries the user's goal plus the continuation mechanics, rules, and exit conditions below.

## Steps (you execute these tool calls)

1. **Dispatch sisyphus**: Call **Task** with `subagent_type="sisyphus"`. Use the six-section brief. In **TASK** and **CONTEXT**, state the user's objective clearly. Paste the **Continuation mechanics**, **Rules**, and **Exit conditions** sections from this command into the sisyphus prompt so sisyphus runs the loop under that contract.

## Continuation mechanics (include verbatim in the sisyphus Task prompt; sisyphus owns the loop, not root)

The stop hook automatically continues the session after each turn. Sisyphus works through iterations until the task is fully complete or an exit condition applies.

- **Auto-continue**: The stop hook resumes the session after each turn until completion or limit.
- **Completion exit**: When truly done, output `<promise>DONE</promise>`.
- **Manual exit**: The user may run `/cancel-ralph` or `/stop-continuation` to stop continuation.

## Rules (include verbatim in the sisyphus Task prompt)

1. Focus on completing the task fully, not partially.
2. Each iteration must make meaningful progress with no busy work.
3. Use TodoWrite to track progress across iterations.
4. If stuck after 3 attempts at the same approach, try a different strategy.
5. When FULLY complete, output: `<promise>DONE</promise>`
6. The loop auto-continues until you output the promise or hit max iterations.

## Exit conditions (include verbatim in the sisyphus Task prompt)

- **Completion**: Output `<promise>DONE</promise>` when truly done.
- **Max iterations**: Loop stops at the configured limit (default: unlimited).
- **Manual cancel**: User runs `/cancel-ralph` or `/stop-continuation`.

## Six-section task brief template (required for the sisyphus dispatch)

```
TASK: <one clear objective; Ralph loop until done>

EXPECTED OUTCOME: <measurable done state; ends with <promise>DONE</promise> when satisfied>

REQUIRED TOOLS: <e.g. Read, Write, Grep, Shell, Task, TodoWrite>

MUST DO: <numbered non-negotiables; include Continuation mechanics, Rules, and Exit conditions from the ralph-loop command>

MUST NOT DO: <scope limits, anti-patterns to avoid>

CONTEXT: <full user request, file paths, constraints>
```

Keep **CONTEXT** rich: paste the user's exact task from the message that invoked this command.
