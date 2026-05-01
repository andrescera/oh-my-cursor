# hooks/dashboard-ui

The dashboard UI is a Vite 8 + React 19 + Tailwind v4 + shadcn/ui + Zustand 5 SPA served by the oh-my-cursor daemon. The MCP sidecar resource `ui://oh-my-cursor/dashboard` and the daemon route `GET /dashboard` both return a thin shell HTML that boots the bundle from `GET /dashboard/assets/dashboard.js`. Build output lives in `dist/`; the daemon resolves it at `hooks/dashboard-ui/dist/` relative to itself.

## Dev workflow

```bash
cd hooks/dashboard-ui
bun install
bun run dev
```

`bun run dev` starts Vite on `http://localhost:5173` with HMR. The dev server uses the same base path (`/dashboard/`) as the production build. Set `OMC_DASHBOARD_BASE=/` to flatten the base when iterating outside the daemon. API and SSE calls target `window.OMC_DAEMON_PORT` (defaults to `27847`); export it from the dev console — `window.OMC_DAEMON_PORT = 27847` — or run a local daemon to receive real data.

## Test workflow

```bash
bun run test       # Vitest watch mode
bun run test:run   # one-shot, used in CI
```

Tests use `happy-dom` and the setup in `src/test-setup.ts`. Component tests live next to the file under test (`Foo.tsx` → `Foo.test.tsx`); store and lib tests live in `src/store/` and `src/lib/`. Shared SSE reducer tests in `src/lib/sse-reducer.test.ts` cover the logic ported from the legacy `hooks/dashboard/` monolith.

## Build modes (default vs singlefile)

```bash
bun run build              # default: separate JS/CSS under dist/assets/
bun run build:singlefile   # inlines all JS + CSS into dist/index.html
```

Default mode is what the daemon serves: `dist/assets/dashboard.js`, `dist/assets/dashboard.css`, plus chunked vendor files. The daemon shell (`hooks/mcp-app.ts`) injects `<link rel="stylesheet">` and a dynamic `import()` of the JS bundle.

Singlefile mode (`vite build --mode singlefile`) is used when the bundle has to ship as a single self-contained `index.html` — set `OMC_DASHBOARD_MODE=singlefile` and the MCP shell builder reads `dist/index.html` directly. Useful for offline distribution and the SPIKE workflow; not the default install path.

## Shell HTML

`hooks/mcp-app.ts::buildDaemonShell(port)` returns the small HTML document that the daemon and the MCP resource both serve at `/dashboard`. It (a) injects `window.OMC_DAEMON_PORT = <port>` so the bundle knows where to call `fetch` and `EventSource`, (b) `<link>`s to `/dashboard/assets/dashboard.css`, (c) dynamic-imports `/dashboard/assets/dashboard.js` and calls its exported `boot('#app')`. If the JS load fails, an inline error box renders inside `#app` instead of leaving a blank screen.

## Project layout

- `src/main.tsx` — entrypoint; mounts `<App />` into `#app`.
- `src/App.tsx` — top-level providers (tooltip, toaster, error boundary) wrapping `<Shell />`.
- `src/components/Shell.tsx` — tab bar, keyboard shortcuts, SSE banner.
- `src/components/ui/` — shadcn/ui primitives.
- `src/tabs/` — one file per dashboard tab; `registry.ts` is the single source of truth for tab order and hotkeys.
- `src/store/dashboard.ts` — Zustand store (UI slice + connection slice + data slice). Persisted slice is filtered in `dashboard.ts`.
- `src/store/selectors.ts` — memoised selectors used by tabs.
- `src/lib/api.ts` — typed REST client; contract documented in `src/lib/api.endpoints.md`.
- `src/lib/sse.ts` — EventSource adapter with exponential backoff + jitter.
- `src/lib/sse-reducer.ts` — pure reducer (ports `sse-payload-from-event` + `merge-by-agent-id`).
- `vite.config.ts` — base path, alias `@ → src`, asset naming, and the `singlefile` mode toggle.
- `index.html` — bare shell loaded only by `bun run dev`; the daemon shell is built in `hooks/mcp-app.ts`.
