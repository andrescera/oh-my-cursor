Dispatch to **atlas** (the plan executor) to execute an existing work plan.

## Steps

1. **Find plans**: Search `.sisyphus/plans/` and `.cursor/plans/` for plan files.
2. **Select**: If one plan exists, auto-select it. If multiple, list them with timestamps and ask user to choose.
3. **Read**: Read the full plan file before any work begins.
4. **Decompose**: Break every plan task into granular, atomic sub-steps. Each sub-step must specify: file to modify, what to change, expected behavior, and how to verify. "Implement feature X" is NOT acceptable.
5. **Register todos**: TodoWrite ALL sub-steps before starting.
6. **Execute**: Delegate in parallel waves following the plan's dependency matrix. Use sisyphus-junior for single-file tasks, sisyphus for multi-file work. Dispatch explore agents in background for context gathering.
7. **Verify**: Each executor self-verifies (lints, tests, build) before reporting success.

Never ask "should I continue?" between plan steps. Only stop when blocked by ambiguity.
