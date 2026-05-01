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

_Filled in by W0.3._
