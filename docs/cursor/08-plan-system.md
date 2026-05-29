# Plan System

> Cursor 3.6.21 (cursor-bin 3.6.21-1, vscodeVersion 1.105.1, commit e7a7e93f4d75f8272503ecf33cedbaae10114a10). Evidence tags per claim. Re-audited 2026-05-29; claims carry per-claim `last-verified` markers — unmarked claims retain their 3.0.16 baseline and were not re-verified at 3.6.21.

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

- **Prometheus** (planner agent) **writes** plans via the **Write** tool to .cursor/plans/. [repro-local]
- **Atlas** (orchestrator) **executes** plan phases. [repro-local]

## Cursor 3.1 → 3.6 changes

> **last-verified: 3.6.21** — Re-audited 2026-05-29. Evidence tags per item. Source: `docs/internal/reaudit-3621/feature-discovery-3.1-3.6.md`. <!-- last-verified: 3.6.21 -->

### P-01 / A-08 · Build in Parallel (v3.3) `[official-doc]`

"Build in Parallel" quick action on any plan identifies independent steps and runs them simultaneously via async subagents; dependent steps remain ordered. Triggers the same `/multitask` machinery described in A-01.

### P-02 · Plan Tabs as Documents (v3.1) `[official-doc]`

Plan tabs now behave like file documents: reliable loading, dirty tracking, reload on plan changes, ability to save/copy/export as Markdown.

### P-03 · Plans in Shared Chats (v3.0) `[official-doc]`

Plans are included in shared chat transcripts alongside the conversation, enabling collaborators to see the full plan-execution context.

### P-04 · Plan Mode in CLI — `--plan` / `--ask` Flags `[community]`

`cursor --plan "description"` for offline planning; `cursor --ask "question"` for quick queries. Cloud handoff with `&` suffix. Introduced in v2.4 (Jan 2026) per community sources; not confirmed in official 3.x changelog. See also `docs/cursor/09-cli.md`.
