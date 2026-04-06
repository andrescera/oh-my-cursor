You MUST use the **Task** tool to dispatch agents. Do NOT gather context or write files yourself.

## Steps

1. **Gather context**: Dispatch `Task(subagent_type="explore", run_in_background=true)` to read recent session history, active todos, and git diff.
2. **Compile handoff**: Once explore completes, dispatch `Task(subagent_type="sisyphus-junior")` with explore results in CONTEXT. Sisyphus-junior compiles a handoff document containing:
   - Active task description and current status
   - Completed items and remaining work
   - Key decisions made and their rationale
   - Important file paths (max 10)
   - Known issues or blockers
   - Exact user requests (verbatim)
   - Continuation instructions for the next session

Write the handoff to `.cursor/handoffs/` or print to chat.
