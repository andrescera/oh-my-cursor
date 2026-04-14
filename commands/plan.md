If not already in Plan mode, call `SwitchMode(plan)` first.

The Prometheus planning workflow auto-executes when Plan mode is active (defined in `orchestrator.mdc` and detailed in `orchestrator-reference.mdc`).

Treat the user's message following this command as the planning objective. If the user provided a request, begin the interview step using that request as context.

If `SwitchMode(plan)` is rejected or unavailable, fall through to subagent mode: dispatch `Task(subagent_type="prometheus")` with the user's request using the six-section brief format from `orchestrator-reference.mdc`.
