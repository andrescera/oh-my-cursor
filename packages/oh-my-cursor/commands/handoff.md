Create a detailed context summary for continuing work in a new session.

## When to Use

- Context window approaching capacity
- Quality is degrading from long conversation
- Want to start fresh while preserving essential context

## Process

1. Gather session history, todos, git diff, uncommitted changes
2. Extract key decisions, work completed, pending tasks
3. Format as self-contained handoff summary
4. Provide instructions for continuing in a new session

## Output Format

The handoff includes:
- USER REQUESTS (verbatim)
- GOAL (one sentence)
- WORK COMPLETED (first person bullets)
- CURRENT STATE (codebase state)
- PENDING TASKS (with todo state)
- KEY FILES (max 10, prioritized)
- IMPORTANT DECISIONS (with reasoning)
- CONTEXT FOR CONTINUATION (warnings, gotchas)
