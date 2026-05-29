# oh-my-cursor — Agent Guidance

## Architecture (tl;dr)
- Hooks daemon: `hooks/daemon.ts` (port 27847). All hook events route here.
- Handler files: `hooks/handlers/` — event logic split by concern.
- Context injection: `hooks/context-collector.ts` — budget-aware, priority-ordered.
- Config: `hooks/schemas/config.ts` (Zod). Defaults in `config.default.jsonc`.
- Tests: `bun test` from repo root or `hooks/` subdir.

## Key conventions
- Never edit files without reading first.
- TDD: write tests before handlers.
- Budget: register context at the right priority (critical > high > normal > low).
- `OH_MY_CURSOR_DISABLED_HOOKS` env var disables specific hook paths.

## Test commands
- All hooks tests: `cd hooks && bun test`
- Single file: `bun test hooks/handlers/tool-guard-handlers.test.ts`
- Type check: `cd hooks && npx tsc --noEmit` (pre-existing errors in daemon/dashboard are non-blocking)

## Do NOT
- Do not run experiments against the live Cursor binary without following `docs/internal/hooks-experiments-runbook.md`.
- Do not add `permission: "deny"` to new ports without a confirmed W2 probe result.
- Do not break existing handlers when adding new ones.
