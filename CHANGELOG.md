# Changelog

All notable changes to oh-my-cursor are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-05-01

### Added

#### Dashboard React rebuild
- New `hooks/dashboard-ui/` SPA: Vite 8 + React 19 + Tailwind v4 + shadcn/ui (radix-nova preset, 18 components) + Zustand 5 with `persist` middleware. Replaces the 1643-line Preact-from-`esm.sh` monolith at `hooks/dashboard/render.ts`.
- Daemon static-asset serving: `GET /dashboard` and `GET /dashboard/index.html` return the dynamic shell HTML (`Cache-Control: no-store`, status 200 always); `GET /dashboard/assets/<file>` serves the built bundle with weak ETag, `Cache-Control: public, max-age=60, must-revalidate`, conditional `If-None-Match` 304 handling, path-traversal guard (400), and 503 fallback when dist is missing.
- `install.sh` `build_dashboard_ui` step runs `bun install --frozen-lockfile && bunx --bun vite build` BEFORE any destructive operation in fresh / force / update install paths. Fresh/force build failure aborts cleanly before touching `$PLUGIN_DIR`; update build failure preserves the existing `$PLUGIN_DIR/hooks/dashboard-ui/dist/` byte-for-byte. New `--skip-dashboard-build` flag for opt-out installs.
- `install.ps1` Windows parity: `Build-DashboardUI` function with the same ordering and failure semantics; new `-SkipDashboardBuild` switch.
- Async `getStatusHTML(port?: number): Promise<string>` constructs the MCP shell at request time with the daemon port injected via JS template literal: no `{PORT}` placeholders, no module-load cache, never reads disk in daemon mode. Supports a `singlefile` fallback gated on `OMC_DASHBOARD_MODE=singlefile` (Strategy A) for environments where Cursor's MCP webview CSP blocks dynamic imports. Strategy C (daemon-served + dynamic import) is the primary path.
- Vite asset filenames pinned (`assets/dashboard.js`, `assets/dashboard.css`, no content hash) so the MCP shell's literal references survive every rebuild.
- Three-OS toolchain spike scripts: `hooks/dashboard-ui/scripts/build-smoke.sh` (bash) + `build-smoke.ps1` (PowerShell). Linux validated locally; macOS + Windows VM runs documented for user execution. Results recorded in `hooks/dashboard-ui/SPIKE.md`.
- 7 dashboard tabs rebuilt:
  - **Status** with hand-rolled inline-SVG sparklines for explore/worker dispatch counts, `useSseStatus`-driven connected indicator, offline → connected health resync.
  - **Hooks** with shadcn `Card` two-column layout (`min-[500px]:grid-cols-2`), `Skeleton` loading, error retry, polished empty state.
  - **Background** with Active vs Recent visual split, persisted auto-prune toggle (60 s window), 30 s ticker for stale-entry rollover.
  - **Events** with focusable `<button aria-expanded>` rows, debounced text search, persisted filter, `aria-live="polite"` list, retry on fetch failure, inline-confirm Clear with 5 s sonner Undo toast (no native `confirm()`).
  - **Sessions** with focusable rows, debounced search, sort dropdown (start time / tool count / error count desc), shadcn Tooltip on technical fields.
  - **Agents** with hand-rolled SVG Gantt waterfall (no chart library), status-token bar fills, single 250 ms `setInterval` for live-extending running bars, List view toggle, "Showing N of M total" history-cap label.
  - **Config** with `<nav role="tablist">` sidebar (Up/Down/Home/End nav), shadcn `Sheet` diff before save, label-associated form fields, human-readable Zod errors via `formatZodPath`, `<details>` showing config file path on success.
- App shell with Radix tabs + supplemental ArrowLeft/Right/Home/End handlers (P0-1), live count badges (P1-5), `1`–`7` / `/` / `r` / `?` global keyboard shortcuts (P2-9), persisted active tab (P2-1), dense-mode toggle persisted (P2-8), SSE reconnect banner with 1 Hz countdown (P2-6), top-level error boundary with reload action.
- Theme system: VSCode webview tokens (`--vscode-*`) with OKLCH fallbacks; status semantic tokens (`--status-ok/warn/error/info/running`); zero raw hex anywhere in our application code; reduced-motion baseline.
- A11y final pass: 15 axe-core assertions across 8 specs (Shell + 7 tabs); `prefers-reduced-motion: reduce` global rule with targeted exceptions (spinners slowed to 2 s/turn, SSE pulse calmed to 3 s); valid heading order; visible `:focus-visible` on every interactive element.
- Pure SSE reducer at `hooks/dashboard-ui/src/lib/sse-reducer.ts` (TDD, deep-freeze purity test) handling `health`, `subagentStart`, `subagentStop`, `tool_call`, `error`, `conversation-snapshot`, `shutdown`, and unknown events (no-op). EventSource client with exponential-backoff + jitter reconnect at `hooks/dashboard-ui/src/lib/sse.ts`.
- `dashboardSseBindings()` adapter writes reducer output back into the Zustand store on every SSE event so `data.health`, `data.agents`, `data.backgroundTasks`, `data.dispatchCounts`, `data.recentErrors`, `data.sessions`, and `connection.sseStatus` stay synced.
- Typed daemon API client at `hooks/dashboard-ui/src/lib/api.ts`: 9 functions (`getHealth`, `getSessions`, `getSessionLog`, `clearSessionLog`, `getConfig`, `getFullConfig`, `saveConfig`, `getBackgroundTasks`, `getAgentHistory`) returning a discriminated `Result<T> = { ok: true, data } | { ok: false, error }`. Three error kinds: `http`, `network`, `parse`. Base URL resolved at request time from `window.OMC_DAEMON_PORT` with `27847` fallback.
- `omc-tab-refresh` custom event wired to the `r` keyboard shortcut; six tabs (Status/Hooks/Events/Sessions/Agents/Config) re-run their loaders on dispatch.
- Contributor docs: `hooks/dashboard-ui/README.md` (dev workflow, test workflow, build modes, shell HTML mechanics, project layout); `INSTALL.md` "Dashboard UI build" subsection; `README.md` dashboard surface paragraph; `ARCHITECTURE.md` Dashboard UI section with daemon route table + mermaid data-flow diagram; `docs/cursor/12-plugin-system.md` build-during-install section.
- 222 Bun tests (`hooks/`) + 155 Vitest tests (`hooks/dashboard-ui/`) covering the rebuild end to end.

#### Agent history surface
- `AgentHistoryStore` with redact, dedupe, cap, and project stamping; lifecycle entries for running / completed / failed / abandoned subagents.
- `GET /agentHistory` exposes the store with project filter, `since`, `limit`, and `allProjects` parameters.
- Dashboard pre-loads `/agentHistory` on mount and dedupes by `agent_id` so running entries always win over historical replays.
- Per-session `displayTitle` derived from the first user message with secret redaction (OpenAI `sk-*`, GitHub `ghp_*` / `ghs_*`, AWS `AKIA*`, JWTs, basic-auth URLs).

#### State partitioning and isolation
- `ConversationState` split into durable + ephemeral slices; new `partitioner`, `redactor`, and `daemonBootId` modules.
- `loadOne` enforces project + boot guards so stale ephemeral state never crosses sessions.

#### Plan-mode Write-path guard
- New plan-mode hook fails fast when an agent attempts to use Cursor's `CreatePlan` instead of `Write` to `.cursor/plans/<slug>.plan.md`. TDD coverage in `hooks/`.
- `/start-work` discovers missing plan files and surfaces a `CreatePlan` hint instead of silently exiting.
- Reference docs (`docs/cursor/08-plan-system.md` and the always-on rule + agent file) updated to enforce Write over CreatePlan; `CreatePlan` added to Forbidden lists and the Step 6 banner; plan-write todo content names the Write tool explicitly.

#### Quality / CI
- `no-stale-slugs` lint prevents regression of forbidden Cursor model slugs (legacy GPT-5.4 / Composer 1.x prefixes).
- New regression test in `subagent-handlers` covering the `notify` double-`logEvent` path.
- New unit tests for the daemon's `logEvent` agent-field fallback chain (closes the F1 audit gap).

### Changed

- **Daemon `GET /dashboard` contract**: now `await getStatusHTML(actualPort)` returning 200 + `text/html` + `Cache-Control: no-store` always. Old `STATUS_HTML` module-load cache and the eager export are removed.
- Continuation loop renamed from "Ralph loop" in dashboard UI; only renders when active (closes UX confusion when no continuation is running).
- `/backgroundTasks` returns all tasks when `conversationId` is empty; `agent_id` is propagated through SSE for downstream UIs.
- Subagent stop `extractMeta` now carries `description` so history entries include human-readable identifiers.
- `subagent_type` / `subagent_id` propagate end-to-end; pending rows in the dashboard collapse onto the real `agent_id` when it arrives.
- Model slug invariants tightened across rules, agents, and docs:
  - Drop legacy `5.3-codex` / `composer-2` / `-thinking-high` slugs.
  - Add `gpt-5.5-extra-high` and `claude-opus-4-7-thinking-xhigh` to the canonical list.
  - Align Oracle / Momus / Hephaestus to `gpt-5.5-extra-high`; Sisyphus / Prometheus to `claude-opus-4-7-thinking-xhigh`.
  - F4 drift fix: Prometheus plan template's F1 reviewer model goes from `gpt-5.4-medium` → `gpt-5.5-extra-high`.
  - Experiments: `claude-haiku-4-5` → `composer-2-fast` (Cursor no longer accepts haiku at `Task()`).
- Agent docs consolidated: per-agent guidance moved to GPT-5.5-extra-high; legacy GPT-5.4 / GPT-5.3-codex prefixes and stale source references removed.

### Fixed

- **MCP shell port injection**: shell HTML is constructed at request time with the daemon's runtime port concatenated via JS template literal; no placeholder substitution in built artifacts, no cross-port cache contamination.
- **SSE reducer output now reaches the Zustand store**: `dashboardSseBindings()` adapter wires `health` / `agents` / `backgroundTasks` / `dispatchCounts` / `recentErrors` / `sessions` / `sseStatus` into `data.*` and `connection.*` slices. Without it, `BackgroundTab` and live updates were silently empty.
- **`/` events search shortcut**: Shell now dispatches `omc-focus-events-search` (matches the EventsTab listener); a round-trip Vitest spec mounts both components together to prevent regression.
- **`r` tab-refresh shortcut**: `Shell.tsx` dispatches `omc-tab-refresh`; six tabs subscribe and re-run their loaders.
- **Daemon socket bind**: bind-retry with backoff (no `reusePort` reliance); `flushEventLog` exported and called before `persistence.forceFlush` in the crash path.
- **Audit close-outs**:
  - F2 (Server type): `Server` typed via `ReturnType<typeof serve>`; explicit error logging in `flushOnCrash` catches.
  - T1.3 / T1.4 / T1.5 plan deviations from F1 audit closed.
  - 5 P2 nits from F2 audit resolved.
- **Continuation safety**: `ensure-daemon.sh` capped at 3 s; `/stop` continuation loop has a wallclock cap; `config.safety` schema adds `continuation_wallclock_cap` and an `mcp_review_flag`.
- **Background tab subagent payload shape** captured pre-fix in diagnose log; failure classification, stop-row description, and oldest-by-type fallback all corrected.
- **Subagent double-log**: removed redundant in-handler `logEvent` for background stops; failing regression test landed first.
- **Install / cross-platform**:
  - `install.sh` no longer leaks `sessionStart` hook JSON into stdout.
  - `install.sh` uses portable bash expansion instead of GNU-only `sed -z`.
  - Experiment responder scripts made macOS-compatible.
- **Workspace state**: `.cursor/` directory untracked from the repo so per-conversation state files don't leak into commits.
- **Hooks build typings**: Bun test typings added so `hooks/` typechecks under modern toolchains.
- **MCP integration tests** migrated to the new shell contract: `hooks/integration.test.ts` and `hooks/mcp-sidecar.test.ts` assert `<div id="app">`, the runtime-port asset URL, and the 200/503 split between the shell and asset routes (`hooks/mcp-app.test.ts` was migrated alongside the source change). Zero `STATUS_HTML` references remain in `hooks/`.

### Removed

- `hooks/dashboard/render.ts` (1643-line Preact-from-`esm.sh` monolith).
- `hooks/dashboard/sse-payload-from-event.{ts,test.ts}` and `hooks/dashboard/merge-by-agent-id.{ts,test.ts}`; logic ported into `hooks/dashboard-ui/src/lib/sse-reducer.ts` with TDD coverage.
- `hooks/dashboard/` directory (all members listed above; 1894 lines net deletion).
- Legacy `STATUS_HTML` export from `hooks/mcp-app.ts`.

### Docs

- New `hooks/dashboard-ui/README.md` contributor guide.
- `INSTALL.md` adds a "Dashboard UI build" subsection covering prerequisites, build command, daemon serving, and the `--skip-dashboard-build` / `-SkipDashboardBuild` flags.
- `README.md` dashboard paragraph updated to describe the React + shadcn surface and access points (`ui://oh-my-cursor/dashboard`, `GET /dashboard`).
- `ARCHITECTURE.md` adds a "Dashboard UI" section with the project layout, the daemon static-asset route table, and a mermaid sequence diagram of the data flow (MCP shell → daemon assets → REST + SSE → Zustand).
- `docs/cursor/12-plugin-system.md` describes the build-during-install step and the dashboard-ui directory.
- Plan compliance + quality artifacts: `.cursor/plans/dashboard-react-rebuild.compliance.md` (F1 oracle audit), `.cursor/plans/dashboard-react-rebuild.f2-review.md` (F2 quality review), `.cursor/plans/dashboard-react-rebuild.f4-report.md` (F4 scope fidelity check). Audit Item Tracking table in the plan filled out: 29/29 DONE.

### Known user-attended items

The following items in the dashboard-react-rebuild plan require physical access and remain pending:

- **W0.2**: `bash hooks/dashboard-ui/scripts/build-smoke.sh` on a real macOS host and `pwsh hooks/dashboard-ui/scripts/build-smoke.ps1` on a Windows VM (NOT WSL); paste output into `hooks/dashboard-ui/SPIKE.md`.
- **W0.3**: open `ui://oh-my-cursor/dashboard-spike` in Cursor's MCP panel (after temporarily reintroducing the spike scaffolding documented in `SPIKE.md`) and report `CSP_OK` / `CSP_FAIL`. Default config assumes `CSP_OK` (Strategy C); if `CSP_FAIL`, set `OMC_DASHBOARD_MODE=singlefile` to switch to Strategy A.
- **F3**: 11 manual QA scenarios in a real Cursor instance with the plugin installed; pass/fail goes into `.cursor/plans/dashboard-react-rebuild.qa-log.md`.

## [0.5.0] - 2026-04-17

### Added
- Crash-loop supervisor for the MCP sidecar with supervisor log persistence across restarts.
- `killPortSquatter` in process-guard (same-user check before SIGTERM).
- Hooks-v2: canonical `docs/cursor/03-hooks.md`, empirical report v2, claim-by-claim v1-vs-v2 diff, refreshed evidence; Wave I ghost-hunt and in-session wave evidence; offline harness (logger v2, responders, mega-config generator, experiment watchdog, version-pin recorder).
- Plan-mode workflow: Oracle planning step, automatic Momus REJECT loop, inline test-strategy in `/plan`, user checkpoints, 4-iteration Momus cap; canonical `prometheus-plan-brief.mdc`.
- `beforeTabEvent` / `afterTabEvent` coverage and plan-complete override in the Task guard.
- MCP: `@modelcontextprotocol/sdk`, stateful sessions, capability declarations, always-on strict response validation, per-file tools and dashboard resource with Zod schemas.
- Hooks: `classifyAction` / `extractMeta`, `ConversationSummary` `blockCount`/`blocks`, tests for classify/extractMeta.
- Tier-2 portable agent prompts: Sisyphus, Hephaestus, Prometheus (ported from oh-my-openagent-original).

### Changed
- Canonical daemon and MCP sidecar ports moved to **27847** / **27848** (below Linux ephemeral range) with hard-claim semantics (no silent fallback drift); supervisor unsets stale `OH_MY_CURSOR_PORT` / `MCP_PORT`.
- MCP: hand-rolled JSON-RPC replaced by official SDK transport; `skill_mcp` aligned with `registerTool`; runtime/daemon-health/tool scaffolding extracted.
- Model routing, rules, and agents aligned to valid Cursor Task slugs (opus-4.7 family, composer-2-fast); residual fast-slug references removed.
- Non-canonical `/sessionHistory` and `/backgroundTasks` removed; Tab events replace them.
- Per-conversation state files with dirty tracking and async writes; production code uses Bun-native `fs`, `os`, and `crypto`; daemon wired to new persistence with uncaught-exception handling.

### Fixed
- Ralph DONE detection requires exact `<promise>DONE</promise>`.
- MCP: HTTP 404 for unknown `mcp-session-id` with echoed JSON-RPC `id` in body; SSE `idleTimeout` disabled on `Bun.serve`; port hard-claim and unknown-session regressions in tests.
- `createdViaFallback` / `fallbackUuid` exposed via `/health` when fallback UUID is used.
- Pre-compact observability: action logging, token reset, size tracking.
- `pendingWriteArgs` leak plugged; unbounded collections capped; event buffer lazy-loaded.
- Plan workflow: `detectPlanMode` / drift-guard fence-aware extraction; `/start-work` DRY helper; install waits for daemon/sidecar exit before restart; daemon handles empty/malformed POST bodies and caps SSE reconnect retries; dashboard HTML port matches bound port.
- `post-OKAY` Momus re-review prompt made mandatory.

### Docs
- v1 empirical artifacts preserved under `docs/internal` as baseline; v1 report marked SUPERSEDED; README hook count corrected to 20.
- Gap-vs-original 5-tier matrix across seven surfaces with Oracle tier reassignments; post-port narrative cleanup.
- Experiments methodology, response-field catalog, overloop design; W–X experiment cells and execution runbook; cycle-2 row annotations and `03-hooks.md` status section.
- Privacy: scrub local machine paths and session IDs from repo-facing content.
