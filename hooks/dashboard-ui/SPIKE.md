# Dashboard UI Toolchain & Serving Spike Log

This file records empirical results for the W0.2 (toolchain) and W0.3 (CSP serving) spikes.
It is a permanent artifact — do not delete after the spikes pass.

## W0.2 — Three-OS toolchain spike

### Default mode (`bunx --bun vite build`)

| OS | Timestamp (UTC) | `dist/assets/dashboard.js` raw / gzip | `dist/assets/dashboard.css` raw / gzip | `dist/index.html` raw / gzip | Build time |
|----|-----------------|---------------------------------------|----------------------------------------|------------------------------|------------|
| Linux 7.0.2-arch1-1, Bun 1.3.13 | 2026-05-01T17:26:12Z | 222660 / 69283 bytes | 20445 / 4360 bytes | 416 / 273 bytes | 576 ms |
| macOS | _pending user — run `bash hooks/dashboard-ui/scripts/build-smoke.sh` and paste output here_ | | | | |
| Windows VM (NOT WSL) | _pending user — run `pwsh hooks/dashboard-ui/scripts/build-smoke.ps1` and paste output here_ | | | | |

### Singlefile mode (`bunx --bun vite build --mode singlefile`)

| OS | Timestamp (UTC) | `dist/index.html` raw / gzip | Build time |
|----|-----------------|------------------------------|------------|
| Linux 7.0.2-arch1-1, Bun 1.3.13 | 2026-05-01T17:26:12Z | 321259 / 133307 bytes | 516 ms |
| macOS | _pending user_ | | |
| Windows VM | _pending user_ | | |

### Decision

- Default-mode gzipped JS is **67.66 KB** (69283 bytes). The plan's flip threshold is 500 KB gzipped.
- **Result**: under threshold → keep daemon-served default mode. Singlefile remains an opt-in fallback for hosts where CSP blocks daemon-served assets (decided by W0.3).
- macOS and Windows runs remain pending user execution — see `.cursor/notepads/dashboard-react-rebuild/issues.md`.

## W0.3 — CSP serving spike

### HTTP layer (curl, validated locally)

Validated by spinning up an isolated Bun server on port 27950 that mirrors the
spike-route response bytes from `hooks/daemon.ts` (the user's installed daemon
on port 27847 holds the canonical PID/port-coordination files — running the
working-tree daemon directly would SIGTERM that process via
`cleanupStaleProcess`, so an isolated server is used instead). Route logic,
headers, and template-literal port injection are byte-identical to the daemon
spike code (Linux, Bun 1.3.13, 2026-05-01T17:29:24Z UTC).

- `curl -is http://localhost:27950/dashboard-spike` → 200, body contains the
  dynamic-import shell with the daemon port template-injected:

  ```
  HTTP/1.1 200 OK
  Content-Type: text/html
  Date: Fri, 01 May 2026 17:29:24 GMT
  Content-Length: 393

  <!DOCTYPE html><html><head><meta charset="UTF-8"><title>CSP Spike</title></head><body>
  <p>Probing dynamic-import under Cursor MCP CSP...</p>
  <script type="module">
    import('http://localhost:27950/dashboard-spike/test.js')
      .then(m => document.body.innerText = 'CSP_OK:' + m.value)
      .catch(e => document.body.innerText = 'CSP_FAIL:' + (e?.message ?? String(e)));
  </script>
  </body></html>
  ```

- `curl -is http://localhost:27950/dashboard-spike/test.js` → 200,
  `Content-Type: application/javascript`, `Cache-Control: no-store`:

  ```
  HTTP/1.1 200 OK
  Content-Type: application/javascript
  Cache-Control: no-store
  Date: Fri, 01 May 2026 17:29:29 GMT
  Content-Length: 30

  export const value = 'hello';
  ```

### MCP CSP layer (pending user)

To validate dynamic-import under Cursor's MCP webview CSP, the user opens the temporary MCP resource `ui://oh-my-cursor/dashboard-spike` in Cursor's MCP panel and reports the result:

- `CSP_OK:hello` → primary mode is **daemon-served** (Strategy C). W1.4 builds the dynamic-import shell. Default config.
- `CSP_FAIL:<error>` → primary mode flips to **singlefile** (Strategy A). Set `OMC_DASHBOARD_MODE=singlefile`. W1.4 reads the inlined `dist/index.html` instead of constructing a shell.

The spike route (`/dashboard-spike`, `/dashboard-spike/test.js`) and MCP resource (`ui://oh-my-cursor/dashboard-spike`) are **removed** in the same commit that records this result. Future re-tests should reintroduce the scaffolding from this section:

1. In `hooks/daemon.ts`, add a `path === "/dashboard-spike"` branch returning the shell HTML above (template-literal interpolating `actualPort` — no `{PORT}` placeholder), and a `path === "/dashboard-spike/test.js"` branch returning `export const value = 'hello';\n` with `Content-Type: application/javascript` and `Cache-Control: no-store`.
2. Add `hooks/mcp/resources/dashboard-spike.ts` mirroring `hooks/mcp/resources/dashboard.ts`. The resource handler builds the same shell HTML using `getDaemonPort(loadConfig().daemon.port)` from `hooks/port-manager.ts`.
3. Register the new resource in `hooks/mcp/register.ts` alongside `registerDashboard`.

### Decision

Per user choice, **primary mode is Strategy C (daemon-served)**. Strategy A (singlefile) is baked into the same codebase as a fallback gated on `OMC_DASHBOARD_MODE=singlefile`. If the user reports `CSP_FAIL` after running the in-Cursor test, the fix is one env var change — no plan revision needed.
