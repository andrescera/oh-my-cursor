Build a handoff document for continuing work in a new session.

## Steps

1. **Gather context**: Dispatch explore to read recent session history, active todos, and git diff.
2. **Synthesize**: Dispatch sisyphus-junior to compile a handoff document with:
   - Active task description and current status
   - Completed items and remaining work
   - Key decisions made and their rationale
   - Important file paths (max 10)
   - Known issues or blockers
   - Exact user requests (verbatim)
   - Continuation instructions for the next session

Write the handoff to `.cursor/handoffs/` or print to chat.
