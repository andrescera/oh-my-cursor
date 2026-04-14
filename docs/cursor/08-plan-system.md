# Plan System

> Cursor 3.0.16. Evidence tags per claim.

Evidence tags: `[official-doc]`, `[changelog]`, `[repro-local]`, `[binary-only]`, `[community]`.

## Activation

Plan-oriented workflows can be entered via:

- **Shift+Tab** (mode cycle including Plan) [official-doc]
- Slash **`/plan`** [official-doc]
- CLI **`--plan`** / **`--mode plan`** on the agent CLI [official-doc]

## Plan files

- Plans are persisted as Markdown with a **`.plan.md`** suffix. [repro-local]
- Default location is under **`~/.cursor/plans/`**; workspace-relative **`.cursor/plans/`** is used when saved to the project. [official-doc] + [repro-local]
- Observed naming pattern: **`<slug>_<8-hex>.plan.md`** (example in this repo: `.cursor/plans/cursor-native-features-research.plan.md`). [repro-local]

## Plan UI

Cursor exposes plan content and approval flow inside the composer / plan UI (create, review, attach to session). [official-doc]

## Shared chats (3.0)

**Cursor 3.0** release material describes plans in the context of **shared chats** / collaboration updates. [changelog 3.0]

## Internal implementation (not a public API)

Shipped client code uses virtual plan URIs (**`cursor-plan://`**, minified references such as **`cursorPlan`**) and internal plan file helpers (e.g. symbols like **`planFileUtils`** in bundles). Behavior and names **change between builds**; do not rely on them from extensions or scripts. See also `docs/cursor/16-binary-analysis.md` (Plan System section). [binary-only]

## ACP

The **Agent Control Protocol** includes a **`cursor/create_plan`** method for external clients driving plan creation. [official-doc]

## oh-my-cursor

- **Prometheus** (planner agent) **writes** plans. [repro-local]
- **Atlas** (orchestrator) **executes** plan phases. [repro-local]
