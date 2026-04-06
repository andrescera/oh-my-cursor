Activate a **Ralph Loop** -- a self-referential development loop that runs until task completion.

The stop hook will automatically continue the session after each turn. Work continuously until the task is fully complete.

## Rules

1. Focus on completing the task fully, not partially
2. Each iteration must make meaningful progress -- no busy work
3. Use TodoWrite to track progress across iterations
4. If stuck after 3 attempts at the same approach, try a different strategy
5. When FULLY complete, output: `<promise>DONE</promise>`
6. The loop auto-continues until you output the promise or hit max iterations

## Exit Conditions

- **Completion**: Output `<promise>DONE</promise>` when truly done
- **Max iterations**: Loop stops at the configured limit (default: unlimited)
- **Manual cancel**: User runs `/cancel-ralph` or `/stop-continuation`

## Your Task

Begin working on the task described below. Keep going until done.
