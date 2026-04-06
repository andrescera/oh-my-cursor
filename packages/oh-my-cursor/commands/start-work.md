Start a work session from an existing plan.

## What to Do

1. **Find available plans**: Search for plan files at `.sisyphus/plans/` or `.cursor/plans/`
2. **Select plan**: If one plan, auto-select. If multiple, list with timestamps and ask user.
3. **Read the plan**: Read the full plan file before starting any work
4. **Decompose into todos**: Break every plan task into granular, implementation-level sub-steps
5. **Register todos**: TodoWrite ALL sub-steps before starting work
6. **Execute**: Follow atlas delegation protocols -- delegate via Task tool in parallel waves

## Task Breakdown (MANDATORY)

Each plan checkbox item must be split into concrete sub-tasks:
- Each sub-task touches a clear set of files/functions
- Include: file to modify, what to change, expected behavior, how to verify
- "implement feature X" is NOT acceptable
- "add validateToken() to src/auth/middleware.ts that checks JWT expiry" IS acceptable

## Critical

- Read the FULL plan file before delegating any tasks
- Always track progress with todos
- Follow parallel wave execution from the plan
- Verify each completed task before moving to the next
