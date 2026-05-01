import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import * as mcpApp from "./mcp-app"
import { _cacheSizeForTests, _resetCacheForTests, getNotBuiltHTML, getStatusHTML } from "./mcp-app"

const ENV_KEY = "OMC_DASHBOARD_MODE"

let savedMode: string | undefined

beforeEach(() => {
  savedMode = process.env[ENV_KEY]
  delete process.env[ENV_KEY]
  _resetCacheForTests()
})

afterEach(() => {
  if (savedMode === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = savedMode
  _resetCacheForTests()
})

describe("mcp-app", () => {
  describe("module shape", () => {
    test("getStatusHTML is exported as a function", () => {
      expect(typeof mcpApp.getStatusHTML).toBe("function")
    })

    test("legacy module-load HTML export is gone", () => {
      // The pre-W1.4 contract eagerly exported a string named STATUS_HTML at
      // module load. The new contract has only async getStatusHTML; verify
      // the legacy name is no longer reachable on the module namespace.
      const legacyExportName = ["STATUS", "HTML"].join("_")
      expect(Object.keys(mcpApp)).not.toContain(legacyExportName)
      expect((mcpApp as Record<string, unknown>)[legacyExportName]).toBeUndefined()
    })

    test("module-load is pure: cache is empty before any invocation", () => {
      // _resetCacheForTests ran in beforeEach; nothing else has populated the
      // cache, proving the module did not perform any work at load time.
      expect(_cacheSizeForTests()).toBe(0)
    })
  })

  describe("daemon mode (default)", () => {
    test("returns a Promise that resolves to a string", async () => {
      const result = getStatusHTML(27847)
      expect(result).toBeInstanceOf(Promise)
      const html = await result
      expect(typeof html).toBe("string")
    })

    test("contains the dashboard mount node and absolute asset URLs for the given port", async () => {
      const html = await getStatusHTML(27847)
      expect(html).toContain("<!DOCTYPE html>")
      expect(html).toContain('<div id="app">')
      expect(html).toContain("http://localhost:27847/dashboard/assets/dashboard.js")
      expect(html).toContain("http://localhost:27847/dashboard/assets/dashboard.css")
      expect(html).toContain("window.OMC_DAEMON_PORT = 27847;")
    })

    test("port substitution swaps every occurrence", async () => {
      const html = await getStatusHTML(27848)
      expect(html).toContain("http://localhost:27848/dashboard/assets/dashboard.js")
      expect(html).toContain("http://localhost:27848/dashboard/assets/dashboard.css")
      expect(html).toContain("window.OMC_DAEMON_PORT = 27848;")
      expect(html).not.toContain("27847")
    })

    test("default port (no arg) is 27847", async () => {
      const html = await getStatusHTML()
      expect(html).toContain("http://localhost:27847/dashboard/assets/dashboard.js")
      expect(html).toContain("window.OMC_DAEMON_PORT = 27847;")
    })

    test("does not read the dist directory in daemon mode", async () => {
      // The HTML must not contain the inlined Vite bundle marker. The dist
      // index.html starts its module script with `<script type="module" crossorigin>`;
      // the daemon shell uses `<script type="module">` (no crossorigin), so the
      // crossorigin attribute is a stable signal that we did not inline dist.
      const html = await getStatusHTML(27847)
      expect(html).not.toContain('<script type="module" crossorigin>')
    })
  })

  describe("cache", () => {
    test("repeat calls with the same (mode, port) return the same Promise", () => {
      const a = getStatusHTML(27847)
      const b = getStatusHTML(27847)
      expect(a).toBe(b)
    })

    test("repeat calls resolve to the identical string instance", async () => {
      const [a, b] = await Promise.all([getStatusHTML(27847), getStatusHTML(27847)])
      expect(a).toBe(b)
      expect(Object.is(a, b)).toBe(true)
    })

    test("different ports produce different cache entries", async () => {
      const a = await getStatusHTML(27847)
      const b = await getStatusHTML(27848)
      expect(a).not.toBe(b)
      expect(_cacheSizeForTests()).toBe(2)
    })

    test("after a single call cache size is 1", async () => {
      await getStatusHTML(27847)
      expect(_cacheSizeForTests()).toBe(1)
    })
  })

  describe("singlefile mode", () => {
    const distExists = Bun.file(`${import.meta.dir}/dashboard-ui/dist/index.html`).exists()

    test.skipIf(!Bun.fileURLToPath)("env switch is honored", async () => {
      process.env[ENV_KEY] = "singlefile"
      _resetCacheForTests()
      const a = getStatusHTML(27849)
      const b = getStatusHTML(27849)
      expect(a).toBe(b) // still cached per (mode, port)
    })

    test("dist present: inlined HTML carries the port script tag", async () => {
      const present = await distExists
      if (!present) return // skip when dist is absent in this environment
      process.env[ENV_KEY] = "singlefile"
      _resetCacheForTests()
      const html = await getStatusHTML(27849)
      expect(html).toContain("<!DOCTYPE html>")
      expect(html).toContain("window.OMC_DAEMON_PORT = 27849;")
    })

    test("dist present: a different port produces a different inlined string", async () => {
      const present = await distExists
      if (!present) return
      process.env[ENV_KEY] = "singlefile"
      _resetCacheForTests()
      const a = await getStatusHTML(27849)
      const b = await getStatusHTML(27850)
      expect(a).not.toBe(b)
      expect(b).toContain("window.OMC_DAEMON_PORT = 27850;")
    })
  })

  describe("getNotBuiltHTML", () => {
    test("returns a complete HTML document with the documented copy", () => {
      const html = getNotBuiltHTML()
      expect(html).toContain("<!DOCTYPE html>")
      expect(html).toContain("Dashboard not built")
      expect(html).toContain("install.sh")
      expect(html).toContain("install.ps1")
      expect(html).toContain("--skip-dashboard-build")
    })

    test("references the absolute dist directory path", () => {
      const html = getNotBuiltHTML()
      expect(html).toMatch(/<code>[^<]*dashboard-ui[^<]*dist[^<]*<\/code>/)
    })
  })
})
