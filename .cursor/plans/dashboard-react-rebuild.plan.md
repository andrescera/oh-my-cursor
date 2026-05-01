---
name: dashboard-react-rebuild
overview: Rewrite the 1643-line monolithic Preact-from-CDN dashboard at hooks/dashboard/render.ts as a Vite 8 + React 19 + Tailwind v4 + shadcn/ui + Zustand 5 SPA, served by the existing Bun daemon as static assets, built during install on Linux/macOS/Windows, with every audit P0/P1/P2 finding shipped.
todos:
  - id: w0-scaffold
    content: "W0.1 Scaffold hooks/dashboard-ui/ Vite 8 + React 19 + Tailwind v4 + shadcn + Zustand"
    status: pending
  - id: w0-toolchain-spike
    content: "W0.2 Three-OS toolchain spike (Linux/macOS/Windows): bun install + bunx --bun vite build"
    status: pending
  - id: w0-csp-spike
    content: "W0.3 CSP serving spike: daemon-served + dynamic-import shell vs singlefile fallback"
    status: pending
  - id: w1-daemon-routes
    content: "W1.1 Daemon static handler routes + ETag + dist-missing fallback page"
    status: pending
  - id: w1-install-sh
    content: "W1.2 install.sh build step (idempotent, dry-run safe, abort on fresh/force, warn on update)"
    status: pending
  - id: w1-install-ps1
    content: "W1.3 install.ps1 parity build step"
    status: pending
  - id: w1-mcp-shell
    content: "W1.4 MCP shell HTML rewrite (async getStatusHTML, port-injected per request, remove STATUS_HTML export)"
    status: pending
  - id: w1-store
    content: "W1.5 Zustand store (TDD) with persist middleware"
    status: pending
  - id: w1-sse-reducer
    content: "W1.6 SSE reducer module (TDD) with shutdown event handling"
    status: pending
  - id: w1-api-client
    content: "W1.7 Typed daemon API client (TDD)"
    status: pending
  - id: w1-theme
    content: "W1.8 shadcn install + theme tokens (VSCode vars + OKLCH neutral system)"
    status: pending
  - id: w2-app-shell
    content: "W2.1 App shell: tabs (arrow-key nav P0-1), conversation selector, SSE banner with reconnect countdown P2-6, tab count badges P1-5, keyboard shortcuts P2-9, dense mode toggle P2-8, persist active tab P2-1"
    status: pending
  - id: w2-status-tab
    content: "W2.2 Status tab with sparklines P2-4, sseOn bug fix P0-4, health resync P1-7"
    status: pending
  - id: w2-hooks-tab
    content: "W2.3 Hooks tab"
    status: pending
  - id: w2-background-tab
    content: "W2.4 Background tab with active/recent split + auto-prune toggle P1-4 P2-12"
    status: pending
  - id: w2-events-tab
    content: "W2.5 Events tab: focusable rows P0-2, text search P2-2, filter persist P2-5, aria-live P2-11, error retry P1-1, inline-confirm clear P1-3"
    status: pending
  - id: w2-sessions-tab
    content: "W2.6 Sessions tab: focusable rows P0-2, search and sort P2-7"
    status: pending
  - id: w2-agents-tab
    content: "W2.7 Agents tab: Gantt waterfall P2-3, history cap UX P1-8"
    status: pending
  - id: w2-config-tab
    content: "W2.8 Config tab: sidebar nav P2-10, diff before save P1-6, label association P0-6, human-readable Zod errors"
    status: pending
  - id: w3-reduced-motion
    content: "W3.1 prefers-reduced-motion + global a11y final pass P0-5"
    status: pending
  - id: w3-copy
    content: "W3.2 Copy fixes: kill -- and em dash P1-2, error recovery copy"
    status: pending
  - id: w3-test-migration
    content: "W3.3 Migrate mcp-app.test.ts, integration.test.ts, mcp-sidecar.test.ts to new contract"
    status: pending
  - id: w3-docs
    content: "W3.4 Documentation updates (INSTALL.md, README.md, ARCHITECTURE.md, docs/cursor/12-plugin-system.md)"
    status: pending
  - id: f1-oracle-audit
    content: "F1 Plan Compliance Audit (oracle)"
    status: pending
  - id: f2-code-review
    content: "F2 Code Quality Review"
    status: pending
  - id: f3-qa
    content: "F3 QA Scenario Execution"
    status: pending
  - id: f4-scope-check
    content: "F4 Scope Fidelity Check"
    status: pending
isProject: true
---

# Dashboard React + shadcn/ui Rebuild

## TL;DR

> **Quick Summary**: Replace the 1643-line monolith at [`hooks/dashboard/render.ts`](hooks/dashboard/render.ts) (Preact + htm from `esm.sh` CDN, 7 tabs, all logic inline) with a proper Vite 8 + React 19 + Tailwind v4 + shadcn/ui + Zustand 5 SPA in a new `hooks/dashboard-ui/` project. Build runs during `install.sh` / `install.ps1`; daemon serves the built assets. Apply impeccable design laws and ship every audit finding: 3 absolute-ban violations + 6 P0 a11y/bug + 8 P1 UX + 12 P2 features = **29 fixes**.
>
> **Deliverables**:
> - New `hooks/dashboard-ui/` project (React 19 + Tailwind v4 + shadcn + Zustand 5).
> - Vite 8 build with `@vitejs/plugin-react` v6 (Oxc), `@tailwindcss/vite`, Lightning CSS, Oxc minify.
> - Daemon static-asset routes at `GET /dashboard/` and `GET /dashboard/assets/*`.
> - Rewritten MCP shell at [`hooks/mcp-app.ts`](hooks/mcp-app.ts) (per-request port injection, no module-load cache).
> - `install.sh` + `install.ps1` build step with three-OS validation.
> - All 29 audit fixes implemented across the 7 tabs + cross-cutting polish.
> - Migrated tests: `mcp-app.test.ts`, `integration.test.ts`, `mcp-sidecar.test.ts` assert new contract.
>
> **Estimated Effort**: ~17–23 person-days across 4 waves + final verification.
>
> **Parallel Execution**: HEAVY — Wave 1 has 8 parallel tasks; Wave 2 has 8 parallel tabs; Wave 3 has 4 parallel polish tasks.
>
> **Critical Path**: W0 (toolchain + CSP spike) → W1 foundation (longest task: ~1.5 days) → W2 tabs (longest: Agents Gantt ~2 days) → W3 polish → Final verification.

---

## Context

### Current state
- Single file: [`hooks/dashboard/render.ts`](hooks/dashboard/render.ts) (1643 lines) returns a giant template-literal HTML string.
- Loaded at runtime via `<script type="module">import * as preact from 'https://esm.sh/preact@10.25.4'</script>` ([`hooks/dashboard/render.ts:417-419`](hooks/dashboard/render.ts:417-419)).
- Served as MCP `text/html` resource at `ui://oh-my-cursor/dashboard` ([`hooks/mcp/resources/dashboard.ts`](hooks/mcp/resources/dashboard.ts)) and from daemon's `GET /dashboard` ([`hooks/daemon.ts:243-246`](hooks/daemon.ts:243-246)).
- 7 tabs: **Status**, **Hooks**, **Background**, **Events**, **Config**, **Sessions**, **Agents**.
- Data sources: `/health`, `/sessions`, `/session-log` + `/session-log/clear`, `/config` + `/config/full` + `POST /config`, `/backgroundTasks`, `/agentHistory`. Live updates via SSE `/events/stream`.
- Existing Bun tests assert specific marker strings in `STATUS_HTML` ([`hooks/mcp-app.test.ts:6-101`](hooks/mcp-app.test.ts:6-101), [`hooks/integration.test.ts:333-342`](hooks/integration.test.ts:333-342), [`hooks/mcp-sidecar.test.ts:78-108`](hooks/mcp-sidecar.test.ts:78-108)).

### Architecture decisions (locked, with rationale)

**Strategy C — Daemon-served assets via dynamic-import shell** (user choice).

There are **two distinct HTML documents** in this design:

1. **MCP shell** — a small hand-written HTML string returned by `getStatusHTML(port)` in [`hooks/mcp-app.ts`](hooks/mcp-app.ts). It is **constructed in code at request time**, NOT the Vite-built file. It uses absolute localhost URLs and the known-fixed asset filenames from W0.1's vite config:

   ```html
   <!DOCTYPE html>
   <html><head>
     <meta charset="UTF-8" />
     <link rel="stylesheet" href="http://localhost:${port}/dashboard/assets/dashboard.css" />
     <title>oh-my-cursor Dashboard</title>
   </head><body>
     <div id="app"></div>
     <script>window.OMC_DAEMON_PORT = ${port};</script>
     <script type="module">
       import('http://localhost:${port}/dashboard/assets/dashboard.js').then(m => m.boot('#app'));
     </script>
   </body></html>
   ```

   Because this string is built from a JS template literal, port injection is straightforward concatenation — there is no `{PORT}` placeholder substitution in any built artifact.

2. **Vite `dist/index.html`** — the standard Vite-built HTML with default relative `./assets/...` URLs. **Not served by the daemon directly.** It exists on disk because Vite emits it, but the daemon's `/dashboard` and `/dashboard/index.html` routes always return the dynamic shell from `getStatusHTML()`. Developers wanting to test the raw built HTML use `bun run dev` or `bun run preview` instead.

W0.1's vite config pins asset filenames to `assets/dashboard.js` and `assets/dashboard.css` (no content hash), so the MCP shell's hard-coded references stay valid across rebuilds. This is the contract between W0.1 (build output naming) and W1.4 (shell construction).

**CSP fallback (Strategy A)**: Vite is configured with two build modes — `default` (described above) and `--mode singlefile` (via `vite-plugin-singlefile` for fully inlined HTML). W0.3 spike validates whether dynamic-import works under Cursor's MCP CSP. **If blocked**, the plan automatically flips to Strategy A by changing the `OMC_DASHBOARD_MODE` env to `singlefile` and adjusting `getStatusHTML` to read the inlined HTML from `dist/index.html` instead of constructing the shell. Daemon static routes remain (used by `GET /dashboard` browser access).

**Oracle dissent (disclosed)**: Oracle recommended Strategy A as the primary path, arguing that `script-src` is typically stricter than `connect-src` in webviews and Cursor controls the CSP. We honor the user's stated preference (Strategy C) but bake the fallback in so a failed CSP doesn't sink the plan.

### Library versions (May 2026, verified)
- Vite **8.0.10** (Rolldown default bundler, Lightning CSS minify, Oxc JS minify)
- React + react-dom **19.2.5**
- Tailwind CSS **4.2.4** + `@tailwindcss/vite` **4.2.4**
- shadcn CLI **4.6.0** (Tailwind v4 + React 19 supported)
- Zustand **5.0.12** (with `persist` middleware)
- TypeScript **6.0.3**
- `@vitejs/plugin-react` **6.0.1** (Oxc-based React Refresh, recommended over SWC for Vite 8)
- `vite-plugin-singlefile` **2.3.3** (Vite 8 peer support; used in fallback mode)
- `lucide-react` **1.14.0**
- Vitest **3.x** (latest stable at plan time)

### Test Strategy

- Infrastructure exists: YES (Bun test runner, multiple existing `*.test.ts` files).
- Mode: **TDD for logic, tests-after for components**.
- Frameworks:
  - **Bun test** (server side) — daemon static routes, MCP shell HTML, install build step.
  - **Vitest + React Testing Library** (client side) — store, reducer, API client (TDD); component snapshots and interaction tests (after).
- Agent-Executed QA: ALWAYS — each task includes explicit QA scenarios.

### Impeccable design notes

- **Register**: product (dev tool UI inside Cursor MCP panel).
- **Theme**: dark, driven by VSCode webview tokens. Keep `var(--vscode-*)` plumbing so light theme works automatically.
- **Color strategy**: Restrained — tinted dark neutrals (chroma 0.005–0.01 toward warm hue), one committed accent. Status colors derived via OKLCH near `var(--vscode-*)` family, no raw `#4ec9b0` / `#f44747`.
- **Layout**: vary spacing rhythm; avoid wrapping every section in a card; Config tab gets sidebar+pane (kills the identical-card-grid violation).
- **Motion**: ease-out-quart/quint, no bounce, only opacity/transform. `prefers-reduced-motion` honored throughout.
- **Copy**: kill `--`, em dash, raw `HTTP 502`. Error states have actionable recovery guidance.

### Oracle Consultation
- **Metis Intent**: Architecture (build pipeline change + UI rewrite + multi-platform install).
- **Oracle Dispatched**: YES.
- **Recommendation**: Strategy A (singlefile) as primary, three-OS spike, abort-on-fresh / warn-on-update for install failures, 3-phase phasing.
- **Plan Stance**: Honor user's Strategy C choice, bake Strategy A as fallback behind W0.3 tripwire. Adopt Oracle's install-failure semantics. Adopt Oracle's phasing structure but as waves not separate plans (user wants "all of it" in one effort).

---

## Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|----------------------|
| W0.1 scaffold | none | W0.2, W0.3, all W1 | none |
| W0.2 toolchain spike | W0.1 | W1.2, W1.3 | W0.3 |
| W0.3 CSP spike | W0.1 | W1.4, W2.* | W0.2 |
| W1.4 MCP shell | W0.3 | W1.1 (consumes getStatusHTML), W2.* | W1.3, W1.5, W1.6, W1.7, W1.8 |
| W1.1 daemon routes | W0.1, W1.4 | W1.2 build verify, W2.* (asset URLs) | W1.3, W1.5, W1.6, W1.7, W1.8 |
| W1.2 install.sh | W0.2, W1.1 | F3 QA on Linux/macOS | W1.3 |
| W1.3 install.ps1 | W0.2, W1.1 | F3 QA on Windows | W1.2 |
| W1.5 store | W0.1 | W2.* (every tab consumes the store) | W1.6, W1.7, W1.8 |
| W1.6 SSE reducer | W0.1 | W2.* (every tab subscribes) | W1.5, W1.7 |
| W1.7 API client | W0.1 | W2.* (every tab fetches) | W1.5, W1.6 |
| W1.8 theme tokens | W0.1 | W2.* (component styling) | W1.5, W1.6, W1.7 |
| W2.1 app shell | W1.4, W1.5, W1.8 | W2.2-W2.8 mount inside the shell | parallelizable shells parts split if needed |
| W2.2 Status tab | W1.5, W1.6, W1.7, W1.8 | W3.3 test migration | W2.3-W2.8 |
| W2.3 Hooks tab | W1.5, W1.6, W1.7, W1.8 | W3.3 | W2.2, W2.4-W2.8 |
| W2.4 Background tab | W1.5, W1.6, W1.7, W1.8 | W3.3 | W2.2, W2.3, W2.5-W2.8 |
| W2.5 Events tab | W1.5, W1.6, W1.7, W1.8 | W3.3 | W2.2-W2.4, W2.6-W2.8 |
| W2.6 Sessions tab | W1.5, W1.6, W1.7, W1.8 | W3.3 | W2.2-W2.5, W2.7, W2.8 |
| W2.7 Agents tab | W1.5, W1.6, W1.7, W1.8 | W3.3 | W2.2-W2.6, W2.8 |
| W2.8 Config tab | W1.5, W1.6, W1.7, W1.8 | W3.3 | W2.2-W2.7 |
| W3.1 reduced-motion | W2.1-W2.8 | F1, F2 | W3.2, W3.3, W3.4 |
| W3.2 copy fixes | W2.1-W2.8 | F1, F2 | W3.1, W3.3, W3.4 |
| W3.3 test migration | W1.4, W2.1-W2.8 | F1, F3 | W3.1, W3.2, W3.4 |
| W3.4 docs | W1.1, W1.2, W1.3, W2.1 | F1, F4 | W3.1, W3.2, W3.3 |
| F1 oracle audit | W3.* | F4 sign-off | F2, F3 |
| F2 code review | W3.* | F4 sign-off | F1, F3 |
| F3 QA scenarios | W3.* | F4 sign-off | F1, F2 |
| F4 scope check | F1, F2, F3 | release | none |

---

## TODOs

### Wave 0 — Toolchain + Serving Spike (gating)

- [ ] **W0.1 Scaffold `hooks/dashboard-ui/`**

  **What to do**:
  - Create new directory `hooks/dashboard-ui/` (sibling of `hooks/dashboard/`, do NOT collide).
  - `cd hooks/dashboard-ui && bun init -y` then add deps:
    ```
    bun add react@19.2.5 react-dom@19.2.5 zustand@5.0.12
    bun add -d vite@8.0.10 @vitejs/plugin-react@6.0.1 typescript@6.0.3 \
                tailwindcss@4.2.4 @tailwindcss/vite@4.2.4 \
                vite-plugin-singlefile@2.3.3 vitest@latest \
                @testing-library/react@latest @testing-library/jest-dom@latest \
                @types/react@latest @types/react-dom@latest \
                lucide-react@1.14.0
    ```
  - `bunx shadcn@4.6.0 init -t vite` (Tailwind v4 + React 19 path).
  - `vite.config.ts` — minimal. **Fixed asset filenames (no content hash)** are part of the build contract; the MCP shell in W1.4 references them by name, so they must not change across rebuilds:
    ```ts
    import { defineConfig } from 'vite'
    import react from '@vitejs/plugin-react'
    import tailwindcss from '@tailwindcss/vite'
    import { viteSingleFile } from 'vite-plugin-singlefile'

    export default defineConfig(({ mode }) => ({
      base: process.env.OMC_DASHBOARD_BASE ?? '/dashboard/',
      plugins: [
        react(),
        tailwindcss(),
        ...(mode === 'singlefile' ? [viteSingleFile()] : []),
      ],
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        cssMinify: 'lightningcss',
        minify: 'oxc',
        rolldownOptions: {
          output: {
            entryFileNames: 'assets/dashboard.js',
            chunkFileNames: 'assets/[name].js',
            assetFileNames: ({ name }) => name?.endsWith('.css') ? 'assets/dashboard.css' : 'assets/[name][extname]',
          },
        },
      },
    }))
    ```
    The asset names `assets/dashboard.js` and `assets/dashboard.css` are pinned. Code-splitting must be disabled or coalesced so there is exactly one JS entry and one CSS file (the React app is small enough that this is fine; if a future feature requires lazy chunks, change the strategy across W0.1, W1.1, and W1.4 in lockstep).
  - Hello-world `App.tsx` returning a single shadcn Button.
  - Add `.gitignore` for `node_modules/` and `dist/`.
  - Add `package.json` scripts: `"build"`, `"build:singlefile"`, `"dev"`, `"test"`, `"test:run"`.

  **Must NOT do**:
  - Do NOT delete or modify `hooks/dashboard/render.ts` yet (Wave 3 deletes it).
  - Do NOT commit `dist/` or `node_modules/`.
  - Do NOT use SWC plugin (`@vitejs/plugin-react-swc`) — Vite 8 docs recommend the Oxc-based v6 plugin.

  **References**:
  - [`hooks/dashboard/render.ts`](hooks/dashboard/render.ts) (existing dashboard for surface map)
  - [`hooks/package.json`](hooks/package.json) (Bun version + existing deps style)
  - shadcn Vite install: https://ui.shadcn.com/docs/installation/vite

  **Acceptance Criteria**:
  - [ ] `bun run build` produces `hooks/dashboard-ui/dist/index.html` + `dist/assets/dashboard.js` + `dist/assets/dashboard.css`.
  - [ ] `bun run build:singlefile` produces a single `dist/index.html` with no external assets (file size <500KB raw).
  - [ ] `bun run test` passes (zero tests, just toolchain).
  - [ ] `node_modules/` and `dist/` ignored.

  **QA Scenarios**:
  - `cd hooks/dashboard-ui && bun install && bun run build` exits 0; `ls dist/` shows `index.html`, `assets/dashboard.js`, `assets/dashboard.css`.
  - `bun run build:singlefile` produces a single `dist/index.html` containing inlined `<script>` and `<style>` blocks; `wc -c dist/index.html` < 500000.
  - `bun run test` exits 0 (zero tests is acceptable here, just toolchain).
  - `git status` shows `dist/` and `node_modules/` ignored.

  **Commit**: `feat(dashboard): scaffold hooks/dashboard-ui Vite 8 + React 19 + shadcn project`

---

- [ ] **W0.2 Three-OS toolchain spike**

  **What to do**:
  - Create `hooks/dashboard-ui/scripts/build-smoke.sh` (Linux/macOS) and `build-smoke.ps1` (Windows) that run `bun install && bunx --bun vite build && bunx --bun vite build --mode singlefile` and report bundle sizes.
  - Run the script on **Linux** (current host), **macOS** (CI matrix or coworker laptop), **Windows** (real Windows VM, NOT WSL — Bun-on-Windows is the riskiest target).
  - Record bundle sizes (raw + gzipped) in `hooks/dashboard-ui/SPIKE.md`.
  - If any platform fails, document failure mode and remediation; do NOT mark complete until all three pass or remediation is committed (e.g. minimum Bun version pin in `INSTALL.md`).

  **Must NOT do**:
  - Do NOT use WSL as a Windows substitute.
  - Do NOT skip the spike if Linux works — Windows is the actual blocker.

  **References**:
  - [`INSTALL.md`](INSTALL.md) (current prereqs)
  - [`install.ps1`](install.ps1) (Windows install path)
  - Bun + Vite docs: https://bun.sh/docs/guides/ecosystem/vite

  **Acceptance Criteria**:
  - [ ] `SPIKE.md` records bundle sizes on all three OSes.
  - [ ] Both `default` and `singlefile` modes build successfully on each.
  - [ ] Bundle size (gzipped, default mode) is documented; if >500KB gzipped, plan flips primary mode to singlefile (no daemon assets cost saved at that size).

  **QA Scenarios**:
  - On Linux: `bash hooks/dashboard-ui/scripts/build-smoke.sh` exits 0, prints raw + gzipped sizes for both modes.
  - On macOS: same script, same expectation.
  - On Windows VM (NOT WSL): `pwsh hooks/dashboard-ui/scripts/build-smoke.ps1` exits 0, prints sizes.
  - Manual: `cat hooks/dashboard-ui/SPIKE.md` shows three rows (Linux/macOS/Windows) with timestamps and sizes.

  **Commit**: `chore(dashboard-ui): record three-OS toolchain spike results`

---

- [ ] **W0.3 CSP / serving spike**

  **What to do**:
  - Add a temporary `GET /dashboard-spike` route to [`hooks/daemon.ts`](hooks/daemon.ts) that returns a minimal HTML shell:
    ```html
    <script type="module">
      import('http://localhost:{PORT}/dashboard-spike/test.js')
        .then(m => document.body.innerText = 'CSP_OK:' + m.value)
        .catch(e => document.body.innerText = 'CSP_FAIL:' + e.message);
    </script>
    ```
  - Add `GET /dashboard-spike/test.js` returning `export const value = 'hello';` with `Content-Type: application/javascript`.
  - Register a temporary MCP resource `ui://oh-my-cursor/dashboard-spike` returning the shell HTML.
  - Have the user open the MCP resource in Cursor's MCP panel; capture the result (`CSP_OK` / `CSP_FAIL`) in `hooks/dashboard-ui/SPIKE.md`.
  - **Decision gate**:
    - `CSP_OK` → primary mode is **daemon-served**. W1.4 builds the dynamic-import shell.
    - `CSP_FAIL` → primary mode flips to **singlefile**. W1.4 reads `dist/index.html` directly. Daemon static routes (W1.1) still ship for browser access at `http://localhost:{PORT}/dashboard`.
  - Remove the `/dashboard-spike*` routes and MCP resource after recording the result (clean up at end of task).

  **Must NOT do**:
  - Do NOT permanently leave the spike routes / MCP resource.
  - Do NOT skip this — Strategy C without CSP validation is the highest plan-level risk.

  **References**:
  - [`hooks/daemon.ts:243-246`](hooks/daemon.ts:243-246) (existing `/dashboard` route to mirror style)
  - [`hooks/mcp/resources/dashboard.ts`](hooks/mcp/resources/dashboard.ts) (MCP resource registration pattern)

  **Acceptance Criteria**:
  - [ ] `SPIKE.md` records `CSP_OK` or `CSP_FAIL` with full error message if any.
  - [ ] Plan's primary-mode decision recorded in `SPIKE.md` (daemon-served vs singlefile).
  - [ ] Spike routes and MCP resource cleaned up before commit.

  **QA Scenarios**:
  - Start daemon with spike routes registered. `curl http://localhost:27847/dashboard-spike/test.js` returns `export const value = 'hello';` with `Content-Type: application/javascript`.
  - User opens `ui://oh-my-cursor/dashboard-spike` in Cursor MCP panel, screenshots the body text. Result must be either `CSP_OK:hello` or `CSP_FAIL:<error>`.
  - `cat hooks/dashboard-ui/SPIKE.md` shows the recorded result and the chosen primary mode.
  - After completion, `rg -n 'dashboard-spike' hooks/` returns no matches (cleanup verified).

  **Commit**: `chore(dashboard-ui): record MCP CSP serving-mode decision`

---

### Wave 1 — Foundation (8 parallel tasks)

- [ ] **W1.1 Daemon static-asset routes**

  **What to do**:
  - In [`hooks/daemon.ts`](hooks/daemon.ts):
    - **Modify** the existing `GET /dashboard` route ([line 243](hooks/daemon.ts:243)) to `await getStatusHTML(actualPort)` and return `Content-Type: text/html`, `Cache-Control: no-store`, **status 200 always**. `getStatusHTML` itself always resolves to a string (the dynamic shell in daemon mode; the inlined HTML or the shared "Dashboard not built" body in singlefile mode) — never throws and never signals dist-missing via HTTP status. Status code differentiation is reserved for the asset routes.
    - **Add** `GET /dashboard/index.html` — same handler as `GET /dashboard`. Both URLs serve the identical dynamic shell. No redirect. This keeps semantics simple and avoids confusion with the on-disk `dist/index.html` (which the daemon never serves).
    - **Add** `GET /dashboard/assets/<file>` → serve from `hooks/dashboard-ui/dist/assets/` with proper `Content-Type` (`application/javascript` for `.js`, `text/css` for `.css`, etc.) and weak ETag based on file mtime+size. If `dist/assets/` is missing or the requested asset doesn't exist (e.g. `--skip-dashboard-build`), return **`503`** with a small helpful body. The shell loads, then the bootstrap script's `import(...)` rejection triggers an inline error in `<div id="app">` directing the user to run install.
    - Caching headers, **aligned with W0.1's fixed-filename contract** (filenames don't change across rebuilds, so `immutable` would be incorrect):
      - `/dashboard` and `/dashboard/index.html` → `Cache-Control: no-store`.
      - `/dashboard/assets/*` → `Cache-Control: public, max-age=60, must-revalidate` plus `ETag`. Short max-age covers typical browser refresh; ETag round-trip handles content changes after install rebuilds.
    - Honor conditional requests: if `If-None-Match` matches the current ETag, return 304.
  - Path-traversal hardening: refuse any `..` in the asset path.
  - Add Bun tests in `hooks/daemon.test.ts` covering: 200 dynamic shell at both URLs (`/dashboard` and `/dashboard/index.html`), 503 fallback for assets when dist missing, correct Content-Type per asset type, ETag + If-None-Match 304, asset Cache-Control header value, path traversal refused.

  **Must NOT do**:
  - Do NOT serve the assets through the MCP resource (only the shell HTML; assets fetched from daemon).
  - Do NOT bake the dist path as an absolute string — derive from `process.cwd()` + relative path so `bun run` from any cwd works.

  **References**:
  - [`hooks/daemon.ts:243-246`](hooks/daemon.ts:243-246) (current `/dashboard` route)
  - [`hooks/integration.test.ts:333-342`](hooks/integration.test.ts:333-342) (existing dashboard integration test pattern)

  **Acceptance Criteria**:
  - [ ] All new routes covered by Bun tests, all green.
  - [ ] `curl http://localhost:27847/dashboard` and `curl http://localhost:27847/dashboard/index.html` both return 200 + correct shell when dist exists.
  - [ ] `curl http://localhost:27847/dashboard` returns 200 even when dist is missing (daemon-mode shell does not depend on dist).
  - [ ] `curl http://localhost:27847/dashboard/assets/dashboard.js` returns 503 + helpful body when dist is missing.
  - [ ] Path traversal returns 400; no file outside `dist/` ever served.

  **QA Scenarios**:
  - `bun test hooks/daemon.test.ts` exits 0 with the new test cases green.
  - With dist present: `curl -i http://localhost:27847/dashboard` returns `200`, `Content-Type: text/html`, `Cache-Control: no-store`, body contains `http://localhost:27847/dashboard/assets/dashboard.js` literal.
  - With dist present: `curl -i http://localhost:27847/dashboard/index.html` returns `200` with the same body as `/dashboard` (byte-equal).
  - With dist present: `curl -i http://localhost:27847/dashboard/assets/dashboard.js` returns `200`, `Content-Type: application/javascript`, `Cache-Control: public, max-age=60, must-revalidate`, an `ETag` header.
  - Conditional: `curl -i -H "If-None-Match: <etag>" http://localhost:27847/dashboard/assets/dashboard.js` returns `304`.
  - Move dist aside: `curl -i http://localhost:27847/dashboard/assets/dashboard.js` returns `503` with a helpful body. `/dashboard` itself still returns `200` (daemon-mode shell does not depend on dist).
  - `curl -i 'http://localhost:27847/dashboard/assets/../daemon.ts'` returns `400` (or `404`); response body never includes `daemon.ts` content.

  **Commit**: `feat(daemon): serve hooks/dashboard-ui/dist/ as /dashboard/* with ETag and traversal guard`

---

- [ ] **W1.2 install.sh build step**

  **What to do**:
  - In [`install.sh`](install.sh), add a new function `build_dashboard_ui` that runs `(cd "$REPO_ROOT/hooks/dashboard-ui" && bun install --frozen-lockfile && bunx --bun vite build)` and writes `BUILD_OK=1` or `BUILD_OK=0` into a global flag.
  - **Ordering — critical**: call `build_dashboard_ui` BEFORE any destructive operation (`stop_daemon`, `remove_plugin_files`, `cleanup_legacy_loose_files`) in all three install paths. The current update flow at `682:696:install.sh` runs `backup_installation` → `stop_daemon` → `remove_plugin_files` → `copy_plugin_files`; the build call inserts ahead of `stop_daemon`. Force at `698:727:install.sh` and fresh at `729:754:install.sh` get the build call ahead of their own destructive blocks.
  - Honor `DRY_RUN=true` — log the command but skip execution.
  - Failure semantics:
    - **Fresh install + force reinstall**: build runs first; on failure, abort with clear error: "Dashboard build failed. Fix and re-run, or run with `--skip-dashboard-build` to install without dashboard." Because the build runs before any destructive op, no rollback is needed.
    - **Update install**: build runs first, before `stop_daemon` / `remove_plugin_files`. On build failure, set `DASHBOARD_BUILD_SKIPPED=true` and proceed with the rest of the update. The flag must guard:
      - `remove_plugin_files`: skip removal of `$PLUGIN_DIR/hooks/dashboard-ui/dist/` when the flag is set (use `find`/`rsync --exclude` or an explicit skip branch).
      - `copy_plugin_files`: skip copying `$REPO_ROOT/hooks/dashboard-ui/dist/` when the flag is set (the source-tree dist is potentially stale or empty).
      - Log a clear warning at install end: "Dashboard build failed; existing dashboard preserved at $PLUGIN_DIR/hooks/dashboard-ui/dist/."
  - Add `--skip-dashboard-build` CLI flag — sets `DASHBOARD_BUILD_SKIPPED=true` directly without attempting the build. Behavior is identical across fresh / force / update paths: install proceeds; `GET /dashboard` still serves the shell (200), but `GET /dashboard/assets/dashboard.js` returns 503 "Dashboard not built" so the in-panel app shows an inline error directing the user to run install again without the flag. No interaction with `--force`. Final install banner notes the skipped build so the user knows the dashboard is intentionally absent.
  - Update `cleanup_legacy_loose_files` to never delete `hooks/dashboard-ui/dist/` regardless of the flag.

  **Must NOT do**:
  - Do NOT call `build_dashboard_ui` after `stop_daemon` / `remove_plugin_files` (any order where destruction precedes the build leaves the user without a working dashboard if the build fails).
  - Do NOT run `bun install` for `hooks/` (the daemon's package, separate concern; daemon's start script handles that).
  - Do NOT change versioning behavior — the version short-circuit at the top of install still applies.

  **References**:
  - [`install.sh`](install.sh) (update path `682:696:install.sh`, force path `698:727:install.sh`, fresh path `729:754:install.sh`, `copy_plugin_files` at `450:478:install.sh`)

  **Acceptance Criteria**:
  - [ ] Fresh install with valid project: build succeeds before any destructive op, dist copied to `PLUGIN_DIR/hooks/dashboard-ui/dist/`.
  - [ ] Fresh install with deliberate build failure (syntax error in `App.tsx`): aborts with non-zero exit; no plugin files modified.
  - [ ] Update install with deliberate build failure: warns, preserves prior `$PLUGIN_DIR/hooks/dashboard-ui/dist/`, install completes; the rest of the plugin tree is updated normally.
  - [ ] `--dry-run` logs the build command without running it.
  - [ ] `--skip-dashboard-build` exits 0 on fresh, force, and update; final banner mentions the skipped build; `/dashboard` shell still returns 200 while `/dashboard/assets/*` returns 503 until next install.

  **QA Scenarios** (note: `install.sh --project` is a boolean flag; the install scope is the cwd, not a path arg):
  - Setup helper: `OMC_TEST_DIR=$(mktemp -d) && pushd "$OMC_TEST_DIR"`.
  - Fresh dry-run: `bash "$REPO_ROOT/install.sh" --project --dry-run` logs the build command without running it; `ls "$OMC_TEST_DIR/.cursor"` shows nothing dashboard-related.
  - Fresh real: `bash "$REPO_ROOT/install.sh" --project` exits 0; `ls "$OMC_TEST_DIR/.cursor/plugins/oh-my-cursor/hooks/dashboard-ui/dist/index.html"` exists (path may vary; resolve via `$OMC_TEST_DIR/.cursor/...` glob).
  - Fresh failure: introduce a syntax error in `$REPO_ROOT/hooks/dashboard-ui/src/App.tsx`, run install in a fresh `$OMC_TEST_DIR`; install exits non-zero before any destructive op; target plugin dir is empty.
  - Update success: revert syntax error, re-run `bash "$REPO_ROOT/install.sh" --project` in the same `$OMC_TEST_DIR`; build succeeds, dist updated; uninstall via `bash "$REPO_ROOT/install.sh" --project --uninstall` cleans up.
  - Update failure: re-introduce syntax error, re-run install in the same `$OMC_TEST_DIR`; install exits 0 with warning; `sha256sum` of `$OMC_TEST_DIR/.cursor/plugins/oh-my-cursor/hooks/dashboard-ui/dist/index.html` matches the pre-update hash.
  - Skip on fresh: in a clean `$OMC_TEST_DIR`, `bash "$REPO_ROOT/install.sh" --project --skip-dashboard-build` exits 0; final banner reports "Dashboard build skipped"; `curl http://localhost:27847/dashboard/assets/dashboard.js` returns 503.
  - Skip on update: same flag on an existing install exits 0; previously-built `dist/` (if any) is preserved; rest of the update completes normally.
  - Skip with `--force`: `bash "$REPO_ROOT/install.sh" --project --skip-dashboard-build --force` behaves identically to skip without `--force`.
  - Cleanup: `popd && rm -rf "$OMC_TEST_DIR"` between scenarios.

  **Commit**: `feat(install): build dashboard-ui before any destructive op; preserve dist on update build failure`

---

- [ ] **W1.3 install.ps1 build step (Windows parity)**

  **What to do**:
  - Mirror W1.2 in [`install.ps1`](install.ps1): add `Build-DashboardUI` PowerShell function with the same `$BuildOk` global semantics.
  - **Ordering — critical**: call `Build-DashboardUI` BEFORE `Stop-OhMyCursorDaemon` / `Remove-PluginFiles` in update path (currently `626:634:install.ps1`), and ahead of any destructive op in fresh path (`635:638:install.ps1`).
  - Same dry-run handling, same failure semantics: abort on fresh + force build failure; on update build failure set `$DashboardBuildSkipped = $true` and gate `Remove-PluginFiles` and `Copy-PluginFiles` so the existing `$PluginDir\hooks\dashboard-ui\dist\` is preserved untouched.
  - Add `-SkipDashboardBuild` switch — identical to its bash counterpart: exits 0 on fresh / force / update; final banner mentions the skipped build; no interaction with `-Force`.
  - Verify on the Windows VM from W0.2.

  **Must NOT do**:
  - Do NOT call `Build-DashboardUI` after `Remove-PluginFiles` (same rationale as W1.2).
  - Do NOT fix unrelated install.ps1 parity gaps (no python3/jq/curl checks, no force cleanup) — explicit out-of-scope.
  - Do NOT use WSL paths.

  **References**:
  - [`install.ps1`](install.ps1) (`Copy-PluginFiles` and the install paths in `601:683:install.ps1`)

  **Acceptance Criteria**:
  - [ ] Fresh install on Windows VM: build succeeds before destructive ops, dist copied.
  - [ ] Build failure on fresh: aborts with clear error, no plugin files modified.
  - [ ] Build failure on update: warns and keeps prior dist; rest of update completes.
  - [ ] `-DryRun` and `-SkipDashboardBuild` work as documented.

  **QA Scenarios** (all on Windows VM, NOT WSL; note: `install.ps1` uses `-Scope user|project` and resolves the install root from cwd when `-Scope project`):
  - Setup helper: `$omcTestDir = New-Item -ItemType Directory "$env:TEMP\omc-test-$(Get-Random)" -Force; Push-Location $omcTestDir`.
  - Fresh dry-run: `pwsh "$repoRoot\install.ps1" -Scope project -DryRun` logs the build command; `$omcTestDir\.cursor\` is empty after.
  - Fresh real: `pwsh "$repoRoot\install.ps1" -Scope project` exits 0; `Test-Path "$omcTestDir\.cursor\plugins\oh-my-cursor\hooks\dashboard-ui\dist\index.html"` returns `True`.
  - Fresh failure: same syntax-error scenario as W1.2 — exits non-zero, no plugin files modified.
  - Update success / failure: re-run install in the same `$omcTestDir`; dist preservation byte-verified with `Get-FileHash` before/after.
  - Skip on fresh / update / with `-Force`: `-SkipDashboardBuild` exits 0 in all three cases; banner notes skipped build; `/dashboard/assets/dashboard.js` returns 503 while `/dashboard` shell still returns 200 until next install (matches W1.2).
  - Cleanup: `Pop-Location; Remove-Item -Recurse -Force $omcTestDir` between scenarios.

  **Commit**: `feat(install): Windows install.ps1 parity for dashboard-ui build step`

---

- [ ] **W1.4 MCP shell HTML construction + per-request port injection**

  **What to do**:
  - Replace the body of [`hooks/mcp-app.ts`](hooks/mcp-app.ts):
    - Remove the module-load `STATUS_HTML` cache. The eagerly-computed export is incompatible with the new async / dist-aware behavior; **delete** the `STATUS_HTML` export entirely.
    - **Update [`hooks/mcp-app.test.ts`](hooks/mcp-app.test.ts) in this same task** so the suite stays green at HEAD. Replace marker-string assertions with the new contract: `await getStatusHTML(27847)` resolves to a string containing `<div id="app">`, contains the `http://localhost:27847/dashboard/assets/dashboard.js` literal in daemon mode, and the singlefile-mode branch returns the inlined dist. Tests for `STATUS_HTML` are removed. (W3.3 owns the parallel updates to `hooks/integration.test.ts` and `hooks/mcp-sidecar.test.ts`.)
    - Make `getStatusHTML(port?: number): Promise<string>` **asynchronous**. Daemon's `GET /dashboard` handler ([`hooks/daemon.ts:243-246`](hooks/daemon.ts:243-246)) and the MCP resource handler ([`hooks/mcp/resources/dashboard.ts`](hooks/mcp/resources/dashboard.ts) — already `async`) both `await` it.
    - Use `await Bun.file(distIndexPath).exists()` for the dist existence check. Dist path derived from `import.meta.dir` joined to `../dashboard-ui/dist/index.html`.
    - Mode chosen via `process.env.OMC_DASHBOARD_MODE` (`'daemon'` default, `'singlefile'` fallback):
      - **Daemon mode (primary)**: build the shell HTML in code via a JS template literal, substituting the runtime port directly via string concatenation (no placeholder, no built-artifact rewriting). The shell mirrors the architecture decision section: a `<div id="app">`, a small `<script>window.OMC_DAEMON_PORT = ${port};</script>`, and a `<script type="module">` that calls `import('http://localhost:${port}/dashboard/assets/dashboard.js').then(m => m.boot('#app'))`. Stylesheet via `<link rel="stylesheet" href="http://localhost:${port}/dashboard/assets/dashboard.css">`. No fs read needed in daemon mode.
      - **Singlefile mode**: `await Bun.file(distIndex).text()` and return it with a prepended `<script>window.OMC_DAEMON_PORT = ${port};</script>` injected before the inlined `<script type="module">` block via single string `replace`.
      - Dist missing (singlefile mode only): return the same "Dashboard not built" page that W1.1's daemon serves (centralize the markup in a shared helper used by both — keep that helper synchronous; it returns a constant string).
    - In-memory cache keyed by `(mode, port)`; cached value resolved as `Promise<string>` to keep the call signature uniform.
  - Update [`hooks/mcp/resources/dashboard.ts`](hooks/mcp/resources/dashboard.ts) to `await getStatusHTML(getDaemonPort())` per read (its handler is already `async`).
  - Note: the daemon's `GET /dashboard` and `GET /dashboard/index.html` handlers are wired up in W1.1 to `await getStatusHTML(actualPort)` — same async API. W1.4 just delivers the function those handlers consume.

  **Must NOT do**:
  - Do NOT keep `STATUS_HTML` as an export. It is removed in this task; tests asserting it move to the new async API in W3.3.
  - Do NOT introduce a `{PORT}` placeholder in any built artifact. Daemon mode never reads a built artifact for the shell; singlefile mode reads the artifact untouched and prepends one fresh `<script>` tag with the port.
  - Do NOT keep any `import preact from 'esm.sh'` in the codebase after W2.1.
  - Do NOT hardcode the dist path — derive from `import.meta.dir` or equivalent Bun API.

  **References**:
  - [`hooks/mcp-app.ts`](hooks/mcp-app.ts) (current 14-line implementation)
  - [`hooks/mcp/resources/dashboard.ts`](hooks/mcp/resources/dashboard.ts)
  - [`hooks/port-manager.ts`](hooks/port-manager.ts) (`getDaemonPort` source)
  - W0.1 vite config (fixed asset filenames `assets/dashboard.js`, `assets/dashboard.css`)

  **Acceptance Criteria**:
  - [ ] `getStatusHTML` signature is `(port?: number) => Promise<string>`; no synchronous variant exposed.
  - [ ] `STATUS_HTML` export removed; only the async `getStatusHTML` and the shared "not built" markup helper are exported.
  - [ ] `await getStatusHTML(27847)` and `await getStatusHTML(27848)` resolve to HTML containing `http://localhost:27847/dashboard/assets/dashboard.js` and `...:27848/...` respectively (daemon mode).
  - [ ] Two awaited calls with the same `(mode, port)` resolve to identical strings (cache hit).
  - [ ] Module-load side effect removed (test imports the module and asserts no fs/network call before first invocation).
  - [ ] Daemon-mode shell never references the dist directory.
  - [ ] Singlefile-mode dist-missing resolves to the shared "not built" page.

  **QA Scenarios**:
  - `bun test hooks/mcp-app.test.ts` exits 0 standalone (W1.4's commit updates both source and test together).
  - Manual: `bun -e "const m = await import('./hooks/mcp-app.ts'); console.log(await m.getStatusHTML(27847))"` output contains the literal `http://localhost:27847/dashboard/assets/dashboard.js` and `http://localhost:27847/dashboard/assets/dashboard.css`.
  - Manual: same call with port `27848` swaps both substrings to `27848`.
  - Manual: `OMC_DASHBOARD_MODE=singlefile bun -e "..."` returns the inlined HTML from `dist/index.html` with a prepended `<script>window.OMC_DAEMON_PORT = 27847;</script>` block.
  - Cache: invoke `await getStatusHTML(27847)` twice in the same process; both resolve to strictly equal strings.
  - Module-load: `bun -e "import('./hooks/mcp-app.ts')"` does not read any file or open any socket before any explicit invocation (verified via `bun --inspect` or strace).
  - `rg -n 'STATUS_HTML' hooks/mcp-app.ts hooks/mcp-app.test.ts` returns zero matches at the end of this task; W3.3 verifies repo-wide.

  **Commit**: `refactor(mcp-app): construct shell at request time with port via template literal, kill module-load cache`

---

- [ ] **W1.5 Zustand store with persist middleware (TDD)**

  **What to do**:
  - Create `hooks/dashboard-ui/src/store/dashboard.ts` exporting `useDashboardStore` (Zustand 5).
  - Slices:
    - `ui` — `activeTab`, `denseMode`, `expandedKeys` (per-tab Map), `eventsFilter`, `eventsAutoScroll`, `eventsSearch`, `sessionsSearch`, `sessionsSort`.
    - `connection` — `selectedConversation`, `sseStatus`.
    - `data` — `health`, `hooks`, `backgroundTasks`, `events`, `config`, `sessions`, `agents`.
  - Persist middleware (localStorage key `omc-dashboard-prefs-v1`) for `ui` slice ONLY (not `data` — that's volatile).
  - Selectors helper file: `selectors.ts` exporting reusable selectors with `useShallow`.
  - **TDD**: Write tests FIRST in `dashboard.test.ts`:
    - Initial state shape.
    - `setActiveTab`, `toggleDense`, `setEventsFilter` actions.
    - `expandedKeys` per-tab map operations (add/remove/clear).
    - Persistence: localStorage hydration round-trip; only `ui` keys persisted.
  - Implement to make tests green.

  **Must NOT do**:
  - Do NOT put SSE subscription logic in the store (W1.6 is the reducer; store consumes its output).
  - Do NOT persist `data` slice (massive bloat, stale on reload).

  **References**:
  - Audit P2-1, P2-5, P2-8 (persistence requirements)
  - Existing per-tab `useState` in [`hooks/dashboard/render.ts`](hooks/dashboard/render.ts) (state map source)

  **Acceptance Criteria**:
  - [ ] Tests green: `bun run test src/store`.
  - [ ] localStorage round-trip: setting `denseMode = true`, reload, value preserved.
  - [ ] `data` slice never appears in localStorage.
  - [ ] `useDashboardStore.getState()` exposes typed state matching the slice contract.

  **QA Scenarios**:
  - `cd hooks/dashboard-ui && bun run test src/store` exits 0; coverage report shows 100% on store actions.
  - Manual (Vitest interactive): set `useDashboardStore.getState().setActiveTab('events')`; then `localStorage.getItem('omc-dashboard-prefs-v1')` contains `"activeTab":"events"`.
  - Manual: set `useDashboardStore.getState().setHealth({uptime: 999})`; verify `localStorage` value does NOT contain `999` (data slice never persists).
  - Reload simulation in test: rehydrate store from existing localStorage; `getState().ui.activeTab` matches the persisted value.

  **Commit**: `feat(dashboard-ui): Zustand store with persist middleware, TDD-covered`

---

- [ ] **W1.6 SSE reducer module (TDD)**

  **What to do**:
  - Create `hooks/dashboard-ui/src/lib/sse-reducer.ts` exporting:
    ```ts
    export type SseEvent = { /* … */ }
    export type SseSliceState = { /* … */ }
    export function reduceSseEvent(state: SseSliceState, event: SseEvent): SseSliceState
    ```
  - Pure function. Handles:
    - `health` → updates health slice.
    - `subagentStart` / `subagentStop` → updates agents + background slices, dedupes by `agent_id`.
    - `tool_call` increments → updates dispatch counters.
    - `error` → appends to recent errors (capped at 10).
    - `conversation-snapshot` → updates sessions slice.
    - `shutdown` → sets `connection.sseStatus = 'shutdown'` (frontend reconnects after delay).
    - Unknown event types → ignored (no-op, no throw).
  - Reuse logic from [`hooks/dashboard/sse-payload-from-event.ts`](hooks/dashboard/sse-payload-from-event.ts) and [`hooks/dashboard/merge-by-agent-id.ts`](hooks/dashboard/merge-by-agent-id.ts) (ports, can copy + add types).
  - **TDD**: write tests covering every event type and the unknown-event no-op path FIRST.
  - Subscribing module: `hooks/dashboard-ui/src/lib/sse.ts` opens EventSource, applies reducer to store on each message, handles reconnect with exponential backoff + jitter (port from existing implementation in [`render.ts:441-520`](hooks/dashboard/render.ts:441-520)).

  **Must NOT do**:
  - Do NOT throw on unknown events.
  - Do NOT mutate state — return new objects (Zustand best practice).

  **References**:
  - Existing pure helpers: [`hooks/dashboard/sse-payload-from-event.ts`](hooks/dashboard/sse-payload-from-event.ts), [`hooks/dashboard/merge-by-agent-id.ts`](hooks/dashboard/merge-by-agent-id.ts) and their tests
  - Existing reconnection logic: [`hooks/dashboard/render.ts:441-520`](hooks/dashboard/render.ts)

  **Acceptance Criteria**:
  - [ ] Vitest green for every SSE event type.
  - [ ] Reducer is pure (no side effects, deep-frozen input → no mutation).
  - [ ] EventSource module reconnects with backoff per existing semantics.
  - [ ] `shutdown` event handled distinctly from `error`.

  **QA Scenarios**:
  - `cd hooks/dashboard-ui && bun run test src/lib/sse-reducer` exits 0.
  - Vitest cases cover each event type: `health`, `subagentStart`, `subagentStop`, `tool_call`, `error`, `conversation-snapshot`, `shutdown`, and an unknown `{type:'banana'}` event (no-op assertion).
  - Purity test: deep-freeze input state and event; reducer call does not throw; output `!==` input.
  - Manual (in-browser smoke during W2.x): kill the daemon while dashboard is open; observe SSE banner transitions to "reconnecting" with backoff; restart daemon; banner clears and live updates resume.

  **Commit**: `feat(dashboard-ui): pure SSE reducer + reconnect manager, TDD-covered`

---

- [ ] **W1.7 Typed daemon API client (TDD)**

  **What to do**:
  - Create `hooks/dashboard-ui/src/lib/api.ts` with one typed function per daemon endpoint:
    - `getHealth(conversationId?)`, `getSessions()`, `getSessionLog({limit, session?})`, `clearSessionLog({sessionId?, conversationId?})`, `getConfig()`, `getFullConfig()`, `saveConfig(draft)`, `getBackgroundTasks()`, `getAgentHistory({limit})`.
  - Each returns a discriminated `{ ok: true, data } | { ok: false, error }` result. No throw; let callers handle error states.
  - Resolve base URL from a runtime injected `window.OMC_DAEMON_PORT` (set by W2.1 shell script tag) — falls back to `27847`.
  - **TDD**: write Vitest with `vi.fn()` mocking `fetch`, asserting URL + method + body for each call. Cover ok / 4xx / 5xx / network-error paths.

  **Must NOT do**:
  - Do NOT throw on non-2xx — return `{ ok: false }`.
  - Do NOT bake the port in build-time; it must be runtime-injected so the same bundle runs against any port.

  **References**:
  - [`hooks/daemon.ts`](hooks/daemon.ts) routes (mapped earlier in research)
  - Audit P1-1 (error retry needs typed errors)

  **Acceptance Criteria**:
  - [ ] All 9 API functions have Vitest coverage.
  - [ ] No `throw` in any function; every error path returns `{ ok: false, error }`.
  - [ ] Build replaces no port string at build time (verified by grepping `dist/` for `27847`).

  **QA Scenarios**:
  - `cd hooks/dashboard-ui && bun run test src/lib/api` exits 0 with all 9 API functions covered.
  - Each function has at least 3 test cases: ok (200), error (4xx/5xx), network-failure (`vi.mocked(fetch).mockRejectedValue(...)`); all assert `{ok: false, error}` shape on non-success.
  - Build artifact check: `bun run build && rg -n '27847' dist/` returns no matches (port not baked in build).

  **Commit**: `feat(dashboard-ui): typed daemon API client, TDD-covered`

---

- [ ] **W1.8 shadcn install + theme tokens**

  **What to do**:
  - `bunx shadcn@4.6.0 add button card badge tabs scroll-area skeleton input separator tooltip sonner table dropdown-menu select dialog command sheet`.
  - Edit `hooks/dashboard-ui/src/index.css`:
    - Map `var(--vscode-*)` to shadcn semantic tokens. e.g.:
      ```css
      :root {
        --background: var(--vscode-editor-background, oklch(0.18 0.01 70));
        --foreground: var(--vscode-editor-foreground, oklch(0.85 0.01 70));
        --muted: var(--vscode-editorWidget-background, oklch(0.22 0.01 70));
        --border: var(--vscode-panel-border, oklch(0.30 0.01 70));
        --primary: var(--vscode-button-background, oklch(0.65 0.13 240));
        /* status colors via OKLCH */
        --status-ok: oklch(0.74 0.13 165);
        --status-warn: oklch(0.78 0.13 90);
        --status-error: oklch(0.65 0.18 25);
      }
      ```
    - No raw `#fff` / `#000`. All neutrals tinted (chroma 0.005–0.01).
    - Tailwind v4 `@theme` block with the same tokens.
  - Add `prefers-reduced-motion` global rule (placeholder; W3.1 expands).

  **Must NOT do**:
  - Do NOT use raw hex like `#4ec9b0` / `#f44747` anywhere.
  - Do NOT install components beyond the listed set (scope discipline).
  - Do NOT install icons individually — `lucide-react` is enough.

  **References**:
  - shadcn Tailwind v4 doc: https://ui.shadcn.com/docs/tailwind-v4
  - Impeccable design laws (color section in [`/home/andres/.agents/skills/impeccable/SKILL.md`](/home/andres/.agents/skills/impeccable/SKILL.md))

  **Acceptance Criteria**:
  - [ ] All listed shadcn components installed in `src/components/ui/`.
  - [ ] `index.css` defines all tokens via `var(--vscode-*)` with OKLCH fallbacks.
  - [ ] No `#fff` / `#000` / `#4ec9b0` / `#f44747` in the codebase (verified by `rg`).
  - [ ] Tailwind v4 `@theme` block matches CSS-var surface.

  **QA Scenarios**:
  - `ls hooks/dashboard-ui/src/components/ui/` shows every requested shadcn component file.
  - `rg -n '#fff|#000|#4ec9b0|#f44747' hooks/dashboard-ui/src/` returns zero matches.
  - `rg -n '#[0-9a-fA-F]{3,8}' hooks/dashboard-ui/src/index.css` matches only OKLCH function calls and CSS-var fallbacks; no raw greys/whites.
  - `cd hooks/dashboard-ui && bun run build` exits 0; output bundle size recorded for later comparison.

  **Commit**: `feat(dashboard-ui): shadcn components + VSCode token + OKLCH theme system`

---

### Wave 2 — All 7 tabs in parallel + App shell

- [ ] **W2.1 App shell**

  **What to do**:
  - `src/App.tsx` and `src/components/Shell.tsx`:
    - Header with title, header badge, conversation selector, dense-mode toggle (P2-8), keyboard-shortcuts hint button.
    - SSE banner (offline / reconnecting with countdown — P2-6).
    - Tablist with `role="tablist"`, `aria-label`, full keyboard navigation (Left/Right/Home/End — P0-1), `tabindex` rotation.
    - Tab buttons render with **count badges** for live state (e.g. "Agents (3 running)" — P1-5). Counts derived from store selectors.
    - **Persist `activeTab`** in store (P2-1).
    - **Keyboard shortcuts** registered globally (P2-9): `1`–`7` switch tabs, `/` focus event search (no-op when not on Events), `r` refresh current tab, `?` show shortcut sheet.
  - Mount each tab panel inside `<TabPanel>` with proper `aria-labelledby` and motion-aware fade-in.
  - Top-level error boundary (`react-error-boundary` or hand-rolled): catches render errors, shows recovery card with "Reload dashboard" button.

  **Must NOT do**:
  - Do NOT render the active tab's data in the shell — each tab owns its own data fetching.
  - Do NOT use raw `<a>` tags as buttons.

  **References**:
  - Audit P0-1, P1-5, P2-1, P2-6, P2-8, P2-9
  - Current shell: [`hooks/dashboard/render.ts:1561-1631`](hooks/dashboard/render.ts:1561-1631)

  **Acceptance Criteria**:
  - [ ] Keyboard: arrow keys cycle tabs, `1`-`7` jump to a tab, `?` opens shortcut sheet.
  - [ ] Tab labels show live counts when applicable.
  - [ ] Reload preserves last-selected tab.
  - [ ] Reduced-motion: no fade-in animation when `prefers-reduced-motion: reduce`.

  **QA Scenarios**:
  - Manual in MCP panel: press Tab, focus lands on the active tab. Press ArrowRight: focus + selection moves to next tab. ArrowLeft, Home, End behave correctly.
  - Press digits `1`–`7`: each switches to the matching tab.
  - Press `?`: shortcut sheet opens; Esc closes it.
  - Press `r` while on Status tab: forces a refetch (network panel shows new `/health` request).
  - Reload page: last-active tab is restored from localStorage.
  - DevTools: emulate `prefers-reduced-motion: reduce`; switch tabs; no fade-in animation observed.
  - `bun run test src/components/Shell` exits 0 with axe-core integration test green.

  **Commit**: `feat(dashboard-ui): App shell with arrow-key tabs, count badges, keyboard shortcuts, dense mode`

---

- [ ] **W2.2 Status tab**

  **What to do**:
  - `src/tabs/StatusTab.tsx`:
    - Replace 3-card stack with a single dense card showing health, dispatch counts, and recent errors with proper visual hierarchy (vary spacing per impeccable layout law).
    - **Sparklines** for dispatch counts (P2-4) — small inline SVG charts using a hand-rolled component (no chart lib dependency for ~50 LOC; or use `recharts` only if a future task justifies the bundle cost).
    - **Fix sseOn bug** (P0-4): derive connected indicator from `connection.sseStatus` selector, not local state.
    - **Health resync** (P1-7): subscribe to SSE status; when transitioning offline → connected, refetch `/health`.
    - Recent errors capped at 5 with "View all" link to Events tab pre-filtered to errors.

  **Must NOT do**:
  - Do NOT use the hero-metric template (big number + small label + supporting stats — banned).
  - Do NOT use raw color hex.

  **References**:
  - Audit P0-4, P1-7, P2-4
  - Current: [`hooks/dashboard/render.ts:614-685`](hooks/dashboard/render.ts:614-685)

  **Acceptance Criteria**:
  - [ ] Sparklines render for explore + worker dispatch counts.
  - [ ] Connected indicator stays accurate across SSE drop / reconnect.
  - [ ] Health refetched after reconnect.
  - [ ] "View all errors" link sets Events filter to "errors" and switches tab.

  **QA Scenarios**:
  - Open Status tab; sparkline SVGs render for explore + worker dispatch counts.
  - Stop daemon mid-session; banner shows offline; the connected indicator on the Status card matches (no stale "Connected ●").
  - Restart daemon; within 3s the connected indicator flips to active AND the displayed `uptime`/`toolCalls` values update (proves health resynced via fresh `/health` fetch, not just SSE).
  - Click "View all errors": the active tab switches to Events with the filter set to errors; reload preserves both.
  - `bun run test src/tabs/StatusTab` exits 0.

  **Commit**: `feat(dashboard-ui): Status tab with sparklines, sse-status fix, health resync`

---

- [ ] **W2.3 Hooks tab**

  **What to do**:
  - `src/tabs/HooksTab.tsx`: enabled / disabled hook columns rendered in a single 2-column shadcn `Card` layout.
  - Use `Skeleton` while loading.
  - Empty states with actionable copy: "No hooks enabled. Edit `hooks.json` to opt in." (with link if practical).

  **Must NOT do**:
  - Do NOT pad with cards if there are <5 hooks per column (just render a flat list).

  **References**:
  - Current: [`hooks/dashboard/render.ts:687-723`](hooks/dashboard/render.ts:687-723)

  **Acceptance Criteria**:
  - [ ] Two columns at >500px width, single column below.
  - [ ] Loading skeleton, error retry, empty states all polished.

  **QA Scenarios**:
  - At viewport ≥ 500px width, two columns visible; below 500px, single column.
  - Stop daemon, open Hooks tab: error state with Retry button visible; click Retry → fetch re-issued.
  - Disable all hooks in `hooks.json`, restart daemon: empty state shows "No hooks enabled. Edit `hooks.json` to opt in." (verified with copy match).
  - `bun run test src/tabs/HooksTab` exits 0; axe-core green.

  **Commit**: `feat(dashboard-ui): Hooks tab with shadcn Card layout`

---

- [ ] **W2.4 Background tab**

  **What to do**:
  - `src/tabs/BackgroundTab.tsx`:
    - **Active section** (running tasks) and **Recent section** (completed/failed last 10 minutes), visually separated.
    - **Auto-prune toggle** in header (P1-4 + P2-12): default ON, drops completed/failed entries older than 60s.
    - SSE-driven live updates via the reducer.

  **Must NOT do**:
  - Do NOT show a flat list of mixed active + completed without visual separation.

  **References**:
  - Audit P1-4, P2-12
  - Current: [`hooks/dashboard/render.ts:751-823`](hooks/dashboard/render.ts:751-823)

  **Acceptance Criteria**:
  - [ ] Active and Recent sections visually distinct.
  - [ ] Toggle persists in store.
  - [ ] Old completed entries auto-pruned after 60s when toggle is ON.

  **QA Scenarios**:
  - Open Background tab; verify Active and Recent sections have a visible separator and distinct headings.
  - Trigger a few subagents, let some complete; completed entries appear in Recent.
  - Toggle auto-prune off; wait 60+s; completed entries persist.
  - Toggle auto-prune on; wait 60+s; completed entries older than 60s removed.
  - Reload page: toggle state preserved (Zustand persist).
  - `bun run test src/tabs/BackgroundTab` exits 0; axe-core green.

  **Commit**: `feat(dashboard-ui): Background tab with active/recent split + auto-prune`

---

- [ ] **W2.5 Events tab**

  **What to do**:
  - `src/tabs/EventsTab.tsx`:
    - Toolbar: filter chips (All/Tools/Dispatches/Errors/Denies) + **text search input** (P2-2) + Auto-scroll toggle + Download / Copy JSON / Clear buttons.
    - **Filter persisted** in store (P2-5).
    - **Focusable rows** (P0-2): rendered as `<button>` elements with `aria-expanded`. Enter/Space toggles detail expansion.
    - **aria-live** region (P2-11): `aria-live="polite" aria-atomic="false"` on the events list so screen readers announce new events.
    - **Error retry** (P1-1): if initial fetch fails, show inline error + Retry button (no silent swallowing).
    - **Inline-confirm clear** (P1-3): no `confirm()`. First click on Clear shows "Confirm clear? [Cancel] [Clear]" inline; second click executes; toast with undo (5s) after clear.
    - Virtualization (`@tanstack/react-virtual` or hand-rolled) for >200 events to keep scroll smooth.

  **Must NOT do**:
  - Do NOT use `confirm()` or any native blocking dialog (banned).
  - Do NOT swallow errors silently.

  **References**:
  - Audit P0-2, P1-1, P1-3, P2-2, P2-5, P2-11
  - Current: [`hooks/dashboard/render.ts:826-1000`](hooks/dashboard/render.ts:826-1000)

  **Acceptance Criteria**:
  - [ ] Tab key reaches every event row; Enter/Space expands.
  - [ ] Search filters in real time across event type, tool name, agent type, message.
  - [ ] Filter selection persists across reloads.
  - [ ] Initial fetch failure shows error + Retry, not empty list.
  - [ ] Clear is a two-step inline confirm with undo toast.

  **QA Scenarios**:
  - Keyboard: Tab key reaches the search input → filter chips → first row → next row. Enter on a row expands; Escape collapses.
  - Search "tool": list filters to matching events as you type (debounced).
  - Switch to Status tab and back: filter selection preserved; reload also preserves it.
  - Stop daemon, then switch to Events: error state with Retry button visible (no empty list).
  - Click Clear: button changes to inline "Confirm clear?" + "Cancel"; click Cancel: list intact. Click again, click Confirm: list cleared, toast with Undo button visible. Click Undo within 5s: list restored.
  - DevTools accessibility tab: `aria-live="polite"` attribute on the events list container; new events announced when added.
  - `bun run test src/tabs/EventsTab` exits 0; axe-core green; no `confirm()` literal in compiled bundle (`rg -n 'confirm\\(' dist/` empty).

  **Commit**: `feat(dashboard-ui): Events tab with focusable rows, search, persist, aria-live, no confirm()`

---

- [ ] **W2.6 Sessions tab**

  **What to do**:
  - `src/tabs/SessionsTab.tsx`:
    - **Search input** (P2-7) — filters by session ID, conversation ID, tool count.
    - **Sort dropdown** (P2-7) — start time desc (default), tool count desc, error count desc.
    - **Focusable rows** (P0-2): `<button>` semantics, Enter/Space expands detail block.
    - Detail block uses `Tooltip` for technical fields like dispatch counts.

  **Must NOT do**:
  - Do NOT use a `<div onClick>` for the row.

  **References**:
  - Audit P0-2, P2-7
  - Current: [`hooks/dashboard/render.ts:1241-1379`](hooks/dashboard/render.ts:1241-1379)

  **Acceptance Criteria**:
  - [ ] Search filters as you type (debounced 150ms).
  - [ ] Sort persists in store.
  - [ ] Tab key reaches every row; Enter/Space expands.

  **QA Scenarios**:
  - Type a partial session ID into search; list filters live (debounced 150ms).
  - Change sort dropdown to "tool count desc": rows reorder.
  - Reload page: sort selection preserved.
  - Tab key reaches each row; Enter expands its detail block; Escape collapses.
  - DevTools: each row is a `<button>` (or has `tabindex="0"` + `role="button"`).
  - `bun run test src/tabs/SessionsTab` exits 0; axe-core green.

  **Commit**: `feat(dashboard-ui): Sessions tab with search, sort, focusable rows`

---

- [ ] **W2.7 Agents tab**

  **What to do**:
  - `src/tabs/AgentsTab.tsx`:
    - **Gantt waterfall visualization** (P2-3): for each agent, render a horizontal bar positioned by start time and width = duration. X-axis = time relative to the earliest agent start. Different colors (status tokens) for running/done/failed. Hover / focus shows tooltip with full agent metadata.
    - **History cap UX** (P1-8): show "Showing 20 most recent of N total" with N=count returned by `/agentHistory`.
    - Toggle: List view ↔ Gantt view (default Gantt).
    - Live updates via SSE (running bars extend in real time using `requestAnimationFrame`).

  **Must NOT do**:
  - Do NOT animate `width` directly each frame for >20 agents — batch updates.
  - Do NOT pull in a chart library; the Gantt is hand-rolled SVG.

  **References**:
  - Audit P1-8, P2-3
  - Current: [`hooks/dashboard/render.ts:1381-1574`](hooks/dashboard/render.ts:1381-1574)

  **Acceptance Criteria**:
  - [ ] Gantt renders with correct positions/durations for 20+ historical agents.
  - [ ] Running agents' bars extend live.
  - [ ] List view toggle works; both reachable via keyboard.
  - [ ] History cap label shows actual total count.

  **QA Scenarios**:
  - Open Agents tab: Gantt view is the default; bars positioned correctly relative to earliest agent start.
  - Hover or focus a bar: tooltip shows agent_id, agent_type, status, duration.
  - Toggle to List view: identical agents shown as flat rows; Tab key reaches each.
  - Trigger a long-running subagent (e.g. via `/explore`): bar's right edge extends in real time during the run.
  - History cap label visible and reflects total: "Showing 20 most recent of N total" where N matches the daemon's `/agentHistory` `count` field.
  - `bun run test src/tabs/AgentsTab` exits 0; axe-core green; Gantt has accessible alternative (table view reachable via toggle).

  **Commit**: `feat(dashboard-ui): Agents tab with Gantt waterfall + history cap UX`

---

- [ ] **W2.8 Config tab**

  **What to do**:
  - `src/tabs/ConfigTab.tsx`:
    - **Sidebar nav** (P2-10): left rail lists section names (Daemon, Hooks & Agents, Subagent Limits, …); right pane shows fields for the selected section. Replaces 11 identical card grid (banned).
    - **Diff before save** (P1-6): "Save" button opens a Sheet showing changed keys (old → new). User confirms in the sheet.
    - **Label association** (P0-6): every form input has an associated `<label htmlFor>` or wrapping `<label>` with the field name (not just "on"/"off").
    - **Human-readable Zod errors**: error banner maps `["daemon","port"]: must be between 1024 and 65535` to "Daemon port: must be between 1024 and 65535". Field-level errors highlight the offending input.
    - "Reset" reverts draft to loaded config.
    - Show config file path in a `<details>` after successful save, not as the toast text.

  **Must NOT do**:
  - Do NOT render 11 identical cards (banned).
  - Do NOT show raw Zod path arrays as user-facing copy.

  **References**:
  - Audit P0-6, P1-6, P2-10
  - Current: [`hooks/dashboard/render.ts:1098-1238`](hooks/dashboard/render.ts:1098-1238)

  **Acceptance Criteria**:
  - [ ] Sidebar navigation works keyboard-first (Up/Down to move, Enter to select).
  - [ ] Save button opens diff sheet; only confirmed save triggers POST.
  - [ ] Validation errors are field-level + human-readable.
  - [ ] Every input has a programmatic label association (verified by axe).

  **QA Scenarios**:
  - Sidebar: arrow Up/Down moves selection; Enter activates; right pane updates.
  - Edit a numeric field, click Save: a Sheet opens listing only the changed keys with old → new values; click Confirm: POST issued; toast confirms; reload shows persisted value.
  - Cancel in the diff sheet: no POST issued; field still shows the edited value (draft preserved); Reset reverts to loaded.
  - Enter an out-of-range port (e.g. 99999): field shows red border + human-readable error: "Daemon port: must be between 1024 and 65535". Banner does not show raw `["daemon","port"]`.
  - DevTools: every input has either an associated `<label htmlFor>` or is wrapped in `<label>`. axe-core reports zero label-association violations.
  - `bun run test src/tabs/ConfigTab` exits 0; axe-core green.

  **Commit**: `feat(dashboard-ui): Config tab with sidebar nav, save-diff, label association, friendly errors`

---

### Wave 3 — Cross-cutting polish + tests + docs

- [ ] **W3.1 prefers-reduced-motion + global a11y final pass**

  **What to do**:
  - Audit all motion in `index.css` and component-level animations. Wrap every animation/transition rule in:
    ```css
    @media (prefers-reduced-motion: reduce) { /* no-animation overrides */ }
    ```
  - Run `axe-core` (Vitest + `jest-axe`) against every tab; fix any remaining violations.
  - Confirm focus order is logical across all tabs.
  - Confirm all interactive elements have visible `:focus-visible` styles.

  **Must NOT do**:
  - Do NOT disable spinners entirely — slow them down (1 turn / 2s) instead.

  **References**:
  - Audit P0-5
  - Impeccable motion section

  **Acceptance Criteria**:
  - [ ] `axe-core` scan green on every tab in default state.
  - [ ] `prefers-reduced-motion: reduce` respected for tab-fade, spinner, banner-slide, Gantt entry.
  - [ ] Visible focus on every interactive element.

  **QA Scenarios**:
  - `cd hooks/dashboard-ui && bun run test` includes axe-core integration tests for every tab; all green.
  - DevTools emulates `prefers-reduced-motion: reduce`: switch tabs (no fade), open SSE banner (no slide), open spinner (slowed to 2s rotation, not stopped).
  - Tab through every interactive element across all 7 tabs: visible `:focus-visible` styles on each.
  - `rg -n '@media \\(prefers-reduced-motion: reduce\\)' hooks/dashboard-ui/src/` returns multiple matches (covering tab fade, banner slide, spinner, Gantt entry).

  **Commit**: `feat(dashboard-ui): prefers-reduced-motion + axe-core a11y polish`

---

- [ ] **W3.2 Copy fixes**

  **What to do**:
  - Replace all `'--'` null-display fallbacks with `'N/A'`, blank, or contextual ("uptime not yet measured").
  - Replace em-dash `' — '` separator on tool trail with `': '`.
  - Replace raw error strings (`"Failed: HTTP 502"`, `"Failed: TypeError"`) with: title (kind of failure) + actionable subtitle (what to do) + Retry button. Map known errors:
    - Network error → "Could not reach daemon. Is `oh-my-cursor start` running?"
    - HTTP 5xx → "Daemon returned <status>. Retry, or check daemon logs."
    - Parse error → "Daemon response was malformed. Retry; if it persists, check daemon version."
  - Replace ambiguous abbreviations in copy: "iter X / Y" → "iteration X of Y", "tools 0" / "err 0" → "0 tool calls" / "0 errors".
  - Run `rg -n -- '--' src/` and `rg -n -- ' — ' src/` after — should match only intended hyphens (e.g. CSS comments) or zero matches in user-facing copy.

  **Must NOT do**:
  - Do NOT introduce em-dashes anywhere.
  - Do NOT use cute / clever copy — direct and useful.

  **References**:
  - Audit P1-2, copy table

  **Acceptance Criteria**:
  - [ ] Zero `--` and zero em-dashes in user-facing copy across `src/`.
  - [ ] Every error state has actionable recovery guidance.
  - [ ] Abbreviations expanded.

  **QA Scenarios**:
  - `rg -n -- "'--'" hooks/dashboard-ui/src/` returns zero matches in JSX/TSX text nodes (matches in URLs/CLI strings are acceptable; reviewer must inspect).
  - `rg -n -F ' — ' hooks/dashboard-ui/src/` returns zero matches.
  - Stop daemon and walk through each tab: every error state shows actionable recovery copy + a Retry button (manually verified against the copy table in the plan).
  - Manually inspect the Status tab uptime when daemon is fresh: shows blank or "starting" rather than `--`.
  - `bun run build` exits 0 (sanity check after string changes).

  **Commit**: `fix(dashboard-ui): copy polish - kill --, em dash, raw errors`

---

- [ ] **W3.3 Migrate existing Bun integration tests**

  **What to do** (note: `hooks/mcp-app.test.ts` was already migrated in W1.4 alongside the source change; W3.3 covers the remaining two files):
  - Update [`hooks/integration.test.ts:333-342`](hooks/integration.test.ts:333-342) to assert:
    - `GET /dashboard` returns `200 text/html` + body contains the dashboard JS asset URL with the runtime port (no redirect; see W1.1).
    - `GET /dashboard/index.html` returns `200` with the same body as `GET /dashboard`.
    - `GET /dashboard/assets/dashboard.js` returns `200 application/javascript` when dist exists.
    - With dist removed: `GET /dashboard/assets/dashboard.js` returns `503` with helpful text. `GET /dashboard` still returns `200` (daemon-mode shell does not depend on dist).
  - Update [`hooks/mcp-sidecar.test.ts:78-108`](hooks/mcp-sidecar.test.ts:78-108): assert resource lists `text/html`; the awaited read returns the new shell shape (contains `<div id="app">` and the runtime port).
  - Confirm the daemon static-route tests added in W1.1 still pass after this task.

  **Must NOT do**:
  - Do NOT delete tests and replace with "TODO".
  - Do NOT regress the `hooks/dashboard/sse-payload-from-event.test.ts` and `merge-by-agent-id.test.ts` (they cover ported logic; leave them for now, optionally remove after Wave 3 if `hooks/dashboard/` is fully deleted).

  **References**:
  - Existing tests above

  **Acceptance Criteria**:
  - [ ] All Bun tests in `hooks/` pass.
  - [ ] Test count net-positive (W1.1 added daemon static route tests; only marker-string assertions removed).
  - [ ] No skipped or pending tests.

  **QA Scenarios**:
  - `cd hooks && bun test` exits 0; report shows test count ≥ pre-migration count.
  - Specific assertions verified by reading test files: `mcp-app.test.ts` (already migrated in W1.4) checks for `<div id="app">`, the dashboard JS asset URL, and port substitution; `integration.test.ts` covers 200 shell at both `/dashboard` and `/dashboard/index.html` + 200 shell when dist missing + 503 on `/dashboard/assets/dashboard.js` when dist missing + asset content-type; `mcp-sidecar.test.ts` covers MCP resource list + read with new shell shape.
  - `rg -n 'STATUS_HTML\\b' hooks/` returns zero matches (W1.4 already removed the export; this commit removes its last test consumers).
  - No `it.skip` / `test.skip` / `it.todo` in the migrated suites (`rg -n '\\.(skip|todo)\\(' hooks/*.test.ts`).

  **Commit**: `test(hooks): migrate dashboard integration tests to new contract`

---

- [ ] **W3.4 Documentation updates**

  **What to do**:
  - Update [`INSTALL.md`](INSTALL.md) — add a "Dashboard UI build" subsection: prerequisites (bun >=X.Y), what gets built, troubleshooting, `--skip-dashboard-build` flag.
  - Update [`README.md`](README.md) — mention the new dashboard surface (React + shadcn) and where to access it (`/status` command, MCP resource URI).
  - Update [`ARCHITECTURE.md`](ARCHITECTURE.md) — add the daemon static-asset serving section, the dashboard-ui project structure, and the data flow (MCP shell → daemon assets → daemon API + SSE).
  - Update [`docs/cursor/12-plugin-system.md`](docs/cursor/12-plugin-system.md) — the build-during-install section.
  - Add `hooks/dashboard-ui/README.md` — for contributors: dev workflow (`bun run dev`), test workflow, build modes (default vs singlefile), how the shell HTML works.
  - **Delete** the old [`hooks/dashboard/`](hooks/dashboard) directory (CSS-only test files for shared logic move into `hooks/dashboard-ui/src/lib/` if still relevant; otherwise remove).

  **Must NOT do**:
  - Do NOT remove [`hooks/dashboard/sse-payload-from-event.ts`](hooks/dashboard/sse-payload-from-event.ts) and [`merge-by-agent-id.ts`](hooks/dashboard/merge-by-agent-id.ts) without porting their logic into `dashboard-ui` — W1.6 already does this; verify the tests have a new home.

  **References**:
  - Existing docs above

  **Acceptance Criteria**:
  - [ ] All four docs updated.
  - [ ] `hooks/dashboard-ui/README.md` exists with contributor guide.
  - [ ] `hooks/dashboard/` directory removed (or only has logic files preserved with a note).
  - [ ] No broken doc references after delete.

  **QA Scenarios**:
  - `markdown-link-check INSTALL.md README.md ARCHITECTURE.md docs/cursor/12-plugin-system.md hooks/dashboard-ui/README.md` reports zero broken links.
  - `ls hooks/dashboard/` returns "No such file or directory" (or only contains preserved logic files explicitly noted in the task).
  - `rg -n 'hooks/dashboard/render\\.ts' .` returns no matches outside historical changelogs.
  - `rg -n 'esm\\.sh' .` returns no matches.
  - `cat hooks/dashboard-ui/README.md` lists dev workflow, test workflow, build modes, and shell HTML explanation (each as a section header).

  **Commit**: `docs(dashboard): document dashboard-ui build, serving, and contributor workflow`

---

### Final Verification Wave

- [ ] **F1 Plan Compliance Audit** (`oracle`)

  **Agent**: `Task(subagent_type="oracle")`
  **Prompt**:
  > Plan: `.cursor/plans/dashboard-react-rebuild.plan.md`. Audit completed work against every task's acceptance criteria AND QA scenarios. Read each modified file and verify the criterion is met. Flag any acceptance bullet or QA scenario that is unmet, partially met, or worked-around. Output: PASS / PARTIAL / FAIL per task with citations.

  **Acceptance**:
  - [ ] Oracle returns PASS for every task, OR FAIL items have a follow-up commit before F4.

  **QA Scenarios**:
  - Dispatch `Task(subagent_type="oracle")` with the prompt above; receive a structured per-task PASS/PARTIAL/FAIL report.
  - Save the report to `.cursor/plans/dashboard-react-rebuild.compliance.md`.
  - Any FAIL or PARTIAL gets a follow-up commit; the audit re-runs after each round of fixes.

---

- [ ] **F2 Code Quality Review**

  **What to do**: Read every new file in `hooks/dashboard-ui/src/` and review for:
  - AI-slop indicators (over-commenting, generic names, redundant abstractions, "// utility function" comments).
  - Type safety (any `any`? unsound assertions?).
  - Component size discipline (>300 lines per file is a smell — split).
  - Unused exports, dead code.

  **Acceptance**:
  - [ ] Slop check: no obvious AI patterns.
  - [ ] No `any` without justification comment.
  - [ ] No file >400 lines.

  **QA Scenarios**:
  - `find hooks/dashboard-ui/src -name '*.ts*' -exec wc -l {} + | awk '$1 > 400 {print}'` returns no rows.
  - `rg -n ': any\\b' hooks/dashboard-ui/src/` — every match has an inline `// any-justified:` comment on the same or previous line, OR is in a generated `.d.ts`.
  - `rg -n '// (utility|helper|imports|types) (function|module|section)' hooks/dashboard-ui/src/` returns no matches.
  - Manual: dispatch a `sisyphus-junior` review pass with the slop-check rule (`/home/andres/.cursor/plugins/local/oh-my-cursor/skills/ai-slop-remover/SKILL.md`) on a random sample of 5 files; report no issues.

---

- [ ] **F3 QA Scenario Execution**

  Run on a real Cursor instance with the plugin installed:

  **Mandatory scenarios**:
  1. Fresh install on Linux: dashboard loads, all 7 tabs render, SSE updates show live.
  2. Update install (existing dashboard running): user sees no broken state during the build window; dashboard reloads to new version.
  3. Cursor restart: persisted prefs (active tab, dense mode, filters) survive.
  4. Daemon offline: dashboard shows clear offline banner, retry succeeds when daemon comes back.
  5. SSE drop: reconnect countdown visible; health resyncs after reconnect.
  6. Keyboard-only navigation: every interactive element reachable; arrow keys cycle tabs; `1`–`7` jump.
  7. `prefers-reduced-motion` ON: no spinning / sliding animations.
  8. Config tab: edit a value, view diff, save, see the value persist after reload.
  9. Events: type in search, results filter; clear with two-step confirm; undo restores list.
  10. Agents: open Gantt view, hover/focus a bar, see tooltip; toggle to list and back.
  11. Windows VM smoke: install + dashboard load.

  **Acceptance**:
  - [ ] All 11 scenarios pass.

  **QA Scenarios**:
  - Each of the 11 numbered scenarios above is executed against a real Cursor instance with the plugin installed; pass/fail recorded in `.cursor/plans/dashboard-react-rebuild.qa-log.md`.
  - Linux + macOS + Windows VM each cover scenarios 1, 2, 4, 7 at minimum.
  - All 11 scenarios pass on at least one OS; any OS-specific failure is documented and fixed before F4.

---

- [ ] **F4 Scope Fidelity Check**

  **What to do**: Read this plan front-to-back, then verify against the working tree:
  - Every TODO marked done.
  - All 29 audit items from the source audit are addressed.
  - No scope creep beyond what's listed (no extra features added).
  - No regressions in tests outside this plan.

  **Acceptance**:
  - [ ] Audit item table appended to the plan with status (DONE / FOLLOWUP / WONTFIX) for all 29.
  - [ ] All Bun + Vitest tests green.
  - [ ] `git diff` shows only files this plan touches.

  **QA Scenarios**:
  - `git diff --name-only $(git merge-base HEAD main)..HEAD` produces a file list; manual review confirms every file maps to a task in this plan.
  - `cd hooks && bun test` exits 0; `cd hooks/dashboard-ui && bun run test` exits 0.
  - The Audit Item Tracking table at the bottom of this plan has every row marked DONE / FOLLOWUP / WONTFIX (no `pending`).
  - `rg -n 'TODO|FIXME' hooks/dashboard-ui/src/` returns only justified entries (none introduced by this plan unless tagged `// scope: <task-id>`).

---

## Success Criteria

- [ ] `hooks/dashboard-ui/` is a buildable Vite 8 + React 19 + shadcn + Zustand SPA.
- [ ] `bash install.sh` (and `install.ps1` on Windows) builds and copies the dashboard during install.
- [ ] Dashboard accessible via the MCP resource `ui://oh-my-cursor/dashboard` and the daemon `GET /dashboard`.
- [ ] All 29 audit findings (3 absolute-ban + 6 P0 + 8 P1 + 12 P2) implemented.
- [ ] `prefers-reduced-motion` honored throughout.
- [ ] Bun + Vitest test suites green.
- [ ] Old [`hooks/dashboard/render.ts`](hooks/dashboard/render.ts) (1643-line monolith) deleted.
- [ ] Documentation updated.
- [ ] Three-OS install validated (Linux, macOS, Windows).

---

## Audit Item Tracking (must be filled by F4)

| # | Severity | Item | Task | Status | Verification |
|---|----------|------|------|--------|--------------|
| AB-1 | absolute ban | Em dash + `--` in copy | W3.2 | DONE | `rg "'--'" hooks/dashboard-ui/src/` empty; `rg " — " hooks/dashboard-ui/src/` only matches a doc comment in `Shell.events-shortcut.test.tsx` (not user-facing copy). |
| AB-2 | absolute ban | Identical card grid in Config | W2.8 | DONE | `tabs/ConfigTab.tsx` + `tabs/config/ConfigSidebar.tsx`: sidebar `<nav role="tablist">` + section pane, no card grid. |
| AB-3 | absolute ban | `confirm()` for destructive Clear | W2.5 | DONE | `rg "confirm\("  hooks/dashboard-ui/src/` matches only doc-comment references; `EventsTab.tsx:134-166` implements two-step inline confirm + sonner Undo toast. |
| P0-1 | P0 a11y | Tablist arrow-key nav | W2.1 | DONE | `Shell.tsx:151-172` `handleTablistKeyDown`: ArrowLeft/ArrowRight/Home/End handled with focus rotation. |
| P0-2 | P0 a11y | Focusable Event/Session rows | W2.5, W2.6 | DONE | `EventsRow` rendered as `<button aria-expanded>` (`EventsTab.tsx:248-258`); `SessionsRow.tsx:143-178` `<button type="button" aria-expanded>`. |
| P0-3 | P0 bug | EventsTab silent fetch failure | W2.5 | DONE | `EventsTab.tsx:198-223` renders `events-error` + Retry button when `getSessionLog` fails; no silent swallow. |
| P0-4 | P0 bug | sseOn never resets | W2.2 | DONE | `StatusTab.tsx:34` derives `sseStatus` via `useSseStatus` selector (store only, no local state); `ConnectionBadge` renders from that value. |
| P0-5 | P0 a11y | prefers-reduced-motion | W3.1 | DONE | `index.css:129-149` global `@media (prefers-reduced-motion: reduce)` block collapses animations + transitions, with calmed spinner (2 s) + banner pulse (3 s). |
| P0-6 | P0 a11y | Config field label association | W2.8 | DONE | `tabs/config/ConfigSection.tsx` `FieldRow`: every input has `<label htmlFor={id}>`; checkbox path wraps in `<label>`. axe-core green. |
| P1-1 | P1 UX | Error retry buttons | W2.5 (and elsewhere) | DONE | Retry buttons present in EventsTab (`events-retry`), StatusTab, SessionsTab, AgentsTab, ConfigTab, HooksTab. All use `describeApiError()` + Retry click → re-fetch. |
| P1-2 | P1 UX | Copy fixes (`--`, em dash, raw errors) | W3.2 | DONE | `lib/api-error.ts:11-38` produces `{title, subtitle}` per error kind; abbreviations expanded ("0 tool calls", "iteration X of Y"). |
| P1-3 | P1 UX | Inline-confirm Clear (no `confirm()`) | W2.5 | DONE | `EventsTab.tsx:134-166` two-step inline confirm (`beginClear` → `confirmClear`) + 5 s sonner Undo toast (`UNDO_WINDOW_MS`). No `confirm()` call. |
| P1-4 | P1 UX | Background completed pruning | W2.4 | DONE | `BackgroundTab.tsx:101-117` `PRUNE_WINDOW_MS = 60_000` cutoff applied when `autoPrune` ON; 30 s ticker forces re-evaluation. |
| P1-5 | P1 UX | Tab count badges | W2.1 | DONE | `Shell.tsx:51-74` `useTabBadgeCounts` + `Shell.tsx:193-228` renders `<Badge>` (events/sessions count, background/agents running). |
| P1-6 | P1 UX | Config diff before save | W2.8 | DONE | `ConfigTab.tsx:352-391` Sheet with `DiffList`; only "Confirm save" in the sheet calls `handleConfirmSave` → POST. |
| P1-7 | P1 bug | Health resync after reconnect | W2.2 | DONE | `StatusTab.tsx:80-86` `lastStatusRef` watches offline → connected edge and triggers `void fetchHealth()`. |
| P1-8 | P1 UX | History cap UX indicator | W2.7 | DONE | `AgentsTab.tsx:174-178` `Showing ${shownCount} most recent of ${totalCount} total`; `total` derived from daemon `count` field. |
| P2-1 | P2 feature | Persist active tab | W1.5, W2.1 | DONE | `store/dashboard.ts:241-251` `partialize: { ui: serializeUi(state.ui) }` persists `activeTab` via `omc-dashboard-prefs-v1`. |
| P2-2 | P2 feature | Events text search | W2.5 | DONE | `EventsToolbar` Search input wired to `setEventsSearch`; `applySearch` filters across event type / tool / agent / message. |
| P2-3 | P2 feature | Agent Gantt waterfall | W2.7 | DONE | `tabs/AgentsGantt.tsx` hand-rolled SVG with `viewBox` + `preserveAspectRatio="none"`, focusable button overlays, status-token fills. |
| P2-4 | P2 feature | Dispatch sparklines | W2.2 | DONE | `StatusTab.tsx:44-53,146-151` 30-sample ring; `components/Sparkline.tsx` hand-rolled SVG (no chart lib). |
| P2-5 | P2 feature | Persist event filter | W1.5, W2.5 | DONE | `eventsFilter` lives in `ui` slice and is included in `serializeUi` (`store/dashboard.ts:140-146`); `EventsToolbar` writes via `setEventsFilter`. |
| P2-6 | P2 feature | SSE reconnect countdown | W2.1 | DONE | `components/SseBanner.tsx` 1 s ticker drives `Reconnecting in Xs (attempt N)…` countdown. |
| P2-7 | P2 feature | Sessions search/sort | W2.6 | DONE | `SessionsTab.tsx:127-167` Input (debounce 150 ms) + Select (`SORT_LABELS`); both persisted. |
| P2-8 | P2 feature | Dense mode toggle | W2.1 | DONE | `Shell.tsx:92-98` toggles body `dense` class; `ShellHeader.tsx:91-106` Sun/Moon button bound to `toggleDense`; persisted in `ui` slice. |
| P2-9 | P2 feature | Keyboard shortcuts | W2.1 | DONE | `components/ShellHotkeys.ts`: 1–7 → tab via `HOTKEY_TO_TAB`, `/` focuses events search via `omc-focus-events-search`, `r` dispatches `tab-refresh`, `?` opens shortcuts sheet. |
| P2-10 | P2 feature | Config sidebar nav | W2.8 | DONE | `tabs/config/ConfigSidebar.tsx` `<nav role="tablist">` with roving tabindex; `ConfigTab.tsx:202-235` Up/Down/Home/End/Enter handler. |
| P2-11 | P2 feature | aria-live on Events list | W2.5 | DONE | `EventsTab.tsx:225-232` list container has `role="log" aria-live="polite" aria-atomic="false"`. |
| P2-12 | P2 feature | Background completed toggle | W2.4 | DONE | `BackgroundTab.tsx:138-160` Auto-prune button (`aria-pressed={autoPrune}`); persisted via `setBackgroundAutoPrune` → `ui.backgroundAutoPrune`. |

---

## Commit Strategy

- One commit per W*.* task with the suggested message.
- Wave 0 commits land on a feature branch `feat/dashboard-react-rebuild`; later waves either continue on the branch or split into stacked branches at user discretion.
- Wave 3 includes the deletion of `hooks/dashboard/render.ts` (1643-line monolith) — bundled with W3.4 (docs / cleanup).
- Final verification commits stay on the same branch and gate the merge.
