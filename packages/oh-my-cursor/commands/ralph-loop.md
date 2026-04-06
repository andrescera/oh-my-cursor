Start a Ralph Loop -- a self-referential development loop that runs until task completion.

## How It Works

1. Work on the task continuously
2. When FULLY complete, output: `<promise>DONE</promise>`
3. If you don't output the promise, the loop automatically continues
4. Maximum iterations: configurable (default 100)

## Rules

- Focus on completing the task fully, not partially
- Don't output the completion promise until the task is truly done
- Each iteration should make meaningful progress
- If stuck, try different approaches
- Use todos to track your progress

## Exit Conditions

1. **Completion**: Output your completion promise tag when fully complete
2. **Max Iterations**: Loop stops automatically at limit
3. **Cancel**: User runs `/stop-continuation`

## Your Task

Begin working on the task described below. Keep going until done.
