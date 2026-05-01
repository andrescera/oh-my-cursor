import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(HERE, "dashboard-ui", "dist")
const DIST_INDEX = join(DIST_DIR, "index.html")

type Mode = "daemon" | "singlefile"

const cache = new Map<string, Promise<string>>()

function resolveMode(): Mode {
  return process.env.OMC_DASHBOARD_MODE === "singlefile" ? "singlefile" : "daemon"
}

export function getNotBuiltHTML(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>oh-my-cursor Dashboard — not built</title></head>
<body style="font-family: system-ui; padding: 2rem; max-width: 40rem; margin: 0 auto;">
<h1>Dashboard not built</h1>
<p>The dashboard UI bundle is missing at <code>${DIST_DIR}</code>.</p>
<p>Run <code>bash install.sh</code> (or <code>install.ps1 -Scope project</code> on Windows) to build the dashboard, or invoke install with <code>--skip-dashboard-build</code> to acknowledge the absence.</p>
</body></html>`
}

function buildDaemonShell(port: number): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="http://localhost:${port}/dashboard/assets/dashboard.css" />
<title>oh-my-cursor Dashboard</title>
</head><body>
<div id="app"></div>
<script>window.OMC_DAEMON_PORT = ${port};</script>
<script type="module">
  import('http://localhost:${port}/dashboard/assets/dashboard.js')
    .then(m => m.boot('#app'))
    .catch(err => {
      const root = document.getElementById('app');
      if (!root) return;
      root.innerHTML = '<div style="padding:2rem;font-family:system-ui;max-width:40rem;margin:0 auto"><h1>Dashboard bundle failed to load</h1><p>The daemon is reachable but the JS bundle returned an error. Run <code>bash install.sh</code> (or <code>install.ps1</code>) to rebuild, or check the daemon logs.</p><pre style="white-space:pre-wrap;color:#c44">' + (err && err.message ? err.message : String(err)) + '</pre></div>';
    });
</script>
</body></html>`
}

async function buildSinglefile(port: number): Promise<string> {
  const file = Bun.file(DIST_INDEX)
  if (!(await file.exists())) return getNotBuiltHTML()
  const html = await file.text()
  const portTag = `<script>window.OMC_DAEMON_PORT = ${port};</script>`
  if (html.includes('<script type="module"')) {
    return html.replace('<script type="module"', `${portTag}\n<script type="module"`)
  }
  return html.replace("<body>", `<body>\n${portTag}`)
}

export function getStatusHTML(port: number = 27847): Promise<string> {
  const mode = resolveMode()
  const key = `${mode}:${port}`
  const cached = cache.get(key)
  if (cached) return cached
  const promise = mode === "singlefile" ? buildSinglefile(port) : Promise.resolve(buildDaemonShell(port))
  cache.set(key, promise)
  return promise
}

// Test-only: clear the in-memory shell cache. The underscore prefix marks
// this as not part of the public API; callers other than tests should not
// import it.
export function _resetCacheForTests(): void {
  cache.clear()
}

// Test-only: report current cache size for module-load purity assertions.
export function _cacheSizeForTests(): number {
  return cache.size
}
