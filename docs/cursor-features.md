# Cursor Integration — Native Features Used by oh-my-cursor

> **Moved**: This document has been superseded by the comprehensive [Cursor 3.x Native Features Reference](cursor/README.md).
>
> See [Adoption Matrix](cursor/18-adoption-matrix.md) for the feature-by-feature status breakdown.

## Hook Channel Status (as of Cursor 3.7.x)

Quick reference for hook response fields actually used by oh-my-cursor. Full evidence in [`docs/internal/hook-response-fields.md`](internal/hook-response-fields.md).

### Working channels

| Channel | Event | Notes |
|---------|-------|-------|
| `updated_input` | `preToolUse` (Task tool only) | Central composer rewrites Task prompt with piggybacked context. All context injection routes here. |
| `permission: "deny"` | `preToolUse` | Guards use this as primary block channel. TAKES-EFFECT at 3.7.x. |
| `followup_message` | `stop` | Loop-scoped context injection. Scoped to active ralph/boulder/ulw loops only. |
| `updated_input` | `preToolUse` (Shell, WebFetch) | non-interactive-env and webfetch-redirect-guard rewrite command/URL directly. |

### Broken or unsupported channels (do not use)

| Channel | Event | Status | Source |
|---------|-------|--------|--------|
| `additional_context` | `postToolUse` | **BROKEN at 3.7.x** — context never reaches model | Staff forum thread 155689; three-round 3.7.27 smoke test |
| `additional_context` | `sessionStart` | **BROKEN** — timing bug at session init | Staff forum thread 158452, Apr 19 2026 |
| `updated_input` | `beforeSubmitPrompt` | **NOT SUPPORTED BY DESIGN** | Staff forum thread 158883, Apr 23 2026 |
| `additional_context` | `beforeSubmitPrompt` | **NOT SUPPORTED BY DESIGN** | Staff forum thread 158883, Apr 23 2026 |

No handler in this repo emits `additional_context` in any response. All 18 handlers that previously used `postToolUse.additional_context` have been rerouted to `contextCollector.register()` + Task piggyback delivery.
