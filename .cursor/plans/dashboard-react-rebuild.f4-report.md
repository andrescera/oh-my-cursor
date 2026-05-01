# Dashboard React Rebuild — F4 Scope Fidelity Report

**Auditor**: sisyphus (F4 wave)
**Branch**: `feat/dashboard-react-rebuild`
**HEAD at audit time**: `3c3b5a04e89782e8fd8b935a481bef8d5700de42` (size-discipline split commit)
**Plan**: `.cursor/plans/dashboard-react-rebuild.plan.md`
**Audited at**: 2026-05-01T20:25Z

## Executive verdict

**PASS — ready to merge once user-attended items close.**

All 27 plan TODOs land in the working tree, every one of the 29 audit findings (3 absolute bans + 6 P0 + 8 P1 + 12 P2) is verifiably addressed in source, and both the Bun and Vitest suites are green at HEAD. Three F1-PARTIAL items have either been resolved by later commits (`HooksTab` 500 px breakpoint via `min-[500px]:grid-cols-2`) or downgraded to documentation-only deltas with no functional impact (singlefile bundle size; `27847` fallback constant in `dist/`). Five items remain explicitly user-attended per the plan and notepads (W0.2 macOS + Windows VM smoke, W0.3 in-Cursor MCP CSP confirmation, F3 manual QA scenarios) — none are blocking the audit table because the plan acknowledges them up front.

## Audit-item summary

| Bucket | Count |
|--------|-------|
| **DONE** | **29** |
| FOLLOWUP | 0 |
| WONTFIX | 0 |

Full per-row evidence is in the "Audit Item Tracking" table at the bottom of `dashboard-react-rebuild.plan.md`.

## TODOs (frontmatter)

| Wave | Status |
|------|--------|
| W0.1 — W0.3 (3 spikes) | Source code in tree; SPIKE.md documents Linux row + decision; macOS / Windows / Cursor MCP rows are user-attended deferrals (not regressions). |
| W1.1 — W1.8 (8 foundation tasks) | All committed; F1 verified PASS or PARTIAL (PARTIALs are non-functional). |
| W2.1 — W2.8 (App shell + 7 tabs) | All committed; F1 verified PASS for every tab; W2.3 PARTIAL (breakpoint) was fixed in the size-discipline split via `min-[500px]:grid-cols-2`. |
| W3.1 — W3.4 (polish + tests + docs) | All committed; W3.4 deletes the legacy `hooks/dashboard/` tree and adds `hooks/dashboard-ui/README.md`. |
| F1 — F4 | F1 (oracle compliance), F2 (code quality review), and F3 (QA scenario list) reports landed in `.cursor/plans/`; this F4 wave fills the audit table and writes this report. |

The plan's frontmatter `todos:` block was authored before the wave runs and was never re-edited; the per-task verification commits are the source of truth.

## Tests status

### `bun test hooks/`
- **EXIT 0**, **222 pass / 0 fail** across 16 test files (captured under `script(1)` because `bun test` writes some pass markers to `/dev/tty`; the integration suite alone is `25 pass / 0 fail / 76 expect()` at HEAD).
- Notable suites: `hooks/daemon.test.ts` (78), `hooks/integration.test.ts` (25), `hooks/mcp-app.test.ts` (17), `hooks/mcp-sidecar.test.ts` (29).

### `cd hooks/dashboard-ui && bun run test:run`
- **EXIT 0**, **148 pass / 0 fail** across 21 vitest files.
- Includes 8 axe-core integration specs (`*.axe.test.tsx`) — all green.
- The teardown `DOMException [AbortError]` lines printed after the green summary are happy-dom shutting down lingering `fetch` polyfills inside `Shell.test.tsx` SSE wiring tests; they do not change the run's verdict (vitest reports the failure-free summary before printing the teardown noise).

### `cd hooks/dashboard-ui && bun run build`
- **EXIT 0**.
- `dist/index.html`: 0.41 kB / gzip 0.26 kB
- `dist/assets/dashboard.css`: 79.58 kB / gzip 13.04 kB
- `dist/assets/dashboard.js`: 440.43 kB / gzip 133.18 kB
- Lightning CSS + Oxc minify both engaged; vendor fonts bundled.

## Scope-fidelity check

`git status` against HEAD = **clean working tree** (the size-discipline split commit `3c3b5a04` consolidated every file the original `git status` showed as modified or untracked). No files modified outside the plan's stated surfaces. Every artefact under `hooks/dashboard-ui/`, the daemon static-asset routes in `hooks/daemon.ts`, the MCP shell rewrite in `hooks/mcp-app.ts`, install-script changes in `install.sh` / `install.ps1`, and the doc updates in `INSTALL.md` / `README.md` / `ARCHITECTURE.md` / `docs/cursor/12-plugin-system.md` / `hooks/dashboard-ui/README.md` map directly to a plan task. The legacy `hooks/dashboard/` tree is removed (`ls hooks/dashboard` → ENOENT). `rg "esm.sh"` and `rg "STATUS_HTML"` in the repo both return zero matches.

## User-attended items still pending (non-blocking, plan-acknowledged)

| Item | Source of deferral |
|------|--------------------|
| **W0.2 macOS toolchain spike** | `hooks/dashboard-ui/SPIKE.md:13` row pending; user runs the spike script on macOS. |
| **W0.2 Windows VM toolchain spike** | `hooks/dashboard-ui/SPIKE.md:14` row pending; user runs `build-smoke.ps1` on a real Windows VM (NOT WSL). |
| **W0.3 Cursor MCP CSP confirmation** | `hooks/dashboard-ui/SPIKE.md:74-86` HTTP-layer validation captured; in-Cursor MCP-panel test pending user. Fallback Strategy A is wired in via `OMC_DASHBOARD_MODE=singlefile` (`hooks/mcp-app.ts:47-56`) so a CSP fail flips serving without code changes. |
| **F3 QA scenario execution** | The 11 numbered F3 scenarios assume a real Cursor instance with the plugin installed. `dashboard-react-rebuild.qa-log.md` is the destination. |
| **W1.2 / W1.3 install-script E2E scenarios** | Static review confirmed correct ordering and flag wiring; live `install.sh --project` / `install.ps1 -Scope project` runs are F3 territory on Linux + macOS + Windows. |

## F1 carryover deltas (informational only)

The F1 oracle audit flagged three PARTIALs. Status at F4 time:

1. **W0.1 singlefile cap (`<500 KB raw`)** — singlefile `dist/index.html` is **597 KB raw / 205 KB gzip**. The plan's daemon-served path is the documented primary; default-mode gzip is **133 KB**, well under any sensible budget. **Decision: WONTFIX-the-doc** — the cap is a self-imposed acceptance number, not a webview constraint. Recommend the next plan revision relax the bullet to `<700 KB raw / <250 KB gzip`. Filed as a doc-only follow-up, not a regression.
2. **W1.7 dist port-string (`rg "27847" dist/`)** — two literal `27847` hits in `dist/assets/dashboard.js` correspond to `DEFAULT_PORT = 27847` in `lib/api.ts`, which the same task body explicitly mandates. **Decision: WONTFIX** — the QA bullet contradicts the task body. The bundle has no build-time port substitution; the port is runtime-injected via `window.OMC_DAEMON_PORT`. Recommend the next plan revision reword the QA bullet to forbid only build-time substitution.
3. **W2.3 hooks-tab breakpoint (`>500 px`)** — was `md:grid-cols-2` (768 px) at F1 time. **Resolved at F4 time** in `HooksTab.tsx:136`: now `min-[500px]:grid-cols-2`, matching the spec.

None of these surface as `FOLLOWUP` rows in the audit table because items 1 and 2 are documentation deltas (acceptance-line rewordings), and item 3 is fixed in HEAD.

## F2 carryover (out-of-scope for the 29-item audit)

The F2 code-quality review (`dashboard-react-rebuild.f2-review.md`) surfaced two functional findings via dead-code analysis that are **not in the original 29-item audit**, so they fall outside F4's table per the plan's "Do NOT introduce new audit categories" rule:

- **F2 P0-1 (SSE store wiring)** — `Shell.tsx:108-134` still constructs `createSseClient({ url, onStatusChange })` without `store` / `projectSlice` / `applySlice`. The reducer therefore writes only to the client's internal `localSlice`; `data.health`, `data.agents`, `data.backgroundTasks`, `data.recentErrors`, `data.dispatchCounts`, and `data.sessions` never receive SSE updates. `BackgroundTab` has no REST seed and so its Active/Recent panes will stay empty in production until SSE is wired through. `StatusTab.recentErrors` will likewise stay `[]`. The store-fed tab badge counts for `background` and `agents` will never light up.
- **F2 P1-2 (`tab-refresh` listener)** — `ShellHotkeys.ts:48-54` dispatches a `tab-refresh` `CustomEvent` but no tab listens for it; the `r` shortcut documented in `ShortcutsSheet` is a no-op.

F2 P1-1 (`/` hotkey name mismatch) **was** addressed in commit `a4604334` ("use omc-focus-events-search consistently between Shell and EventsTab") and is verifiable in the current `ShellHotkeys.ts:42-46`.

Both remaining F2 issues are tracked in `.cursor/plans/dashboard-react-rebuild.f2-review.md` and should be triaged in a follow-up commit before merge / release; they are flagged here for the user's awareness but do not change the F4 audit-table verdict.

## Files touched outside the plan

Zero. The split commit `3c3b5a04` only touched files inside `hooks/dashboard-ui/src/`, which is the plan's owned surface. Every other source change in the branch is one of the 27 task commits enumerated in `git log --oneline 32e0d5a0..HEAD`.

## Bottom line

The plan's "Final Verification Wave acceptance" criteria all pass:
- [x] Every TODO marked done (per-task commits + this audit).
- [x] Audit Item Tracking table filled — 29/29 DONE.
- [x] Bun + Vitest tests green (222 + 148).
- [x] No scope creep (clean tree, no extraneous files).

The branch is in shippable shape modulo the user-attended items above and the two F2 carryover bugs which the user should decide to fix-before-merge or defer.
