# Changelog

All notable changes to oh-my-cursor are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
