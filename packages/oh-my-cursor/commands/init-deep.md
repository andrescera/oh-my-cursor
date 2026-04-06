You MUST use the **Task** tool to dispatch agents for each phase below. Do NOT describe what should happen -- actually make the tool calls. Use **TodoWrite** to track phase progress. Apply **Flags** to both phases where they affect traversal or output.

## Phase 1 -- Explore (background)

Dispatch `Task(subagent_type="explore", run_in_background=true)` for a structure scan and code analysis: directory layout, file counts, module boundaries, key entry points, architecture patterns, dependency graphs, test infrastructure, and build system. Respect `--max-depth N` when scanning. Batch related searches into a single explore dispatch where possible. Use the six-section brief.

## Phase 2 -- AGENTS.md synthesis and write

Once Phase 1 completes, dispatch `Task(subagent_type="sisyphus-junior")` with exploration results in CONTEXT. Merge findings into a structured `AGENTS.md`: overview, module descriptions, key patterns, conventions, and anti-patterns. Create or update `AGENTS.md` at the project root. Honor `--create-new` when generating a fresh file (ignore existing).

## Flags

- `--create-new`: Generate fresh AGENTS.md (ignore existing)
- `--max-depth N`: Limit directory traversal depth (default: 3)

## Six-section task brief template (required for every Task dispatch)

```
TASK: <one clear objective>
EXPECTED OUTCOME: <measurable done state>
REQUIRED TOOLS: <tool whitelist>
MUST DO: <numbered non-negotiables>
MUST NOT DO: <scope limits>
CONTEXT: <file paths, prior phase results, constraints>
```
