The `hooks/hooks.json` file includes a `beforeMCPExecution` prompt hook entry (`type: "prompt"`, currently around lines 14-16) that performs an LLM safety review with `failClosed: true`. This review is part of Cursor's hook runtime, so it executes outside the oh-my-cursor daemon process.

Because the hook runs in Cursor's runtime (not in our daemon), there is no daemon-side timeout we can apply to it. If you need to disable this behavior, edit `hooks/hooks.json` directly and remove the second array entry under `beforeMCPExecution`.

The `safety.mcp_llm_review_enabled` config flag is currently advisory only. Future tooling may use it to automatically strip or restore the `beforeMCPExecution` prompt-hook entry.
