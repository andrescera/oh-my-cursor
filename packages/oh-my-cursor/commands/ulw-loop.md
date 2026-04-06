Start an ULTRAWORK Loop -- a self-referential development loop that runs until verified completion.

## How It Works

1. Work on the task continuously
2. When you believe the work is complete, output: `<promise>DONE</promise>`
3. That does not finish the loop yet. The system will require Oracle verification
4. The loop only ends after the system confirms Oracle verified the result
5. There is no iteration limit

## Rules

- Focus on finishing the task completely
- After you emit the completion promise, run Oracle verification when instructed
- Do not treat DONE as final completion until Oracle verifies it

## Exit Conditions

1. **Verified Completion**: Oracle verifies the result and the system confirms it
2. **Cancel**: User runs `/cancel-ralph`

## Your Task

Parse the arguments below and begin working on the task. The format is:

`"task description" [--completion-promise=TEXT] [--strategy=reset|continue]`

Default completion promise is "DONE".
