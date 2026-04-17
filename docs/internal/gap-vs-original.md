# Gap Analysis: oh-my-openagent (Cursor plugin) vs oh-my-openagent-original (OpenCode plugin)

_Generated: 2026-04-17T13:18:20Z_
_Plan: `<home>/.cursor/plans/gap_vs_original_plus_top_3_ports_36338f6a.plan.md`_
_Cross-references:_
- _Cycle-1 hook empirical report: [docs/hooks-empirical-report.md](../hooks-empirical-report.md)_
- _Cycle-2 field catalog plan: `<home>/.cursor/plans/hooks_cycle_2_field_catalog_2b74fe6d.plan.md`_
- _Prior audit: [docs/internal/agent-nativeness-audit.md](./agent-nativeness-audit.md)_

## Executive Summary

The reference (`oh-my-openagent-original`) is a Bun/TypeScript OpenCode plugin (oh-my-opencode v3.17.0) with 52 programmatic hooks, 11 named agents, 9 builtin commands, 8 builtin skills, 3 MCPs, and GitHub Actions CI; this repo is a Cursor plugin with a 20-event `hooks.json` surface where agents, commands, skills, and rules are static markdown. The agent personas and command set are equivalent at the markdown level, and all 3 original MCPs are already-ported declaratively. The critical gap is the OpenCode programmatic-hook surface: of 52 original hooks, 6 are already-ported, 19 require cycle-2 field-catalog knowledge to port, and 15 are unbridgeable by architecture (attached to OpenCode-only events such as `chat.message` mutation, `chat.params`, `experimental.chat.messages.transform`, and `tool.definition`).

### Tier counts (all 7 surfaces, aggregated)

| Tier | Count | % of 104 |
|---|---:|---:|
| already-ported | 32 | 30.8% |
| portable-without-cycle-2 | 6 | 5.8% |
| portable-with-cycle-2 | 19 | 18.3% |
| partially-portable-with-caveats | 15 | 14.4% |
| unbridgeable-by-architecture | 32 | 30.8% |
| **TOTAL** | **104** | **100%** |

### Per-surface counts

| Surface | Total | 1-already | 2-w/o-c2 | 3-with-c2 | 4-partial | 5-unbridgeable |
|---|---:|---:|---:|---:|---:|---:|
| S1 Agents | 16 | 5 | 0 | 0 | 7 | 4 |
| S2 Commands | 9 | 9 | 0 | 0 | 0 | 0 |
| S3 Skills | 8 | 7 | 1 | 0 | 0 | 0 |
| S4 Rules | 2 | 1 | 0 | 0 | 1 | 0 |
| S5 Hooks | 52 | 6 | 5 | 19 | 7 | 15 |
| S6 MCP | 4 | 4 | 0 | 0 | 0 | 0 |
| S7 CI+Pkg | 13 | 0 | 0 | 0 | 0 | 13 |
| **TOTAL** | **104** | **32** | **6** | **19** | **15** | **32** |

## Method & Scope

### 5-tier definitions

Per-row schema: `surface | original-path | current-path-or-— | tier | cycle-2-dep (Y/N) | ROI (0-5) | rationale`.

1. **already-ported** — exists in this repo with equivalent intent.
2. **portable-without-cycle-2** — can be ported using existing Cursor hook contract (no new response-field knowledge needed) or is a non-hook surface (skill, command, agent, MCP, rule).
3. **portable-with-cycle-2** — porting requires a specific Cursor response field whose semantics must be confirmed by cycle-2 (cites the exact field e.g. `additional_context`, `updated_input`, `followup_message`, `user_message`, `env`, `continue`).
4. **partially-portable-with-caveats** — concept ports, but behavior diverges (e.g. rules-injector can inject via `additional_context` but Cursor doesn't support pre-tool-context mutation the same way).
5. **unbridgeable-by-architecture** — auto-classified from the OUT list below; no analysis cycle spent.

### Scope IN (7 surfaces)

- **agents/**: 12 `.md` here vs 11 in original; dynamic agents are excluded-by-architecture.
- **commands/**: 16 here vs 9 in original (check superset fidelity).
- **skills/**: 7 vs 8 (`playwright-cli` missing).
- **rules/**: 7 `.mdc` vs 1 explicit + `rules-injector` hook behavior.
- **hooks/**: 52 original hooks vs 18 wired `hooks.json` events here; per-hook tier classification.
- **MCP**: `mcp.json` vs `oh-my-openagent-original/src/mcp/`.
- **CI + packaging**: `.github/workflows/*.yml` + `bin/oh-my-opencode.js` vs `install.sh` + `install.ps1` + `automations/`.

### Scope OUT (pre-declared unbridgeable-by-architecture)

| Category | Path | Reason |
|---|---|---|
| Runtime scaffolding | `src/features/*` (19 packages: `background-agent`, `boulder-state`, `claude-code-*` (×4), `claude-tasks`, `context-injector`, `hook-message-injector`, `mcp-oauth`, `opencode-skill-loader`, `run-continuation-state`, `skill-mcp-manager`, `task-toast-manager`, `tmux-subagent`, `tool-metadata-store`) | Requires OpenCode plugin runtime with typed TS lifecycle; Cursor has no equivalent |
| Plugin internals | `src/cli/`, `src/openclaw/`, `src/plugin-handlers/`, `src/plugin/`, `src/tools/`, `src/shared/`, `src/testing/`, `src/config/`, `src/generated/` | OpenCode plugin internals, not user-facing |
| Dynamic agents | `src/agents/builtin-agents/*.ts`, `dynamic-agent-*.ts`, `agent-builder.ts` | Cursor agents are static markdown; no runtime prompt-builder surface |
| Autonomous CI | `.github/workflows/sisyphus-agent.yml`, `refresh-model-capabilities.yml`, `publish*.yml`, `cla.yml`, `lint-workflows.yml` | GH Actions + hosted runner + npm ecosystem; different distribution model |
| Platform packaging | `packages/` (platform optional), `bin/oh-my-opencode.js`, `postinstall.mjs` | npm distribution model vs Cursor plugin install script |
| OpenCode-only hook events | Hooks attached to `chat.params`, `experimental.chat.messages.transform`, `tool.definition`, `chat.message` mutation, `command.execute.before`, arbitrary `event` subtypes (`permission.*`, `message.part.*`, `session.status`) | Cursor's `hooks.json` does not expose these events |

### Cycle-2 dependency semantics

A row with `cycle-2-dep = Y` means the port requires specific Cursor hook-response-field behavior that must be confirmed by the cycle-2 field catalog plan (`hooks_cycle_2_field_catalog_2b74fe6d.plan.md`). The rationale for each such row names the exact response field required (e.g. `additional_context`, `updated_input`, `followup_message`, `user_message`, `env`, `permission`); porting cannot be finalized until that field's `takes-effect` status is confirmed by the cycle-2 catalog.

## Surface S1 — Agents

Eleven named agent TypeScript sources in the original repo map to twelve markdown agent files here (coordinator is a Cursor-native addition). Four runtime scaffolding entries are auto-classified unbridgeable; seven agents carry model-variant prompt gaps classified as partially-portable-with-caveats.

| surface | original-path | current-path-or-— | tier | cycle-2-dep | ROI | rationale |
|---|---|---|---|---|---|---|
| agents | src/agents/atlas/agent.ts | agents/atlas.md | partially-portable-with-caveats | N | 4 | Model-variant prompts (GPT/Gemini) present in original; Cursor .md has single-variant prompt only. |
| agents | src/agents/explore.ts | agents/explore.md | already-ported | N | 0 | Single embedded prompt; markdown file present with equivalent agent intent. |
| agents | src/agents/hephaestus/agent.ts | agents/hephaestus.md | partially-portable-with-caveats | N | 4 | Multiple GPT-family prompt variants in original; Cursor .md is single static prompt only. |
| agents | src/agents/librarian.ts | agents/librarian.md | already-ported | N | 0 | Single embedded prompt; markdown file present with equivalent agent intent. |
| agents | src/agents/metis.ts | agents/metis.md | already-ported | N | 0 | Single exported system prompt; markdown captures pre-planning consultant intent. |
| agents | src/agents/momus.ts | agents/momus.md | partially-portable-with-caveats | N | 4 | Default and GPT-optimized prompt variants in original; Cursor .md has single-variant prompt only. |
| agents | src/agents/multimodal-looker.ts | agents/multimodal-looker.md | already-ported | N | 0 | Single embedded prompt; markdown file present with equivalent agent intent. |
| agents | src/agents/oracle.ts | agents/oracle.md | partially-portable-with-caveats | N | 4 | Default and GPT-optimized prompt variants in original; Cursor .md has single-variant prompt only. |
| agents | src/agents/prometheus/system-prompt.ts | agents/prometheus.md | partially-portable-with-caveats | N | 4 | Model-variant prompts (GPT/Gemini) present in original; Cursor .md has single-variant prompt only. |
| agents | src/agents/sisyphus/default.ts | agents/sisyphus.md | partially-portable-with-caveats | N | 4 | Model-variant prompts (default, Gemini, GPT-5.4) in original; Cursor .md has single-variant prompt only. |
| agents | src/agents/sisyphus-junior/agent.ts | agents/sisyphus-junior.md | partially-portable-with-caveats | N | 4 | Multiple model-specific prompt source files in original; Cursor .md has single-variant prompt only. |
| agents | — | agents/protocols/coordinator.md | already-ported | N | 0 | Cursor-native addition, no original equivalent. |
| agents | src/agents/agent-builder.ts | — | unbridgeable-by-architecture | N | 0 | No Cursor equivalent for programmatic agent construction. |
| agents | src/agents/builtin-agents/*.ts | — | unbridgeable-by-architecture | N | 0 | OpenCode TS agent-builder scaffolding; Cursor agents are static markdown. |
| agents | src/agents/builtin-agents.ts | — | unbridgeable-by-architecture | N | 0 | TS registry wiring for built-in agents; not representable as static agent markdown. |
| agents | src/agents/dynamic-agent-*.ts | — | unbridgeable-by-architecture | N | 0 | Runtime prompt-builder surface not exposed by Cursor. |

## Surface S2 — Commands

All nine original builtin commands map to markdown counterparts in this repo. Inventory is name-level; content parity vs original TS templates not verified.

| surface | original-path | current-path-or-— | tier | cycle-2-dep | ROI | rationale |
|---|---|---|---|---|---|---|
| commands | src/features/builtin-commands/commands.ts:28 | commands/init-deep.md | already-ported | N | 0 | Name-level match; content parity not verified (markdown vs TS templates). |
| commands | src/features/builtin-commands/commands.ts:39 | commands/ralph-loop.md | already-ported | N | 0 | Name-level match; content parity not verified. |
| commands | src/features/builtin-commands/commands.ts:50 | commands/ulw-loop.md | already-ported | N | 0 | Name-level match; content parity not verified. |
| commands | src/features/builtin-commands/commands.ts:61 | commands/cancel-ralph.md | already-ported | N | 0 | Name-level match; content parity not verified. |
| commands | src/features/builtin-commands/commands.ts:67 | commands/refactor.md | already-ported | N | 0 | Name-level match; content parity not verified. |
| commands | src/features/builtin-commands/commands.ts:75 | commands/start-work.md | already-ported | N | 0 | Name-level match; content parity not verified. |
| commands | src/features/builtin-commands/commands.ts:92 | commands/stop-continuation.md | already-ported | N | 0 | Name-level match; content parity not verified. |
| commands | src/features/builtin-commands/commands.ts:98 | commands/remove-ai-slops.md | already-ported | N | 0 | Name-level match; content parity not verified. |
| commands | src/features/builtin-commands/commands.ts:108 | commands/handoff.md | already-ported | N | 0 | Name-level match; content parity not verified. |

## Surface S3 — Skills

Seven of eight original builtin skills are already-ported. The `playwright-cli` config-switch variant is the only gap.

| surface | original-path | current-path-or-— | tier | cycle-2-dep | ROI | rationale |
|---|---|---|---|---|---|---|
| skills | src/features/builtin-skills/skills/ai-slop-remover.ts | skills/ai-slop-remover/SKILL.md | already-ported | N | 0 | Markdown port matches `name: ai-slop-remover`; frontmatter shortens TS description. |
| skills | src/features/builtin-skills/skills/dev-browser.ts | skills/dev-browser/SKILL.md | already-ported | N | 0 | YAML `name`/`description` align with original BuiltinSkill. |
| skills | src/features/builtin-skills/skills/frontend-ui-ux.ts | skills/frontend-ui-ux/SKILL.md | already-ported | N | 0 | One-line description unchanged; body role header preserved. |
| skills | src/features/builtin-skills/skills/git-master.ts | skills/git-master/SKILL.md | already-ported | N | 0 | Composed TS template split across sections; SKILL.md keeps same git-master identity. |
| skills | src/features/builtin-skills/skills/playwright.ts | skills/playwright/SKILL.md | already-ported | N | 0 | MCP `npx` + `@playwright/mcp@latest` documented in SKILL header section. |
| skills | src/features/builtin-skills/skills/playwright-cli.ts | — | portable-without-cycle-2 | N | 2 | Config-switch variant of playwright; likely merges into playwright SKILL.md with browserProvider flag. |
| skills | src/features/builtin-skills/skills/review-work.ts | skills/review-work/SKILL.md | already-ported | N | 0 | Frontmatter still "5 parallel review agents"; table uses different subagent type labels vs TS. |
| skills | src/features/builtin-skills/skills/playwright.ts | skills/agent-browser/SKILL.md | already-ported | N | 0 | Second export `agentBrowserSkill` in same playwright.ts file; split to own SKILL dir in this repo. |

## Surface S4 — Rules

The original repo has one explicit rules file (`modular-code-enforcement`) plus a `rules-injector` hook performing dynamic proximity injection. The `rules-injector` is **dual-listed** here (S4, injection mechanism) and in S5 (hook event surface); see Methodology Addendum for reconciliation notes.

| surface | original-path | current-path-or-— | tier | cycle-2-dep | ROI | rationale |
|---|---|---|---|---|---|---|
| rules | .sisyphus/rules/modular-code-enforcement.md (single file; frontmatter `globs` + `alwaysApply`) | rules/modular-code-enforcement.mdc (frontmatter `globs` + `description`) | already-ported | N | — | Same intent: modular boundaries, no catch-all filenames, `index.ts` as entry only, LOC discipline. Original is stricter (200 LOC hard limit / zero-tolerance framing); current repo softens numbers and wording but policy goal matches. |
| rules | src/hooks/rules-injector/ (`createRulesInjectorHook()` registers `tool.execute.after` + no-op `tool.execute.before` + session cache clear on `session.deleted` / `session.compacted`; on read/write/edit/multiedit extracts target path from tool output, proximity-walks to find nearest rule files, dedupes per session, appends `[Rule: …]` / `[Match: …]` blocks to `output.output`) | — (No injector hook; Cursor applies rules via always-applied and glob-scoped `.cursor/rules/*.mdc`, not by mutating tool output after file tools) | partially-portable-with-caveats | Y | 4 | Porting dynamic proximity injection depends on `postToolUse.additional_context` (cycle-2); behavior diverges from OpenCode's post-hoc string injection on `tool.execute.after` `output.output`. Dual-listed in S5. |

## Surface S5 — Hooks

The hooks surface is the largest (52 rows) and the primary driver of the gap. Cursor's 20-event `hooks.json` contract covers a subset of OpenCode's event stream; 19 hooks require cycle-2 field-catalog confirmation before porting can proceed, and 15 are unbridgeable by architecture.

> **Reconciliation applied:** `rules-injector` row has `cycle-2-dep` corrected from N (W1e) to Y (unified with W1d; see Methodology Addendum). `model-fallback` remains `unbridgeable-by-architecture` per W1e analysis (see Methodology Addendum).

| surface | original-path | current-path-or-— | tier | cycle-2-dep | ROI | rationale |
|---|---|---|---|---|---|---|
| `handler` + `session.idle` + `session.error` + `session.compacted` + `message.*` + `tool.*` (non-idle) | src/hooks/todo-continuation-enforcer/ (`index.ts`, `handler.ts`) | hooks/hooks.json → `post-daemon.sh`; no dedicated `todo-continuation-enforcer` handler file | portable-with-cycle-2 | Y | 5 | Injects continuation via subagent follow-up; maps to `subagentStop.followup_message`. |
| `tool.execute.after` + `event` (`message.updated` for token cache, `session.deleted`) | src/hooks/context-window-monitor.ts | hooks/hooks.json + hooks/handlers/context-window-monitor.ts | already-ported | N | 1 | Appends reminder to tool output when usage crosses threshold; ported as `postToolUse.additional_context`. |
| Plugin `event.ts` + SDK resume (`handleSessionRecovery`) | src/hooks/session-recovery/ (`hook.ts` exports API; wired from plugin) | — | portable-with-cycle-2 | Y | 4 | Needs recovery prompt or env injection; approximate via `sessionStart.user_message` or `env`. |
| `event` (`session.created`, `session.idle`, `message.updated`, `permission.*`, `tool.execute.*`, `session.deleted`) | src/hooks/session-notification.ts | — | portable-without-cycle-2 | N | 2 | Desktop or OS notifications from idle and activity; file logging or `sessionStart` suffices without response mutation. |
| `tool.execute.before` + `tool.execute.after` | src/hooks/comment-checker/ (`hook.ts`) | hooks/hooks.json + hooks/handlers/comment-checker.ts | already-ported | N | 4 | Blocks or rewrites tool args and output; uses `preToolUse` / `postToolUse` response fields in Cursor port. |
| `tool.execute.after` | src/hooks/tool-output-truncator.ts | hooks/hooks.json + hooks/handlers/tool-output-truncator.ts | already-ported | N | 3 | Truncates long outputs; `postToolUse.additional_context` or output shaping. |
| `tool.execute.before` | src/hooks/question-label-truncator/hook.ts | — | portable-with-cycle-2 | Y | 3 | Rewrites args before execution; `preToolUse.updated_input`. |
| `tool.execute.before` + `tool.execute.after` | src/hooks/directory-agents-injector/hook.ts | — | portable-with-cycle-2 | Y | 3 | Injects directory agent hints after reads; `postToolUse.additional_context`. |
| `tool.execute.before` + `tool.execute.after` | src/hooks/directory-readme-injector/hook.ts | — | portable-with-cycle-2 | Y | 3 | Injects README summaries; `postToolUse.additional_context`. |
| `tool.execute.after` | src/hooks/empty-task-response-detector.ts | hooks/hooks.json + hooks/handlers/empty-task-detector.ts | already-ported | N | 3 | Fills empty Task output; `postToolUse` output or `additional_context`. |
| `chat.message` + `event` (`session.deleted`) | src/hooks/think-mode/hook.ts | — | unbridgeable-by-architecture | N | 1 | Mutates user message parts; `chat.message` not on Cursor twenty-event list for this behavior. |
| `chat.message` only | src/hooks/model-fallback/hook.ts | — | unbridgeable-by-architecture | N | 4 | Applies pending fallback by mutating `chat.message` only; no `preToolUse.updated_input` path in original. Reclassified from pre-planning Tier 3 hint; see Methodology Addendum. |
| `event` (`session.error`, `session.deleted`, …) + SDK compact | src/hooks/anthropic-context-window-limit-recovery/recovery-hook.ts | — | unbridgeable-by-architecture | N | 1 | Provider-specific token-limit recovery via OpenCode session APIs. |
| `tool.execute.after` + `event` (`message.updated`, `session.compacted`, `session.deleted`) + `session.summarize` | src/hooks/preemptive-compaction.ts | — | unbridgeable-by-architecture | N | 2 | Drives preemptive compaction via SDK; `session.compacted` and summarize not in Cursor hooks. |
| `tool.execute.before` + `tool.execute.after` | src/hooks/rules-injector/hook.ts | — | partially-portable-with-caveats | Y | 5 | Injects rules text; `additional_context` approximates true prompt injection timing. Dual-listed in S4 (injection mechanism); cycle-2-dep unified to Y from W1d. |
| `chat.message` + `event` | src/hooks/background-notification/hook.ts | — | portable-without-cycle-2 | N | 2 | Routes background events; optional chat injection can be dropped or logged for parity. |
| `event` (`session.created`) | src/hooks/auto-update-checker/hook.ts | — | portable-without-cycle-2 | N | 2 | One-shot startup checks and toasts; maps to `sessionStart` logging or toast script. |
| Config flag (`isHookEnabled("startup-toast")` inside auto-update) | src/hooks/auto-update-checker/hook.ts + src/hooks/auto-update-checker/hook/startup-toasts.ts | — | portable-without-cycle-2 | N | 1 | Not a standalone module; gates startup toasts only. |
| `chat.message` | src/hooks/keyword-detector/hook.ts | — | unbridgeable-by-architecture | N | 1 | Rewrites message parts from keywords; `chat.message` mutation. |
| `tool.execute.after` | src/hooks/agent-usage-reminder/hook.ts | — | portable-with-cycle-2 | Y | 3 | Appends delegation reminders; `postToolUse.additional_context`. |
| `tool.execute.before` | src/hooks/non-interactive-env/hook.ts | — | portable-with-cycle-2 | Y | 3 | Injects non-interactive env into shell args; `preToolUse.updated_input`. |
| `tool.execute.after` + `event` (`session.deleted`) | src/hooks/interactive-bash-session/hook.ts | — | unbridgeable-by-architecture | N | 1 | Tmux and `interactive_bash` tool integration; OpenCode-specific runtime. |
| `experimental.chat.messages.transform` | src/hooks/thinking-block-validator/hook.ts | hooks/hooks.json + hooks/handlers/thinking-block-validator.ts | already-ported | N | 2 | Validates thinking blocks on transform hook; Cursor uses safety handler variant. |
| `experimental.chat.messages.transform` | src/hooks/tool-pair-validator/hook.ts | — | unbridgeable-by-architecture | N | 2 | Validates tool pairs on transform only; no Cursor `experimental.chat.messages.transform`. |
| `event` (loop state machine) | src/hooks/ralph-loop/ralph-loop-hook.ts | — | partially-portable-with-caveats | N | 4 | Long-running loop orchestration; partial via `stop` plus `subagentStop.followup_message`. |
| `tool.execute.after` | src/hooks/category-skill-reminder/hook.ts | — | portable-with-cycle-2 | Y | 3 | Skill reminders after tools; `postToolUse.additional_context`. |
| `capture` + `event` (`session.compacted`, `session.idle`, `message.*` parts) | src/hooks/compaction-context-injector/hook.ts | — | unbridgeable-by-architecture | N | 1 | Relies on `session.compacted`, `message.part.delta` or `updated`, idle tail tracking. |
| `capture` + `event` (`session.compacted`, `session.deleted`) + SDK `Todo.update` | src/hooks/compaction-todo-preserver/hook.ts | — | unbridgeable-by-architecture | N | 1 | Restores todos after compaction via OpenCode todo API. |
| `experimental.session.compacting` + `chat.message` + `tool.execute.*` + `event` | src/hooks/claude-code-hooks/claude-code-hooks-hook.ts | — | partially-portable-with-caveats | N | 3 | Mix of pre-compact experimental hook and tool or message guards; only part maps to `preCompact` or `preToolUse`. |
| `chat.message` + `command.execute.before` | src/hooks/auto-slash-command/hook.ts | — | unbridgeable-by-architecture | N | 2 | Slash and command executor injection; `command.execute.before` not in Cursor twenty. |
| `tool.execute.after` | src/hooks/edit-error-recovery/hook.ts | — | portable-with-cycle-2 | Y | 3 | Rewrites failed edit output; `postToolUse.additional_context`. |
| `tool.execute.after` | src/hooks/json-error-recovery/hook.ts | — | portable-with-cycle-2 | Y | 3 | Appends JSON fix hints; `postToolUse.additional_context`. |
| `tool.execute.after` | src/hooks/delegate-task-retry/hook.ts | hooks/hooks.json + hooks/handlers/delegate-task-retry.ts | already-ported | N | 3 | Retries or annotates Task output; ported handler exists. |
| `tool.execute.before` | src/hooks/prometheus-md-only/hook.ts | — | portable-with-cycle-2 | Y | 5 | Denies non-md writes for Prometheus plans; `preToolUse.permission` = deny. |
| `tool.execute.before` | src/hooks/sisyphus-junior-notepad/hook.ts | — | portable-with-cycle-2 | Y | 4 | Rewrites Task tool input for notepad paths; `preToolUse.updated_input` when matcher Task. |
| `chat.message` | src/hooks/no-sisyphus-gpt/hook.ts | — | unbridgeable-by-architecture | N | 1 | Forces agent or model via message mutation. |
| `chat.message` | src/hooks/no-hephaestus-non-gpt/hook.ts | — | unbridgeable-by-architecture | N | 1 | Same pattern for Hephaestus routing. |
| `chat.message` + `command.execute.before` | src/hooks/start-work/start-work-hook.ts | — | partially-portable-with-caveats | N | 4 | Injects start-work template context; approximate via `beforeSubmitPrompt` with timing caveats. |
| `handler` + `tool.execute.before` + `tool.execute.after` | src/hooks/atlas/atlas-hook.ts | — | partially-portable-with-caveats | N | 4 | Multi-surface Atlas orchestration; partial via `subagentStart` or `subagentStop` plus tool guards. |
| `event` (rich stream) + SDK `session.prompt` | src/hooks/unstable-agent-babysitter/unstable-agent-babysitter-hook.ts | — | partially-portable-with-caveats | N | 3 | Watches idle or errors and nudges agents; needs `stop` plus follow-up or manual policy. |
| `tool.execute.after` | src/hooks/task-resume-info/hook.ts | — | portable-with-cycle-2 | Y | 3 | Adds resume hints after Task; `postToolUse.additional_context`. |
| `event` (`session.deleted`) + `chat.message` (no-op) + imperative `stop` | src/hooks/stop-continuation-guard/hook.ts | — | partially-portable-with-caveats | N | 3 | Continuation stop state; overlaps Cursor `stop` hook but uses OpenCode background manager APIs. |
| `tool.execute.before` | src/hooks/tasks-todowrite-disabler/hook.ts | — | portable-with-cycle-2 | Y | 4 | Denies TodoWrite; `preToolUse.permission` deny with TodoWrite matcher. |
| `event` + `chat.message` | src/hooks/runtime-fallback/hook.ts | — | unbridgeable-by-architecture | N | 1 | Heavy `message.updated` and session status orchestration plus chat mutation. |
| `tool.execute.before` + `event` (`session.deleted`) | src/hooks/write-existing-file-guard/hook.ts | — | portable-with-cycle-2 | Y | 4 | Blocks writes to existing files; `preToolUse.permission` deny. |
| `tool.execute.before` (bash only) | src/hooks/bash-file-read-guard.ts | — | portable-with-cycle-2 | Y | 3 | Warns on cat or head or tail reads; Cursor port targets `beforeShellExecution.permission` or `preToolUse` deny path for Shell. |
| `chat.params` | src/hooks/anthropic-effort/hook.ts | — | unbridgeable-by-architecture | N | 1 | Provider effort injection; `chat.params` not on Cursor surface. |
| `tool.execute.after` | src/hooks/hashline-read-enhancer/hook.ts | — | portable-with-cycle-2 | Y | 2 | Annotates Read output with hashes; `postToolUse.additional_context`. |
| `tool.execute.after` | src/hooks/read-image-resizer/hook.ts | — | portable-with-cycle-2 | Y | 2 | Rewrites image read output; `postToolUse.additional_context`. |
| `tool.definition` | src/hooks/todo-description-override/hook.ts | — | unbridgeable-by-architecture | N | 1 | Mutates tool definitions for todo display. |
| `tool.execute.before` + `tool.execute.after` | src/hooks/webfetch-redirect-guard/hook.ts | — | portable-with-cycle-2 | Y | 3 | Rewrites redirecting webfetch args or output; `preToolUse.updated_input` or post output notes. |
| `event` (`session.created`) | src/hooks/legacy-plugin-toast/hook.ts | — | portable-without-cycle-2 | N | 1 | One-shot migration toast on session create; `sessionStart` side channel. |

### Top-ROI hook candidates (from W1e, for Oracle review at W3.1)

Sorted ROI descending:

- `rules-injector` — partially-portable-with-caveats, cycle-2-dep Y, ROI 5 — High leverage for plan or policy injection; only caveat is prompt-injection timing versus `additional_context`.
- `todo-continuation-enforcer` — portable-with-cycle-2, cycle-2-dep Y, ROI 5 — Directly improves long-run task completion; needs `subagentStop.followup_message`.
- `prometheus-md-only` — portable-with-cycle-2, cycle-2-dep Y, ROI 5 — Clear deny policy for markdown plans; maps cleanly to `preToolUse.permission`.
- `model-fallback` — unbridgeable-by-architecture, cycle-2-dep N, ROI 4 — High value for reliability but stuck on `chat.message` mutation unless redesigned for `preToolUse`.
- `session-recovery` — portable-with-cycle-2, cycle-2-dep Y, ROI 4 — Recovers from assistant errors; port needs explicit `sessionStart` or env contract.
- `write-existing-file-guard` — portable-with-cycle-2, cycle-2-dep Y, ROI 4 — Prevents destructive overwrites; deny path is straightforward.
- `ralph-loop` — partially-portable-with-caveats, cycle-2-dep N, ROI 4 — Strong automation value; only partial parity with Cursor `stop` and follow-ups.
- `start-work` — partially-portable-with-caveats, cycle-2-dep N, ROI 4 — Core Sisyphus workflow; `beforeSubmitPrompt` approximates `chat.message` plus `command.execute.before`.

## Surface S6 — MCP

All three original programmatic MCPs are already-ported declaratively via `mcp.json`; this repo additionally ships the `oh-my-cursor` localhost sidecar (Cursor-native addition).

| surface | original-path | current-path-or-— | tier | cycle-2-dep | ROI | rationale |
|---|---|---|---|---|---|---|
| mcp | `createWebsearchConfig()` in src/mcp/index.ts via `createBuiltinMcps()` (skipped when `disabledMcps` contains `"websearch"`) | `mcpServers.websearch` in mcp.json (Exa URL `https://mcp.exa.ai/mcp?tools=web_search_exa`) | already-ported | N | 0 | Same MCP server wired via mcp.json vs programmatic creation. Original could also emit Tavily when configured; current JSON pins Exa default. |
| mcp | `context7` object in `createBuiltinMcps()` (skipped when `disabledMcps` contains `"context7"`) | `mcpServers.context7` in mcp.json | already-ported | N | 0 | Same remote MCP; declarative wiring only. Original optionally adds `Authorization` header from `CONTEXT7_API_KEY`; mcp.json has no headers block. |
| mcp | `grep_app` object in `createBuiltinMcps()` (skipped when `disabledMcps` contains `"grep_app"`) | `mcpServers.grep_app` in mcp.json | already-ported | N | 0 | Same remote MCP; declarative wiring only. |
| mcp | `createBuiltinMcps(disabledMcps: string[] = [])` omits builtins whose names appear in the list | `mcp_allowlist` in config.default.jsonc (default `["*"]`), validated in hooks/schemas/config.ts and enforced in hook handlers (deny when server not allowlisted) | already-ported | N | 0 | Config-level allow/deny for MCP server names; different mechanism (allowlist vs skip-list) but same control surface. Not identical semantics. |

## Surface S7 — CI + Packaging

All 13 entries are Tier 5 per plan pre-declaration. The original distributes as an npm package with GitHub Actions CI and platform-optional binaries; this repo distributes as a Cursor plugin via `install.sh`/`install.ps1`. Documented for completeness — no analysis cycles spent.

| surface | original-path | current-path-or-— | tier | cycle-2-dep | ROI | rationale |
|---|---|---|---|---|---|---|
| ci-packaging | .github/workflows/ci.yml | — | unbridgeable-by-architecture | N | 0 | GitHub Actions workflow; requires hosted runner + npm ecosystem + OpenCode CLI; not a plugin-portable artifact. |
| ci-packaging | .github/workflows/cla.yml | — | unbridgeable-by-architecture | N | 0 | GitHub Actions workflow; requires hosted runner + npm ecosystem + OpenCode CLI; not a plugin-portable artifact. |
| ci-packaging | .github/workflows/lint-workflows.yml | — | unbridgeable-by-architecture | N | 0 | GitHub Actions workflow; requires hosted runner + npm ecosystem + OpenCode CLI; not a plugin-portable artifact. |
| ci-packaging | .github/workflows/publish.yml | — | unbridgeable-by-architecture | N | 0 | GitHub Actions workflow; requires hosted runner + npm ecosystem + OpenCode CLI; not a plugin-portable artifact. |
| ci-packaging | .github/workflows/publish-platform.yml | — | unbridgeable-by-architecture | N | 0 | GitHub Actions workflow; requires hosted runner + npm ecosystem + OpenCode CLI; not a plugin-portable artifact. |
| ci-packaging | .github/workflows/refresh-model-capabilities.yml | — | unbridgeable-by-architecture | N | 0 | GitHub Actions workflow; requires hosted runner + npm ecosystem + OpenCode CLI; not a plugin-portable artifact. |
| ci-packaging | .github/workflows/sisyphus-agent.yml | — | unbridgeable-by-architecture | N | 0 | GitHub Actions autonomous coding action; conceptually similar to Cursor Cloud Agents but different infrastructure — still Tier 5. |
| ci-packaging | bin/oh-my-opencode.js | — | unbridgeable-by-architecture | N | 0 | npm CLI binary; Cursor plugins install via script, no runtime CLI surface. |
| ci-packaging | bin/platform.js + bin/platform.d.ts + bin/platform.test.ts | — | unbridgeable-by-architecture | N | 0 | npm/platform resolution and tests for packaged binaries; not applicable to Cursor plugin distribution. |
| ci-packaging | packages/darwin-* (darwin-arm64, darwin-x64, darwin-x64-baseline) | — | unbridgeable-by-architecture | N | 0 | npm platform-optional packages; different distribution model. |
| ci-packaging | packages/linux-* (linux-arm64, linux-arm64-musl, linux-x64, linux-x64-baseline, linux-x64-musl, linux-x64-musl-baseline) | — | unbridgeable-by-architecture | N | 0 | npm platform-optional packages; different distribution model. |
| ci-packaging | packages/windows-* (windows-x64, windows-x64-baseline) | — | unbridgeable-by-architecture | N | 0 | npm platform-optional packages; different distribution model. |
| ci-packaging | postinstall.mjs | — | unbridgeable-by-architecture | N | 0 | npm postinstall hook; verifies platform binary availability after npm install; Cursor plugins have no equivalent lifecycle. |

## Unbridgeable-by-Architecture Appendix

Enumerates every unbridgeable item across all 7 surfaces, grouped by category. Auto-classified from the Scope OUT list; no analysis cycles spent.

### Runtime scaffolding

- `src/agents/agent-builder.ts` — programmatic agent construction; Cursor has no runtime prompt-builder surface.
- `src/agents/builtin-agents/*.ts` (including `agent-overrides.ts`) — OpenCode TS agent-builder scaffolding; Cursor agents are static markdown.
- `src/agents/builtin-agents.ts` — TS registry wiring for built-in agents; not representable as static agent markdown.
- `src/agents/dynamic-agent-*.ts` — runtime prompt-builder surface not exposed by Cursor.
- `src/features/*` (19 packages: `background-agent`, `boulder-state`, `claude-code-*` ×4, `claude-tasks`, `context-injector`, `hook-message-injector`, `mcp-oauth`, `opencode-skill-loader`, `run-continuation-state`, `skill-mcp-manager`, `task-toast-manager`, `tmux-subagent`, `tool-metadata-store`) — require OpenCode plugin runtime with typed TS lifecycle; Cursor has no equivalent.

### OpenCode-only hook events

Hooks in this group are attached exclusively to OpenCode events not exposed by Cursor's 20-event `hooks.json` surface.

**`chat.message` mutation (no Cursor equivalent event):**
- `src/hooks/think-mode/hook.ts` — mutates user message parts via `chat.message` + `event`.
- `src/hooks/model-fallback/hook.ts` — applies pending model fallback by mutating `chat.message` only (no `preToolUse.updated_input` path in original).
- `src/hooks/keyword-detector/hook.ts` — rewrites message parts from keywords via `chat.message`.
- `src/hooks/no-sisyphus-gpt/hook.ts` — forces agent or model via `chat.message` mutation.
- `src/hooks/no-hephaestus-non-gpt/hook.ts` — Hephaestus model routing via `chat.message` mutation.
- `src/hooks/runtime-fallback/hook.ts` — heavy `message.updated` + session status orchestration plus `chat.message` mutation.

**`experimental.chat.messages.transform` (no Cursor equivalent event):**
- `src/hooks/tool-pair-validator/hook.ts` — validates tool pairs on transform only.

**`chat.params` (no Cursor equivalent event):**
- `src/hooks/anthropic-effort/hook.ts` — provider effort injection via `chat.params`.

**`tool.definition` (no Cursor equivalent event):**
- `src/hooks/todo-description-override/hook.ts` — mutates tool definitions for todo display.

**OpenCode SDK session / compaction APIs (no Cursor equivalent):**
- `src/hooks/anthropic-context-window-limit-recovery/recovery-hook.ts` — provider-specific token-limit recovery via OpenCode session APIs.
- `src/hooks/preemptive-compaction.ts` — drives preemptive compaction via SDK; `session.compacted` and `session.summarize` not in Cursor hooks.
- `src/hooks/compaction-context-injector/hook.ts` — relies on `session.compacted`, `message.part.delta`, idle tail tracking.
- `src/hooks/compaction-todo-preserver/hook.ts` — restores todos after compaction via OpenCode todo API.

**`command.execute.before` (no Cursor equivalent event):**
- `src/hooks/auto-slash-command/hook.ts` — slash and command executor injection.

**OpenCode-specific runtime integration:**
- `src/hooks/interactive-bash-session/hook.ts` — tmux and `interactive_bash` tool integration; OpenCode-specific runtime.

### GitHub Actions workflows

Seven workflows from `.github/workflows/`; none are portable to Cursor plugin distribution:

- `ci.yml` — CI (lint, test, build)
- `cla.yml` — CLA Assistant
- `lint-workflows.yml` — Lint Workflows
- `publish.yml` — npm publish
- `publish-platform.yml` — platform binary publish
- `refresh-model-capabilities.yml` — Refresh Model Capabilities
- `sisyphus-agent.yml` — Sisyphus Agent (autonomous coding action; conceptually adjacent to Cursor Cloud Agents but infrastructure differs — still Tier 5)

### npm distribution model

Artifacts tied to npm packaging lifecycle; no equivalent in Cursor plugin install model:

- `bin/oh-my-opencode.js` — npm CLI binary entry point.
- `bin/platform.js`, `bin/platform.d.ts`, `bin/platform.test.ts` — platform resolution for packaged binaries.
- `packages/darwin-*` (3 subdirectories: darwin-arm64, darwin-x64, darwin-x64-baseline) — npm platform-optional packages.
- `packages/linux-*` (6 subdirectories: linux-arm64, linux-arm64-musl, linux-x64, linux-x64-baseline, linux-x64-musl, linux-x64-musl-baseline) — npm platform-optional packages.
- `packages/windows-*` (2 subdirectories: windows-x64, windows-x64-baseline) — npm platform-optional packages.
- `postinstall.mjs` — npm postinstall hook; verifies platform binary availability; Cursor plugins have no equivalent lifecycle.

### Provider-specific / chat.params

- `src/hooks/anthropic-effort/hook.ts` — injects Anthropic `thinking.budget_tokens` and effort parameters via `chat.params`; not on Cursor's hook surface. (Also listed under OpenCode-only hook events above; listed here for provider-specificity cross-reference.)
- `src/hooks/anthropic-context-window-limit-recovery/recovery-hook.ts` — provider-specific context-window recovery using OpenCode session APIs and Anthropic error codes.

## Cursor-Native Additions Appendix

Items present in this repo but absent from the reference (`oh-my-openagent-original`). One-directional.

### Commands (7 additions)

- **plan** — Prometheus-style planning workflow: phased todos, Metis/Oracle, plan file output, handoff choice.
- **help** — Documents dispatcher-root behavior, agent inventory, and slash-command overview for oh-my-cursor.
- **agents** — Instructs listing plugin agent definitions with models, roles, and tier grouping.
- **config** — Read-only: show merged daemon config (curl `/config`) and config file merge order.
- **status** — Daemon `/status` and MCP sidecar `/health` for system health and session stats.
- **briareus** — Briareus mode: split work into parallel `sisyphus-junior` micro-tasks and merge results.
- **cloud-agents** — EXPERIMENTAL: CLI-style flows for Cursor Cloud Agents when enabled and API key set.

### Rules (6 additions)

- `coding-standards.mdc` — Core coding standards and naming conventions; `alwaysApply: true`. Hard constraints (no type suppression, no empty catches).
- `agent-tool-restrictions.mdc` — Per-agent tool restrictions; `alwaysApply: true`. Hook vs advisory vs prompt-enforced matrix; model routing table.
- `orchestrator.mdc` — oh-my-cursor orchestration; `alwaysApply: true`. Plan/Agent/Debug/Ask personas; config toggle (`native` vs `subagent`).
- `orchestrator-reference.mdc` — Detailed workflows, limits, patterns (on-demand reference); `alwaysApply: false`, globs `**/*`.
- `anti-patterns.mdc` — AI-specific anti-patterns to avoid; `alwaysApply: true`. AI slop and structural anti-patterns.
- `prometheus-plan-brief.mdc` — Prometheus planner brief; identity, clearance checklist, test-strategy elicitation; `alwaysApply: true`.

### MCP (1 addition)

- `oh-my-cursor` localhost sidecar MCP (`http://localhost:47848/mcp`, port from `daemon.mcp_port` in `config.default.jsonc`; provides daemon integration tools not present in the original repo).

### CI + Packaging (3 additions)

- `install.sh` — Bash installer (755 lines, ~20 KB); original repo has no equivalent.
- `install.ps1` — PowerShell installer (683 lines, ~20 KB); original repo has no equivalent.
- `automations/` — Placeholder directory for Cursor-specific automation workflows (`README.md`); original has no equivalent.

### Agents (1 addition)

- `agents/protocols/coordinator.md` — Coordinator protocol agent (no original `src/agents` counterpart); Cursor-native coordination-tier definition.

## Top-5 Port Candidates

_Placeholder for W3.1 Oracle to validate tier assignments and rank. Seeded with W1e top-ROI candidates plus `playwright-cli` skill from W1c; Oracle applies at-most-one-hook-response-dependent constraint and refines ordering._

**Seed candidates (ROI descending, from W1e top-ROI list + W1c):**

1. `rules-injector` — partially-portable-with-caveats, cycle-2-dep Y, ROI 5 — High leverage for plan or policy injection via `postToolUse.additional_context`.
2. `todo-continuation-enforcer` — portable-with-cycle-2, cycle-2-dep Y, ROI 5 — Directly improves long-run task completion via `subagentStop.followup_message`.
3. `prometheus-md-only` — portable-with-cycle-2, cycle-2-dep Y, ROI 5 — Clear deny policy for Prometheus markdown plans via `preToolUse.permission`.
4. `session-recovery` — portable-with-cycle-2, cycle-2-dep Y, ROI 4 — Recovers from assistant errors; approximate via `sessionStart.user_message` or `env`.
5. `write-existing-file-guard` — portable-with-cycle-2, cycle-2-dep Y, ROI 4 — Prevents destructive overwrites via `preToolUse.permission` deny.
6. `ralph-loop` — partially-portable-with-caveats, cycle-2-dep N, ROI 4 — Strong automation value; partial parity via Cursor `stop` and follow-ups.
7. `start-work` — partially-portable-with-caveats, cycle-2-dep N, ROI 4 — Core Sisyphus workflow; `beforeSubmitPrompt` approximates `chat.message` + `command.execute.before`.
8. `playwright-cli` skill — portable-without-cycle-2, cycle-2-dep N, ROI 2 — Missing config-switch skill; merges into `skills/playwright/SKILL.md` with `browserProvider` flag.

_Oracle at W3.1 will validate tier assignments, enforce at-most-one-hook-response-dependent constraint, and produce the final ranked top-5._

## Top-3 Selected Ports

_Placeholder for W3.2 user ratification. To be filled after Oracle top-5 selection._

| Port | Item | Tier | Cycle-2 required | Notes |
|---|---|---|---|---|
| Port 1 | TBD | TBD | TBD | — |
| Port 2 | TBD | TBD | TBD | — |
| Port 3 | TBD | TBD | TBD | — |

## Methodology Addendum

- **Wave 1 inventory** performed by 7 parallel sisyphus-junior agents with composer-2-fast model.
- **Tier derivation** is based on file-level presence + OpenCode event-attachment detection (not full content diff). Acceptance equivalence: intent-equivalence only (not behavioral).
- **Inventory scope for hooks:** `HookName` entries in `oh-my-openagent-original/src/config/schema/hooks.ts` (52 names); `src/hooks/` directories with no separate schema entry (e.g. `task-reminder/`, `hashline-edit-diff-enhancer/`) are not separate rows.

### Reconciliation decisions made during synthesis (W2.1)

1. **`rules-injector` dual-listing** — This hook spans two concerns: it is a rules surface artifact (proximity-discovery injection mechanism) and a hooks surface artifact (registers `tool.execute.before` + `tool.execute.after`). It appears in both S4 (Rules) and S5 (Hooks). In S4 the rationale cites the injection mechanism (`createRulesInjectorHook()`, `output.output`); in S5 the rationale cites the hook event attachment. The dual-listing is intentional and not a deduplication error.

2. **`rules-injector` cycle-2-dep unified to Y** — W1e fragment set cycle-2-dep = N for the S5 hooks row; W1d fragment set cycle-2-dep = Y for the S4 rules row. Y is adopted in both tables: rules-injector fundamentally requires `postToolUse.additional_context` behavior (a cycle-2 response field) to approximate proximity rule injection in Cursor.

3. **`model-fallback` reclassification** — Pre-planning analysis hinted this might be Tier 3 (portable-with-cycle-2) via a `preToolUse.updated_input` path. W1e agent analysis found that `src/hooks/model-fallback/hook.ts` attaches **only** to `chat.message`; there is no `preToolUse.updated_input` path in the original code. Since `chat.message` mutation is not in Cursor's 20-event surface, the correct classification is `unbridgeable-by-architecture`. W1e's analysis is adopted. ROI 4 is preserved as a marker of conceptual value for a potential redesigned implementation.

## Notes

- `startup-toast` is a configuration toggle consumed by `auto-update-checker`, not a standalone hook factory; it appears as one row in S5 under the same `src/hooks/auto-update-checker/` path.
- `playwright.ts` in the original exports both `playwrightSkill` and `agentBrowserSkill`; the latter maps to `skills/agent-browser/SKILL.md` in this repo (two S3 rows share the same original-path for this reason).
- MCP table (S6) normalized from W1f's 7-column format (Feature/Original/Current/Tier/ROI/Rationale/Notes) to the standard 7-column schema; cycle-2-dep = N for all MCP rows (no response-field dependency).
- CI+Packaging table (S7) normalized from W1g's column order (Artifact/Original/Current/Tier/ROI/cycle-2-dep/Rationale) to standard schema order; presence indicators (Yes/No) converted to paths and em-dashes.
- Total additions enumerated: 18 (7 commands + 6 rules + 1 MCP + 3 CI/packaging + 1 agent = 18); satisfies acceptance criterion #10 (≥7 rows).
- `agent-nativeness-audit.md` cross-reference cited in the header; that audit covers Cursor tool-use nativeness patterns, not the gap-vs-original comparison documented here.
