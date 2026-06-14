# Changelog

All notable changes to oh-my-cursor are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.0] - 2026-06-14

### Fixed

#### Sub-agent description / persona capture (Task() delegates)

- `hooks/handlers/extract-agent-fields.ts`: new pure `extractDescriptionFromLogInputs(parsed, toolInput)` helper. Resolves a sub-agent's human description with precedence `parsed.task` → `tool_input.description` → `parsed.description` → `""`. Cursor delivers `/subagentStart` descriptions in `task` / `tool_input.description`, **not** in a top-level `description` field — so the previous read of `input.description` left every `agent-history.jsonl` entry (and the dashboard, persona display, and wisdom learning) blank.
- `hooks/handlers/subagent-handlers.ts`: `/subagentStart` and both `/subagentStop` description sites now resolve via the shared helper. `/subagentStop` prefers the description captured at start (tracker / running entry) and falls back to the stop payload, so a stop with no tracker match still records a real description. Emits a once-per-`agentId` `console.warn` when the resolved description is empty (no more silent blanks).
- `hooks/shared.ts`: `extractMeta` `/subagentStart` branch now delegates to the same helper, so the event log and the handler can never drift apart (single source of truth).

#### Eliminate false "sub-agent returned empty output" retries

- `hooks/handlers/empty-task-detector.ts`: gate the empty-output finding on output *presence*. Cursor does not deliver sub-agent output to `/subagentStop` (the payload is only `{subagentStatus}`), so the detector previously saw `output` as absent → length 0 → falsely flagged every completed sub-agent as "returned empty/minimal output (0 chars)" and injected a bogus retry advisory. Now an absent (`undefined`) output is treated as **unknown** (no finding), while a *delivered* empty string `""` is still flagged as genuinely empty. Reactivates automatically if a future Cursor version starts sending output.
- `hooks/handlers/subagent-handlers.ts`: pass the raw `input.output` (`undefined` when not delivered) to the detector instead of the coerced `""`, so it can distinguish "unknown" from "empty". The coerced string is still used for the error/wisdom heuristics.

### Tests

- `hooks/handlers/extract-agent-fields.test.ts`: precedence, per-source resolution, and empty-fallback coverage for the new description helper.
- `hooks/handlers/subagent-history.test.ts`: description captured from `task` and `tool_input.description` (not only top-level `description`), empty-description warn-once, and stop-without-tracker description capture. Hardened one order-fragile warn assertion to scan all calls.
- `hooks/handlers/empty-task-detector.test.ts`: undefined output + completed status no longer registers a finding (no false alarm); a delivered empty string still does. Replaces the prior test that asserted the buggy behavior.

## [0.10.0] - 2026-06-13

### Added

#### Version-keyed reported model-enum capture tier

- `hooks/lib/reported-models-store.ts`: pure, never-throwing version-keyed JSON store for captured model enums. Persists to `~/.config/oh-my-cursor/reported-models.json` (override: `OH_MY_CURSOR_REPORTED_MODELS_FILE`). Validates slugs by shape only (non-empty, ≤60 chars, `SLUG_FULL_RE`, dedup, min 3). Evicts oldest entry when > 10 versions stored.
- `hooks/lib/task-schema-introspector.ts`: `reported` tier added to `computeBase` (highest priority, above bundle scan). `invalidateBaseCache()` exported for targeted post-capture cache invalidation (does NOT wipe passive observations). `resolveCursorVersion()` exported for sync version resolution. `needsCapture: boolean` added to `EnumResult` and `IntrospectionSnapshot` (true when source ≠ `"reported"`).
- `hooks/lib/introspection-runtime.ts`: `refresh(): Promise<void>` added to `IntrospectionRuntime` interface; re-runs the scan without clearing passive observations. `needsCapture` plumbed through `BaseSnapshot` → `getSnapshot()`.
- `hooks/daemon.ts`: token-gated `POST /reported-models` endpoint. Validates body `{ version, models }`, captures to store, invalidates cache, calls `runtime.refresh()`, emits `introspection-updated` SSE event.
- `commands/sync-models.md`: `/sync-models` command — triggers the agent to capture the live Cursor Task model enum for the current version.
- `scripts/config-generator.ts`: `resolveEnumForGenerator()` sources the model-enum table from the reported capture for the current Cursor version, falling back to `KNOWN_CURSOR_MODELS`. `syncRules()` uses this so `--sync-rules` reflects the live enum.
- `hooks/handlers/model-routing-mutation.ts`: non-blocking `needsCapture` advisory (id `"model-enum-needs-capture"`, priority `"normal"`) registered at dispatch time when `snapshot.needsCapture` is true. Flag-gated enforcement remap: when `model_routing.enforce_allowlist` is `true`, curated agents with an out-of-allowlist model are remapped to the curated default (first slug of `resolveAllowedModels`); never a hard deny; permissive agents unaffected.
- `hooks/schemas/config.ts`: `model_routing.enforce_allowlist: boolean` flag (default `false`).
- `hooks/dashboard-ui/src/tabs/models-routing/EnforceAllowlistToggle.tsx`: dashboard toggle for `enforce_allowlist` in the Models & Routing tab (hotkey 8). Persists via `POST /config`.
- `docs/internal/model-enum-capture.md`: design doc covering the 4-tier resolution precedence, capture workflow, stale-window limitation, and enforcement flag.

#### Stale `composer-2` purge

- Removed bare `"composer-2"` from `KNOWN_CURSOR_MODELS`, `AGENT_MODEL_ALLOWLIST`, `config.default.jsonc`, `README.md`, `docs/internal/agent-model-allowlist.md`, and all test fixtures. Replaced with the distinct `"composer-2.5"`. `hooks/no-stale-slugs.test.ts` is now 4/4 green.
- `hooks/lib/known-models.ts`: refreshed `KNOWN_CURSOR_MODELS` with current-generation slugs; marked as STALE FALLBACK FLOOR only.

### Notes

- Resolution precedence: `reported[cursorVersion]` → bundle scan → passive observation → `KNOWN_CURSOR_MODELS`.
- Stale window: after a Cursor update, the reported capture is keyed to the old version; the new version falls back until `/sync-models` is run again.
- `enforce_allowlist` defaults to `false`; the dispatch gate never hard-denies.
- `hooks/package.json` is the single source of truth for the version; `install.sh` and `install.ps1` both read it via `get_source_version()`.

## [0.9.1] - 2026-06-13

### Added

#### Per-subagent_type model override validation

- `hooks/lib/agent-model-allowlist.ts`: curated per-`subagent_type` allowlist (`AGENT_MODEL_ALLOWLIST`) + `resolveAllowedModels` + `isModelAllowedForAgent` predicate. Hand-authored from `KNOWN_CURSOR_MODELS`; frozen export; pure/side-effect-free module.
- `IntrospectionSnapshot.modelsByAgent`: additive optional `Record<string, string[]>` field computed once per Cursor version in `introspection-runtime.ts` and cached on the snapshot.
- Dispatch-time per-agent validation in `model-routing-mutation.ts`: synchronous `validateAgainstAllowlist()` gate (no `await` in `mutate()`); invalid primary → falls back to `categories[agent].model` → inherit; CRITICAL advisory on fallback; permissive agents (unknown/empty curated set) apply as-is.
- `fallback_models` per-agent validation in `delegate-task-retry-rotation.ts`: invalid entries skipped with advisory; rotation index advances past disallowed slots; permissive agents unaffected.
- Write-time per-agent advisory validation in `agent-overrides-write.ts`: `isModelAllowedForAgent` replaces flat enum check; invalid slugs → `warnings[]`; never 4xx; `"inherit"` always exempt.
- `GET /introspection` now includes `modelsByAgent` in the response (additive, backward-compatible).
- `introspection-updated` SSE event: emitted on `cursorVersion` change (not on every read); payload `{ cursorVersion, cachedAt }`; dashboard subscribes and re-fetches.

#### Dashboard — Models & Routing tab

- `RoutingEditor`: per-agent model dropdown constrained to `modelsByAgent[agent]` ∪ `"inherit"` ∪ current stored value; permissive agents show full list. Valid-count indicator per agent.
- `InvalidOverrideBanner`: reads live config + `modelsByAgent`; lists agents with invalid stored overrides; one-click "Reset to default" per agent; mounts above the editor.
- `api.ts`: `Introspection.modelsByAgent` typed; `introspection-updated` SSE subscription triggers re-fetch.

### Notes

- Spike verdict B: Cursor bundle encodes `model` as a flat string field (not a per-`subagent_type` enum); curated map in `agent-model-allowlist.ts` is the authoritative source. See `docs/internal/per-subagent-model-enum-spike.md`.
- `hooks/package.json` is the single source of truth for the version; `install.sh` and `install.ps1` both read it via `get_source_version()`.

## [0.9.0] - 2026-06-13

### Added

#### Dynamic model routing

**Runtime model introspection**
- `hooks/lib/task-schema-introspector.ts`: hybrid chain (bundle scan → passive observation → hardcoded fallback), cached per `cursor_version`, per-OS path resolution (Linux/macOS/Windows), 2000ms timeout, never throws. Real scan: 82 models from Cursor 3.7.27 in 472ms.
- `GET /introspection` endpoint: returns `{ models, agents, source, cursorVersion, cachedAt, observedAdditions }`.
- `introspection` config block added for tuning scan behavior.

**Config schema**
- `agent_overrides` + `categories` config schema: per-agent `model`, `fallback_models[]`, `disable` fields; backward-compatible migration from legacy `model_routing.defaults` with deprecation warning.
- `max_piggyback_chars` (default 8000) added to config.

**Central Task input composer**
- `hooks/handlers/task-input-composer.ts`: provider registry, echo-all strategy (spreads full original `tool_input` first), single emitter of `updated_input` for the Task tool.
- Model routing enforcement mutation: resolves `agent_overrides[agent].model` → `categories[agent].model` → no-op; advisory async slug validation against introspected enum.
- `POST /config/agent-overrides` endpoint: atomic validated write (tmp+rename), in-memory hot-reload, SSE `config-changed` event.

**Fallback rotation**
- `hooks/handlers/delegate-task-retry-rotation.ts`: per-`(conversation_id, agent_type)` rotation index over `fallback_models[]` on retryable failures (429/5xx); resets on success; exhaustion advisory; priority 200 (beats static routing at 100).

**Dynamic agent set**
- `PLAN_MODE_ALLOWED_AGENTS`: derived from `agents/*.md` frontmatter (`plan_safe: true`) at startup; hardcoded set as fallback.
- `config-generator --sync-rules` mode: regenerates routing table in `rules/orchestrator.mdc` between `<!-- omc:routing-table:start/end -->` markers; updates `rules/agent-tool-restrictions.mdc` model-enum table; idempotent.

#### Context delivery reroute (Cursor 3.7 compatibility)

- `postToolUse.additional_context` confirmed BROKEN at Cursor 3.7.x; `sessionStart.additional_context` BROKEN; `beforeSubmitPrompt.updated_input/additional_context` NOT-SUPPORTED-BY-DESIGN. All 18 handlers migrated off the dead channel.
- Context piggyback delivery (`hooks/handlers/context-piggyback-mutation.ts`): `contextCollector.consumeUpTo(maxChars)` delivers registered context as `<omc:context>...</omc:context>` prefix on the next Task `preToolUse` prompt. Budget: `min(max_piggyback_chars, floor(15308 x 0.8))`.
- `non-interactive-env` upgraded from advisory to real `updated_input` command rewriting.
- `webfetch-redirect-guard` upgraded from advisory to real `updated_input` URL resolution.

#### New guard and validator handlers (upstream port)

- `stop-continuation-guard`: per-conversation user-stopped latch suppresses loop followups after explicit stop; cleared on new user prompt.
- `plan-format-validator`: validates `.omo/plans/*.md` writes against plan contract (required sections, bare-number TODO labels, F-prefixed Final Wave labels); `permission: "deny"` on violation.
- `notepad-write-guard`: blocks full-file Write overwrites of existing notepads; allows Edit appends.
- `tool-pair-validator`: tracks per-conversation read-set (LRU 500); denies Edit on unread files.
- `question-label-truncator`: caps Task `description` at 120 chars via composer provider (priority 10); truncates MCP label-array params on `beforeMCPExecution`.
- `fsync-skip-warning`: detects partial-write signatures in `postToolUse` output; registers advisory.
- `keyword-detector`: detects `ultrawork`/`ralph-loop`/`boulder` etc. in `beforeSubmitPrompt`; sets per-conversation mode flag; arms existing loop machinery; delivers mode preamble via piggyback.

#### Dashboard

**Models & Routing tab (hotkey 8)**
- `EnumViewer` shows model slugs with source badges (bundle/observed/fallback).
- `RoutingEditor` edits per-agent model/fallback chain/disable and saves via `POST /config/agent-overrides`; refreshes on SSE `config-changed`.

**Hook Channel Status matrix (embedded in Hooks tab)**
- Read-only matrix of hook event x output field statuses; color-coded chips (green=works, red=broken, amber=unconfirmed, gray=unsupported); tooltips with evidence refs; `cursorVersion` header from `/introspection`.

### Changed

- All 18 handlers that previously returned `additional_context` now register via `contextCollector` and deliver through Task `preToolUse` prompt piggyback.
- `scripts/config-generator.ts`: `VALID_CURSOR_SLUGS` replaced with import of `KNOWN_CURSOR_MODELS` from `hooks/lib/known-models.ts`; `DEFAULT_AGENTS` now scanned dynamically from `agents/*.md`.
- Daemon handler map for `/preToolUse` and `/postToolUse` now chains competing handlers (first non-empty response wins) instead of last-wins object spread.
- `stop.followup_message` scoped to active continuation loops only (ralph/ULW/boulder); non-loop stops return `{}`.
- `PLAN_MODE_ALLOWED_AGENTS` derived from agent frontmatter at startup instead of hardcoded.

### Fixed

- `postToolUse.additional_context` delivery silently dropped by Cursor 3.7.x routing — replaced with Task `preToolUse` prompt piggyback.
- Daemon handler clobber: last-wins object spread silently killed tool-guard, plan-format-validator, fallback rotation, and ~17 other handlers when multiple handlers registered the same hook key — fixed with `chainHandlers()`.
- `notepad-write-guard` config getter used `getHookConfig()` (returns `{enabled,disabled}`, no `.handlers`) instead of `loadConfig()` — guard never fired in production.

## [0.8.0] - 2026-06-11

### Added

#### Audit remediation — context delivery, daemon lifecycle, state isolation, security hardening, installer fixes

**Context delivery (Task 8)**
- Single-channel context delivery: `/beforeSubmitPrompt` now returns context exclusively via `additional_context` field (removed duplicate `user_message` channel that was mutating the user's literal prompt).
- `contextCollector.consume()` wired at the top of `/beforeSubmitPrompt` to catch context registered on observe-only events (`/subagentStop`) or non-deny `/preToolUse` paths before the turn ends.
- Rehydration cleanup: `getOrCreateConversation` now calls `contextCollector.clear(conversationId)` when loading persisted state, ensuring rehydrated conversations start with a clean advisory slate.

**Daemon lifecycle (Task 6)**
- Daemon singleton lock per project: `startup-lock.ts` enforces one daemon per `projectRoot` via atomic file lock, preventing port conflicts and stale process accumulation.
- Graceful shutdown: `/shutdown` endpoint, `process.on("beforeExit")` backstop, and `flushNow()` awaitable path ensure all pending events are persisted before daemon exit.

**Zombie state cleanup (Task 9)**
- Atomic continuation state reset: `activePlan` and `boulderState` cleared atomically with a `continuationStoppedAt` tombstone on `/stop` when continuation is halted.
- `clearContinuationDurably()` + `forceFlush()` ensure state changes are persisted immediately, preventing stale state from leaking into the next session.

**State isolation and persistence (Tasks 10, 11, 12, 13)**
- Atomic state persistence: all writes use `atomic-file.ts` (write-to-temp, rename-on-success) to prevent corruption on crash.
- Project-scoped state keys: conversation state files now use hashed project root in filename (`{projectRoot_hash}.{conversationId}.json`), preventing cross-project state leakage.
- Automatic state-file migration: legacy flat-named files are migrated to project-scoped names on first load (grace path: empty `projectRoot` loads legacy files and writes back under new hashed name).
- Cross-conversation isolation guards: `loadOne` enforces `projectRoot` and `daemonBootId` matching, refusing to rehydrate state from a different project or boot cycle.

**Hook response contract alignment (Task 14)**
- Cursor response fields standardized: `/beforeShellExecution` and `/beforeReadFile` deny responses now carry `decision: "deny"` + `user_message` + `agent_message` (where applicable) per Cursor's contract.
- `workspaceOpen` routed and returns empty object (no 404).
- Fail-open vs fail-closed semantics: observe routes (e.g., `/postToolUse`) fail open with 200 `{}` on handler error; guard routes (e.g., `/preToolUse`) keep explicit 500 errors.

**Security hardening (Task 15)**
- Localhost-only token auth: diagnostic routes (`/session-log`, `/agentHistory`, `/config`, `/getBackgroundTasks`) require Bearer token or `?token=` query param; token stored at `~/.config/oh-my-cursor/daemon.token` (0600 perms).
- CORS removed: no `Access-Control-Allow-Origin` header on any response (strict same-origin policy).
- Blocked command logging: dangerous shell commands logged to session event stream with `action: "blocked"` for audit trail.
- File permissions: state files written with 0600 (owner read/write only).

**Installer fixes (Task 16)**
- Test file exclusion: `install.sh` and `install.ps1` now exclude `*.test.ts` files from the plugin bundle (prevents test dependencies from shipping).
- Windows config seeding: `install.ps1` creates `~/.config/oh-my-cursor/config.jsonc` with defaults on fresh install (parity with bash).
- Port templating: `hooks.json` port references use `{PORT}` placeholder, substituted at daemon startup (supports custom ports via `OH_MY_CURSOR_PORT` env var).
- Fatal fresh-install failure: if `bun install` or `vite build` fails on fresh/force install, abort cleanly before touching `$PLUGIN_DIR` (update installs preserve existing bundle on build failure).

**Documentation corrections (Task 17)**
- Hook event counts reconciled: 21 canonical / 19 wired (was 20).
- Broken references fixed: `docs/cursor/12-plugin-system.md` updated with correct hook counts and worktree docs aligned.
- Token file location documented: `~/.config/oh-my-cursor/daemon.token` (new in Task 15).
- State-file migration documented as automatic (grace path, no user action required).

### Changed
- `ConversationState` now includes `continuationStoppedAt` field (Task 9) for atomic continuation cleanup.
- State persistence uses project-scoped filenames with automatic legacy migration (Tasks 10-13).
- `/beforeSubmitPrompt` returns context exclusively via `additional_context` (Task 8).
- Daemon enforces per-project singleton lock on startup (Task 6).
- Hook response fields aligned to Cursor contract (Task 14).
- Diagnostic routes require token auth (Task 15).

### Fixed
- Context duplication: single-channel delivery eliminates duplicate advisories in user's prompt (Task 8).
- Zombie state: `activePlan` and `boulderState` now cleared atomically on continuation stop (Task 9).
- Cross-project state leakage: project-scoped state keys prevent conversation state from bleeding across projects (Tasks 10-13).
- Daemon port conflicts: startup lock ensures one daemon per project (Task 6).
- Installer test pollution: test files excluded from plugin bundle (Task 16).

## [0.7.0] - 2026-05-29

### Added

#### Cursor 3.6.21 uplift — observability, injectors, guards, native features

**Wave 0 — Observability foundation**
- `ContextCollector` redesigned with per-entry char cap (`max_entry_chars: 8000`), per-priority budgets (`critical/high/normal/low: 20000/15000/10000/5000`), and an explicit suppression footer (`[oh-my-cursor: N advisories suppressed (budget exceeded)]`) replacing silent tail-truncation.
- `todo_tracking_via_pretool` feature flag added to config (default `false`); TodoWrite state tracking relocated to `preToolUse` handler, gated by the flag. W2 empirical probe confirmed TodoWrite does NOT fire any hook event at 3.6.21 — flag stays off, limitation documented.
- `permissions.json` research spike: file is persistence-only (Cursor-written, not plugin-writable for enforcement). Adoption matrix updated to `Not-Adoptable (persistence-only)`.
- Doc counts reconciled: 7 rules (was 6), 21 canonical / 19 wired hook events (was 20). Experiments harness re-pinned to Cursor 3.6.21 (sha256 `205317ade…`); ghost-hunt regenerated with 21-event canonical set including `workspaceOpen`.

**Wave 1 — User-visible value**
- Six `postToolUse.additional_context` injectors ported from oh-my-openagent-original, each with TDD and `OH_MY_CURSOR_DISABLED_HOOKS` toggle:
  - `rules-injector`: proximity-discovers `.cursor/rules/*.mdc`, distance-matches glob patterns, deduplicates per session.
  - `directory-readme-injector`: walks up to projectRoot injecting `README.md` once per directory per session.
  - `agent-usage-reminder`: reminds orchestrators to delegate after 3+ searches without `Task` (max 3/session).
  - `bash-file-read-guard`: warns on simple `cat`/`head`/`tail` reads — prefer the `Read` tool.
  - `hashline-read-enhancer`: advisory-only hash-anchor enhancement, gated on `hashline_edit` config (default `false`).
  - `category-skill-reminder`: extended `buildSkillReminderContextLines()` with skill list after 3+ calls without `Task` in agent mode.
- P0 guard hardening: all three `preToolUse` deny paths (plan-mode Write, Ask-mode Task, plan-mode disallowed agent) now return `additional_context` advisory alongside `permission: "deny"` — guards work even if deny is a no-op at 3.6.21.
- `beforeSubmitPrompt` mode-gating: clears stale `in_progress` PLAN_PHASE_IDS todos on plan → agent mode transition.
- `workspaceOpen` wired as observe-only in `hooks.json` (19 of 21 canonical events now wired).
- Root `AGENTS.md` added (1178 chars) — injected into agent context by the AGENTS.md walk-up injector.
- `docs/cursor/15-settings-and-flags.md` updated: Explore subagent model setting and `--add-mcp <json>` CLI flag documented.
- Orchestrator rules updated: `/multitask`, Build-in-Parallel, `Await`/`AwaitShell` semantics; new `commands/worktree.md` and `commands/best-of-n.md` wrappers; coordinator protocol promotes `Await` as first-class.

**Wave 2 — Empirical verification**
- Self-fired deterministic events (Read/Shell/Grep) via workspace observe-only logger; JSONL evidence in `docs/internal/hooks-evidence-v3.jsonl`.
- Key findings at 3.6.21: `postToolUse.additional_context` TAKES-EFFECT (re-confirmed); `preToolUse.permission:deny` UNCONFIRMED; `preToolUse.updated_input` UNCONFIRMED; TodoWrite NOT-FIRED for any hook event.
- `hook-response-fields.md` updated with `NOT-FIRED` legend and TodoWrite row; adoption matrix and sharp-edges doc updated.
- A2 best-effort probes runbook added (`§A2`) with 15-minute timebox and UNCONFIRMED-at-3.6.21 as a passing outcome.

**Wave 3 — Gated ports**
- Six additional handlers ported with gated deny/rewrite + advisory fallback (all advisory-only paths since deny/updated_input UNCONFIRMED):
  - `write-existing-file-guard`: warns + denies Write to existing unread files.
  - `prometheus-md-only`: restricts Prometheus agent writes to `.md`/`.mdc` or `.cursor/plans/`.
  - `tasks-todowrite-disabler`: advisory flag (`tasks_todowrite_disabler_enabled`, default `false`) — advisory-only since TodoWrite NOT-FIRED.
  - `non-interactive-env`: warns on interactive shell commands; advises env vars for git (updated_input unconfirmed).
  - `webfetch-redirect-guard`: warns on short-link domains pre-fetch; warns on redirect errors post-fetch.
  - `sisyphus-junior-notepad`: registers notepad-path advisory when Atlas dispatches sisyphus-junior with an active plan.

### Changed
- `contextCollector.consume()` now enforces budget and returns suppression footer; `clipAdditionalContext()` in tool-guard-handlers removed.
- `ContextCollectorSchema` extended: `max_entry_chars`, `priority_budgets`, `todo_tracking_via_pretool`, `hashline_edit`, `tasks_todowrite_disabler_enabled`.
- Adoption matrix: 21 canonical / 19 wired; 7 rules; workspaceOpen Using; --add-mcp Using; permissions.json Not-Adoptable; /worktree+/best-of-n Using; Await Using.

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
- **Dashboard REST from MCP webviews**: daemon REST endpoints now include CORS headers and `OPTIONS` preflight support, matching the existing SSE CORS behavior. Dashboard API calls also time out after 5 s and surface the existing error + Retry UI instead of staying in loading forever.
- **Dashboard initial counts**: the shell preloads shared `health`, `sessions`, `events`, `backgroundTasks`, and `agentHistory` data on mount so tab badges and the conversation selector no longer stay empty until each tab is visited.
- **Agents Gantt scale**: the Gantt view now uses a 60 s minimum visible range and HTML tick labels so tiny time windows do not stretch across the whole chart and SVG text does not distort.
- **`/` events search shortcut**: Shell now dispatches `omc-focus-events-search` (matches the EventsTab listener); a round-trip Vitest spec mounts both components together to prevent regression.
- **`r` tab-refresh shortcut**: `Shell.tsx` dispatches `omc-tab-refresh`; six tabs subscribe and re-run their loaders.
- **Daemon socket bind**: bind-retry with backoff (no `reusePort` reliance); `flushEventLog` exported and called before `persistence.forceFlush` in the crash path.
- **Daemon liveness guard**: `ensure-daemon.sh` and `start-daemon.sh` no longer trust a fresh heartbeat file unless the daemon PID is also alive, so a stale heartbeat after `/shutdown` cannot prevent restart.
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
