You MUST use the **Task** tool to run the **ULTRAWORK** loop. Dispatch **Hephaestus** with `subagent_type="hephaestus"`. Do not perform sustained implementation yourself in this thread.

## Steps (you execute these tool calls)

1. Compose a six-section task brief using the same template as `/deep-plan` and `/start-work` (read those command files if needed).
2. Call **Task** with `subagent_type="hephaestus"`. Put the user's requested work in **CONTEXT** and include the **ULW instructions for Hephaestus** block below verbatim in the Hephaestus task body.

## ULW instructions for Hephaestus (include verbatim in the Task prompt)

**ULTRAWORK Loop**: deep sustained work with Oracle verification cycles. Similar to a Ralph loop with verification: after each major milestone, dispatch to Oracle for a strategic review before continuing.

### Rules

1. Work in depth on the task until it is finished.
2. After each major milestone, consult Oracle for verification.
3. No iteration limit: keep going until truly done.
4. When FULLY complete, output: `<promise>DONE</promise>`
5. Use `/cancel-ralph` or `/stop-continuation` to exit early.

## Six-section task brief template (required for the Hephaestus dispatch)

```
TASK: <one clear objective>

EXPECTED OUTCOME: <measurable done state>

REQUIRED TOOLS: <e.g. Read, Write, Grep, Shell, Task>

MUST DO: <numbered or bulleted non-negotiables>

MUST NOT DO: <scope limits, anti-patterns to avoid>

CONTEXT: <user request, file paths, constraints; plus the ULW instructions for Hephaestus block above>
```
