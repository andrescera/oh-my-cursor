import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync, rmSync, existsSync, renameSync, readFileSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import { DEFAULT_CONFIG } from "./config"
import type { Server } from "bun"

const PORT = 47900
let server: ReturnType<typeof import("bun")["serve"]> | null = null
const BASE = `http://localhost:${PORT}`

const AGENTS_TEST_DIR = join(tmpdir(), "oh-my-cursor-test-agents")
const AGENTS_TEST_FILE = join(AGENTS_TEST_DIR, "dummy.txt")
const AGENTS_MD_PATH = join(AGENTS_TEST_DIR, "AGENTS.md")

async function post(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function rawGet(rawPath: string): Promise<{ status: number; headers: Map<string, string>; body: string }> {
  return await new Promise((resolveResponse, reject) => {
    let buffer = ""
    const decoder = new TextDecoder()
    const timeout = setTimeout(() => {
      try { socket?.end() } catch {}
      reject(new Error(`rawGet timed out for ${rawPath}`))
    }, 4000)
    let socket: Awaited<ReturnType<typeof Bun.connect>> | null = null
    Bun.connect({
      hostname: "127.0.0.1",
      port: PORT,
      socket: {
        open(s) {
          socket = s
          s.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`)
        },
        data(_s, data) {
          buffer += decoder.decode(data, { stream: true })
        },
        close() {
          clearTimeout(timeout)
          buffer += decoder.decode()
          const headerEnd = buffer.indexOf("\r\n\r\n")
          if (headerEnd === -1) {
            reject(new Error(`Malformed response for ${rawPath}: ${buffer.slice(0, 200)}`))
            return
          }
          const head = buffer.slice(0, headerEnd)
          const body = buffer.slice(headerEnd + 4)
          const lines = head.split("\r\n")
          const statusLine = lines[0] ?? ""
          const statusMatch = /^HTTP\/1\.[01]\s+(\d{3})/.exec(statusLine)
          const status = statusMatch ? parseInt(statusMatch[1] ?? "0", 10) : 0
          const headers = new Map<string, string>()
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i] ?? ""
            const colon = line.indexOf(":")
            if (colon > 0) {
              headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
            }
          }
          resolveResponse({ status, headers, body })
        },
        error(_s, err) {
          clearTimeout(timeout)
          reject(err)
        },
      },
    }).catch((err) => { clearTimeout(timeout); reject(err) })
  })
}

beforeAll(async () => {
  mkdirSync(AGENTS_TEST_DIR, { recursive: true })
  writeFileSync(AGENTS_TEST_FILE, "test file", "utf-8")
  writeFileSync(AGENTS_MD_PATH, "# Test AGENTS\nThis directory has test rules.", "utf-8")

  try {
    rmSync(DEFAULT_CONFIG.state_persistence.path, { recursive: true, force: true })
  } catch {}

  process.env.OH_MY_CURSOR_PORT = String(PORT)
  await import("./daemon.ts")
  await Bun.sleep(500)
})

afterAll(() => {
  try { unlinkSync(AGENTS_TEST_FILE) } catch {}
  try { unlinkSync(AGENTS_MD_PATH) } catch {}
  try { rmdirSync(AGENTS_TEST_DIR) } catch {}
})

async function waitForPort(port: number, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const sock = await Bun.connect({
        hostname: "127.0.0.1",
        port,
        socket: { data() {}, open(s) { s.end() }, close() {}, error() {} },
      })
      sock.end()
      return true
    } catch {
      await Bun.sleep(50)
    }
  }
  return false
}

// Placed before the main suite because the main suite's /shutdown tests trigger process.exit(0),
// which would kill the runner before this block could execute if placed after.
describe("daemon hard-claim port", () => {
  test(
    "hard-claim: same-uid squatter on DEFAULT_PORT 27847 is evicted or daemon fails cleanly",
    async () => {
      const PID_FILE = "/tmp/oh-my-cursor-daemon.pid"
      const PORT_FILE = "/tmp/oh-my-cursor-daemon.port"

      // Back up any live daemon files so we don't clobber a real running daemon
      const backups: Array<[string, string]> = []
      for (const f of [PID_FILE, PORT_FILE]) {
        if (existsSync(f)) {
          const bak = f + ".test-bak"
          renameSync(f, bak)
          backups.push([f, bak])
        }
      }

      // Occupy port 27847 with a same-uid squatter process
      const squatter = Bun.spawn(
        [
          "bun",
          "-e",
          `Bun.serve({ port: 27847, hostname: "127.0.0.1", fetch: () => new Response("sq") })\nawait new Promise(r => setTimeout(r, 30000))`,
        ],
        { stdout: "pipe", stderr: "pipe" },
      )

      // Give the squatter time to bind. Polling with fetch would leave an open socket that
      // lsof -ti :27847 sees, causing killPortSquatter to SIGTERM the test runner itself.
      const squatterReady = await waitForPort(27847, 3000)
      if (!squatterReady) console.warn("[daemon hard-claim test] squatter did not bind in time; continuing anyway")

      let daemon: ReturnType<typeof Bun.spawn> | null = null
      try {
        // Strip OH_MY_CURSOR_PORT so daemon.ts falls through to DEFAULT_PORT (27847)
        const { OH_MY_CURSOR_PORT: _omit, ...envWithoutPort } = process.env
        daemon = Bun.spawn(["bun", "run", "hooks/daemon.ts"], {
          cwd: resolve(import.meta.dir, ".."),
          stdout: "pipe",
          stderr: "pipe",
          env: envWithoutPort,
        })

        const result = await Promise.race([
          daemon.exited.then((code) => ({ kind: "exited" as const, code })),
          new Promise<{ kind: "running" }>((r) => setTimeout(() => r({ kind: "running" }), 4000)),
        ])

        if (result.kind === "exited") {
          // Daemon detected a foreign-uid process or failed to bind after killing same-uid squatter
          expect(result.code).not.toBe(0)
          const stderr = await new Response(daemon.stderr).text()
          expect(stderr).toContain("27847")
          daemon = null
        } else {
          // Same-uid squatter was killed by killPortSquatter; daemon took over - also valid Wave 2 behaviour
          const health = await fetch("http://127.0.0.1:27847/health")
            .then((r) => r.status)
            .catch(() => -1)
          expect([200, -1]).toContain(health)
          daemon.kill()
          await daemon.exited
          daemon = null
        }
      } finally {
        if (daemon) {
          try {
            daemon.kill()
          } catch {}
          try {
            await daemon.exited
          } catch {}
        }
        try {
          squatter.kill()
        } catch {}
        try {
          await squatter.exited
        } catch {}

        // Remove any pid/port files written by the test daemon (they have no backup entry)
        for (const f of [PID_FILE, PORT_FILE]) {
          if (existsSync(f) && !backups.some(([orig]) => orig === f)) {
            try {
              const s = readFileSync(f, "utf-8")
              if (s.length < 20) unlinkSync(f)
            } catch {}
          }
        }

        // Restore backed-up live daemon files
        for (const [orig, bak] of backups) {
          try {
            if (existsSync(bak)) renameSync(bak, orig)
          } catch {}
        }
      }
    },
    15000,
  )
})

describe("hook daemon", () => {
  describe("/health", () => {
    test("returns ok status", async () => {
      const res = await fetch(`${BASE}/health`)
      const data = await res.json()
      expect(data.status).toBe("ok")
      expect(typeof data.uptime).toBe("number")
      expect(typeof data.continuationLoopsActive).toBe("number")
      expect(typeof data.fallbackConversationsCreatedSinceBoot).toBe("number")
    })

    test("fallbackConversationsCreatedSinceBoot increments for each hook without session_id or conversation_id", async () => {
      const healthJson = async () => (await fetch(`${BASE}/health`)).json() as { fallbackConversationsCreatedSinceBoot: number }
      const before = (await healthJson()).fallbackConversationsCreatedSinceBoot
      await post("/afterShellExecution", { exit_code: 0 })
      const afterFirst = (await healthJson()).fallbackConversationsCreatedSinceBoot
      expect(afterFirst).toBe(before + 1)
      await post("/afterShellExecution", { exit_code: 0 })
      const afterSecond = (await healthJson()).fallbackConversationsCreatedSinceBoot
      expect(afterSecond).toBe(before + 2)
    })
  })

  describe("/dashboard and /dashboard/assets", () => {
    const HOOKS_DIR = dirname(fileURLToPath(import.meta.url))
    const DIST_ASSETS = join(HOOKS_DIR, "dashboard-ui", "dist", "assets")
    const DASHBOARD_JS = join(DIST_ASSETS, "dashboard.js")

    test("GET /dashboard returns 200 + text/html + Cache-Control: no-store + dynamic-shell body with runtime port", async () => {
      const res = await fetch(`${BASE}/dashboard`)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type") ?? "").toContain("text/html")
      expect(res.headers.get("cache-control")).toBe("no-store")
      const html = await res.text()
      expect(html).toContain(`http://localhost:${PORT}/dashboard/assets/dashboard.js`)
      expect(html).toContain(`http://localhost:${PORT}/dashboard/assets/dashboard.css`)
      expect(html).toContain(`window.OMC_DAEMON_PORT = ${PORT}`)
    })

    test("GET /dashboard/index.html is a same-handler alias (byte-equal body, no redirect)", async () => {
      const a = await fetch(`${BASE}/dashboard`, { redirect: "manual" })
      const b = await fetch(`${BASE}/dashboard/index.html`, { redirect: "manual" })
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)
      expect(b.headers.get("cache-control")).toBe("no-store")
      expect(b.headers.get("content-type") ?? "").toContain("text/html")
      const ta = await a.text()
      const tb = await b.text()
      expect(tb).toBe(ta)
    })

    test("GET /dashboard/assets/dashboard.js returns 200 with proper headers + weak ETag based on mtime+size", async () => {
      if (!existsSync(DASHBOARD_JS)) {
        throw new Error(`Test prerequisite missing: ${DASHBOARD_JS}. Run hooks/dashboard-ui build.`)
      }
      const res = await fetch(`${BASE}/dashboard/assets/dashboard.js`)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type") ?? "").toContain("application/javascript")
      expect(res.headers.get("cache-control")).toBe("public, max-age=60, must-revalidate")
      const etag = res.headers.get("etag") ?? ""
      expect(etag).toMatch(/^W\/".+-.+"$/)
      const file = Bun.file(DASHBOARD_JS)
      const expected = `W/"${file.size.toString(16)}-${file.lastModified.toString(16)}"`
      expect(etag).toBe(expected)
    })

    test("GET /dashboard/assets/dashboard.css returns 200 with text/css content-type", async () => {
      const res = await fetch(`${BASE}/dashboard/assets/dashboard.css`)
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type") ?? "").toContain("text/css")
      expect(res.headers.get("cache-control")).toBe("public, max-age=60, must-revalidate")
      expect(res.headers.get("etag")).toBeTruthy()
    })

    test("GET /dashboard/assets/dashboard.js with matching If-None-Match returns 304 + no body", async () => {
      const first = await fetch(`${BASE}/dashboard/assets/dashboard.js`)
      const etag = first.headers.get("etag") ?? ""
      expect(etag.length).toBeGreaterThan(0)
      const second = await fetch(`${BASE}/dashboard/assets/dashboard.js`, {
        headers: { "If-None-Match": etag },
      })
      expect(second.status).toBe(304)
      const body = await second.text()
      expect(body).toBe("")
    })

    test("GET /dashboard/assets/<missing> returns 503 with helpful body", async () => {
      const res = await fetch(`${BASE}/dashboard/assets/this-file-does-not-exist-${randomUUID()}.js`)
      expect(res.status).toBe(503)
      expect(res.headers.get("content-type") ?? "").toContain("text/html")
      const body = await res.text()
      expect(body).toContain("Dashboard assets not built")
      expect(body).toContain("install.sh")
    })

    test("GET /dashboard/assets with encoded-slash traversal '..%2F' returns 400 (handler-level guard)", async () => {
      const res = await rawGet("/dashboard/assets/%2E%2E%2Fdaemon.ts")
      expect(res.status).toBe(400)
      expect(res.body).not.toContain("gracefulShutdown")
      expect(res.body).not.toContain("OH_MY_CURSOR_PORT")
    })

    test("GET /dashboard/assets/../daemon.ts never leaks daemon source (URL-normalized to non-asset path; 4xx)", async () => {
      // Bun's server-side URL parser normalizes literal '..' segments away
      // before the handler runs, so this request lands on a non-asset path
      // (404) rather than triggering our 400 guard. Either way the daemon
      // source must NEVER be returned. Defense in depth: we additionally
      // verify the handler-level guard via the encoded-slash test above.
      const res = await rawGet("/dashboard/assets/../daemon.ts")
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
      expect(res.body).not.toContain("gracefulShutdown")
      expect(res.body).not.toContain("OH_MY_CURSOR_PORT")
      expect(res.body).not.toContain("DASHBOARD_ASSETS_NOT_BUILT_BODY")
    })

    test("GET /dashboard/assets/ (empty filename) returns 400", async () => {
      const res = await rawGet("/dashboard/assets/")
      expect(res.status).toBe(400)
    })
  })

  describe("CORS headers for dashboard REST API", () => {
    test("GET /session-log includes CORS headers for MCP webview fetches", async () => {
      const res = await fetch(`${BASE}/session-log?limit=1`)
      expect(res.status).toBe(200)
      expect(res.headers.get("access-control-allow-origin")).toBe("*")
      expect(res.headers.get("access-control-allow-methods")).toContain("GET")
      expect(res.headers.get("access-control-allow-methods")).toContain("POST")
    })

    test("GET /health includes CORS headers for MCP webview fetches", async () => {
      const res = await fetch(`${BASE}/health`)
      expect(res.status).toBe(200)
      expect(res.headers.get("access-control-allow-origin")).toBe("*")
    })

    test("OPTIONS preflight returns 204 with CORS headers", async () => {
      const res = await fetch(`${BASE}/session-log`, {
        method: "OPTIONS",
        headers: { "Access-Control-Request-Method": "GET" },
      })
      expect(res.status).toBe(204)
      expect(res.headers.get("access-control-allow-origin")).toBe("*")
      expect(res.headers.get("access-control-allow-headers")).toContain("Content-Type")
    })
  })

  describe("/sessionStart", () => {
    test("returns hookSpecificOutput with context (Claude Code format)", async () => {
      const result = await post("/sessionStart", {
        session_id: "sess-1",
        cwd: "/project",
        model: "claude-4.6-sonnet-medium",
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("oh-my-cursor Context")
      expect(result.hookSpecificOutput.additionalContext).toContain("sess-1")
      expect(result.hookSpecificOutput.hookEventName).toBe("SessionStart")
      expect(result.additional_context).toContain("oh-my-cursor Context")
    })

    test("accepts Cursor-native conversation_id + workspace_roots", async () => {
      const result = await post("/sessionStart", {
        conversation_id: "conv-cursor-1",
        workspace_roots: ["/workspace/project"],
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("conv-cursor-1")
      expect(result.hookSpecificOutput.additionalContext).toContain("/workspace/project")
      expect(result.additional_context).toContain("conv-cursor-1")
      expect(result.additional_context).toContain("/workspace/project")
    })

    test("prefers conversation_id over session_id", async () => {
      const result = await post("/sessionStart", {
        conversation_id: "conv-preferred",
        session_id: "sess-fallback",
        cwd: "/project",
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("conv-preferred")
      expect(result.hookSpecificOutput.additionalContext).not.toContain("sess-fallback")
    })
  })

  describe("/sessionEnd", () => {
    test("cleans up session (Claude Code format)", async () => {
      await post("/sessionStart", { session_id: "sess-cleanup" })
      const health1 = await (await fetch(`${BASE}/health`)).json()
      const before = health1.conversations

      await post("/sessionEnd", { session_id: "sess-cleanup" })
      const health2 = await (await fetch(`${BASE}/health`)).json()
      expect(health2.conversations).toBe(before - 1)
    })

    test("cleans up session with Cursor-native conversation_id + workspace_roots", async () => {
      await post("/sessionStart", { conversation_id: "conv-cleanup" })
      const health1 = await (await fetch(`${BASE}/health`)).json()
      const before = health1.conversations

      await post("/sessionEnd", { conversation_id: "conv-cleanup", workspace_roots: ["/project"] })
      const health2 = await (await fetch(`${BASE}/health`)).json()
      expect(health2.conversations).toBe(before - 1)
    })
  })

  describe("/beforeShellExecution", () => {
    test("blocks dangerous commands (Claude Code format)", async () => {
      const result = await post("/beforeShellExecution", {
        tool_input: { command: "rm -rf /" },
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
      expect(result.hookSpecificOutput.permissionDecisionReason).toContain("blocked for safety")
      expect(result.permission).toBe("deny")
      expect(result.continue).toBe(false)
      expect(result.userMessage).toContain("blocked for safety")
    })

    test("blocks dangerous commands (Cursor-native format with top-level command)", async () => {
      const result = await post("/beforeShellExecution", {
        command: "rm -rf /",
        conversation_id: "conv-shell-1",
        workspace_roots: ["/project"],
      })
      expect(result.permission).toBe("deny")
      expect(result.continue).toBe(false)
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
    })

    test("allows safe commands", async () => {
      const result = await post("/beforeShellExecution", {
        tool_input: { command: "ls -la" },
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
    })

    test("allows safe commands (Cursor-native format)", async () => {
      const result = await post("/beforeShellExecution", {
        command: "ls -la",
        conversation_id: "conv-shell-2",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
      expect(result.permission).toBeUndefined()
    })
  })

  describe("/beforeReadFile", () => {
    test("blocks sensitive files (top-level file_path)", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/.env.production",
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
      expect(result.permission).toBe("deny")
      expect(result.continue).toBe(false)
      expect(result.userMessage).toContain("blocked")
    })

    test("blocks sensitive files (tool_input.file_path)", async () => {
      const result = await post("/beforeReadFile", {
        tool_input: { file_path: "/app/credentials.json" },
        conversation_id: "conv-read-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
      expect(result.permission).toBe("deny")
    })

    test("allows normal files", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/src/index.ts",
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
      expect(result.permission).toBeUndefined()
    })
  })

  describe("/preToolUse", () => {
    test("allows tool use and tracks count", async () => {
      const result = await post("/preToolUse", {
        tool_name: "Shell",
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("/subagentStart", () => {
    test("allows subagent within limits (agent_type)", async () => {
      await post("/sessionStart", { session_id: "sess-limits" })
      const result = await post("/subagentStart", {
        agent_type: "Explore",
        session_id: "sess-limits",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("allows subagent within limits (subagent_type / Cursor format)", async () => {
      await post("/sessionStart", { conversation_id: "conv-limits" })
      const result = await post("/subagentStart", {
        subagent_type: "Explore",
        conversation_id: "conv-limits",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("returns empty (limits enforced in preToolUse)", async () => {
      await post("/sessionStart", { session_id: "sess-limits-2" })
      const result = await post("/subagentStart", {
        agent_type: "Explore",
        session_id: "sess-limits-2",
      })
      expect(Object.keys(result).length).toBe(0)
    })

  })

  describe("/subagentStop", () => {
    test("returns empty object (agent_type)", async () => {
      const result = await post("/subagentStop", {
        agent_type: "Explore",
        stop_hook_active: false,
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("returns empty object (subagent_type / Cursor format)", async () => {
      const result = await post("/subagentStop", {
        subagent_type: "Explore",
        status: "completed",
        conversation_id: "conv-stop-1",
        output: "a".repeat(50),
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("returns empty when stop_hook_active is true", async () => {
      const result = await post("/subagentStop", {
        agent_type: "Explore",
        stop_hook_active: true,
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("accepts loop_count and status fields", async () => {
      const result = await post("/subagentStop", {
        subagent_type: "general-purpose",
        status: "completed",
        loop_count: 3,
        conversation_id: "conv-stop-2",
        output: "a".repeat(50),
      })
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("/postToolUse", () => {
    test("tracks tool calls and returns context periodically", async () => {
      await post("/sessionStart", { session_id: "sess-context" })
      for (let i = 0; i < 10; i++) {
        await post("/postToolUse", {
          tool_name: "Shell",
          session_id: "sess-context",
        })
      }
      const result = await post("/postToolUse", {
        tool_name: "Shell",
        session_id: "sess-context",
      })
      expect(result).toBeDefined()
    })

    describe("#given a Read tool for a file in a directory with AGENTS.md", () => {
      describe("#when the handler is called", () => {
        test("#then it injects AGENTS.md content as directory context", async () => {
          const sid = `sess-agents-inject-${randomUUID()}`
          await post("/sessionStart", { session_id: sid })
          const result = await post("/postToolUse", {
            tool_name: "Read",
            tool_input: { file_path: AGENTS_TEST_FILE },
            session_id: sid,
          })
          expect(result.additional_context).toContain("[directory-context]")
          expect(result.additional_context).toContain("AGENTS.md")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUse")
        })
      })
    })

    describe("#given AGENTS.md was already injected for a directory", () => {
      describe("#when reading another file in the same directory", () => {
        test("#then it does not re-inject AGENTS.md", async () => {
          const sid = `sess-agents-dedup-${randomUUID()}`
          await post("/sessionStart", { session_id: sid })
          await post("/postToolUse", {
            tool_name: "Read",
            tool_input: { file_path: AGENTS_TEST_FILE },
            session_id: sid,
          })
          const result = await post("/postToolUse", {
            tool_name: "Read",
            tool_input: { file_path: AGENTS_TEST_FILE },
            session_id: sid,
          })
          const ctx = result.additional_context || ""
          expect(ctx).not.toContain("[directory-context]")
        })
      })
    })
  })

  describe("/stop", () => {
    test("returns empty when no active loops (Claude Code format)", async () => {
      await post("/sessionStart", { session_id: "sess-stop" })
      const result = await post("/stop", {
        stop_hook_active: false,
        session_id: "sess-stop",
      })
      expect(result.decision).toBeUndefined()
      expect(result.followup_message).toBeUndefined()
    })

    test("returns empty when stop_hook_active is true", async () => {
      const result = await post("/stop", {
        stop_hook_active: true,
        session_id: "sess-stop",
      })
      expect(result.decision).toBeUndefined()
    })

    test("returns empty when Cursor-native status is 'completed'", async () => {
      await post("/sessionStart", { conversation_id: "conv-stop-cursor" })
      const result = await post("/stop", {
        status: "completed",
        conversation_id: "conv-stop-cursor",
      })
      expect(result.decision).toBeUndefined()
      expect(result.followup_message).toBeUndefined()
    })

    test("returns empty when Cursor-native status is 'aborted'", async () => {
      await post("/sessionStart", { conversation_id: "conv-stop-aborted" })
      const result = await post("/stop", {
        status: "aborted",
        conversation_id: "conv-stop-aborted",
      })
      expect(result.decision).toBeUndefined()
      expect(result.followup_message).toBeUndefined()
    })

    test("returns empty when Cursor-native status is 'error'", async () => {
      await post("/sessionStart", { conversation_id: "conv-stop-error" })
      const result = await post("/stop", {
        status: "error",
        conversation_id: "conv-stop-error",
      })
      expect(result.decision).toBeUndefined()
    })

    describe("#given an active ralph loop with max iterations", () => {
      describe("#when stop is called", () => {
        test("#then it blocks and returns continuation message with iteration count", async () => {
          await post("/sessionStart", { session_id: "sess-ralph-stop" })
          await post("/beforeSubmitPrompt", {
            prompt: "/ralph-loop --max-iterations 5",
            session_id: "sess-ralph-stop",
          })
          const result = await post("/stop", {
            session_id: "sess-ralph-stop",
          })
          expect(result.decision).toBe("block")
          expect(result.followup_message).toContain("Continue working")
          expect(result.followup_message).toContain("1/5")
        })
      })
    })

    describe("#given activePlan set with tool activity", () => {
      describe("#when stop is called after tool calls were made", () => {
        test("#then it blocks and requests plan continuation", async () => {
          await post("/sessionStart", { session_id: "sess-boulder-stop" })
          await post("/postToolUse", {
            tool_name: "Read",
            session_id: "sess-boulder-stop",
          })
          const conv = (await import("./shared")).getOrCreateConversation("sess-boulder-stop")
          conv.activePlan = { path: "/plans/test.md", phase: "wave-0", completedTasks: [] }
          const result = await post("/stop", {
            session_id: "sess-boulder-stop",
          })
          expect(result.decision).toBe("block")
          expect(result.followup_message).toContain("Continue executing plan")
        })
      })
    })
  })

  describe("/preCompact", () => {
    test("tracks compaction and returns compaction context (Claude Code format)", async () => {
      const result = await post("/preCompact", {
        trigger: "auto",
        session_id: "sess-1",
      })
      expect(result.user_message).toBeDefined()
      expect(String(result.user_message).length).toBeGreaterThan(0)
      expect(result.hookSpecificOutput?.hookEventName).toBe("PreCompact")
    })

    test("tracks compaction with Cursor-native conversation_id", async () => {
      await post("/sessionStart", { conversation_id: "conv-compact" })
      const result = await post("/preCompact", {
        trigger: "auto",
        conversation_id: "conv-compact",
      })
      expect(result.user_message).toBeDefined()
      expect(String(result.user_message).length).toBeGreaterThan(0)
      expect(result.hookSpecificOutput?.hookEventName).toBe("PreCompact")
    })

    test("injects preserved todo states, active plan, and composer mode into compaction context", async () => {
      const sid = "sess-precompact-todo-preserve"
      await post("/sessionStart", { session_id: sid })
      await post("/beforeSubmitPrompt", {
        session_id: sid,
        prompt: "/plan outline work",
      })
      await post("/postToolUse", {
        session_id: sid,
        tool_name: "TodoWrite",
        tool_input: {
          merge: false,
          todos: [
            { id: "plan-phase1", content: "phase", status: "in_progress" },
            { id: "task-1", content: "do thing", status: "pending" },
          ],
        },
      })
      const result = await post("/preCompact", { trigger: "auto", session_id: sid })
      const msg = String(result.user_message)
      expect(msg).toContain("[todo-preservation] Preserved todo states from before compaction:")
      expect(msg).toContain("- plan-phase1: in_progress")
      expect(msg).toContain("- task-1: pending")
      expect(msg).toContain("[active-plan]")
      expect(msg).toContain("plan-phase1")
      expect(msg).toContain("[composer-mode] plan")
    })
  })

  describe("/beforeSubmitPrompt", () => {
    test("injects persona constraints for normal messages (prompt field)", async () => {
      await post("/sessionStart", { session_id: "sess-prompt" })
      const result = await post("/beforeSubmitPrompt", {
        prompt: "Hello world",
        session_id: "sess-prompt",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("Prometheus")
      expect(result.additional_context).toContain("FORBIDDEN")
    })

    test("injects persona constraints via user_message field (Cursor-native)", async () => {
      await post("/sessionStart", { conversation_id: "conv-prompt" })
      const result = await post("/beforeSubmitPrompt", {
        user_message: "Hello world",
        conversation_id: "conv-prompt",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("Prometheus")
      expect(result.additional_context).toContain("FORBIDDEN")
    })

    test("detects ultrawork keyword with dual response", async () => {
      await post("/sessionStart", { conversation_id: "conv-prompt-ultra" })
      const result = await post("/beforeSubmitPrompt", {
        user_message: "ultrawork on this feature",
        conversation_id: "conv-prompt-ultra",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("ultrawork")
      expect(result.hookSpecificOutput.additionalContext).toContain("ultrawork")
      expect(result.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit")
    })

    test("detects ralph-loop via prompt field", async () => {
      await post("/sessionStart", { session_id: "sess-prompt-ralph" })
      const result = await post("/beforeSubmitPrompt", {
        prompt: "/ralph-loop --max-iterations 5",
        session_id: "sess-prompt-ralph",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("ralph-loop")
      expect(result.hookSpecificOutput.additionalContext).toContain("ralph-loop")
    })
  })

  describe("/postToolUseFailure", () => {
    describe("#given a rate limit error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns rate limit recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Shell",
            error: "429 Too Many Requests",
            session_id: "sess-fail-rate",
          })
          expect(result.additional_context).toContain("conversation-recovery")
          expect(result.additional_context).toContain("Rate limit")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a timeout error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns timeout recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Task",
            error: "Request timed out after 30s",
            session_id: "sess-fail-timeout",
          })
          expect(result.additional_context).toContain("conversation-recovery")
          expect(result.additional_context).toContain("timed out")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a permission denied error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns permission recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Write",
            error: "Permission denied: /etc/passwd",
            session_id: "sess-fail-perm",
          })
          expect(result.additional_context).toContain("conversation-recovery")
          expect(result.additional_context).toContain("Permission denied")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a not found error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns not found recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Read",
            error: "No such file or directory",
            session_id: "sess-fail-notfound",
          })
          expect(result.additional_context).toContain("conversation-recovery")
          expect(result.additional_context).toContain("not found")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a generic error with no matching pattern", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Shell",
            error: "Something unexpected happened",
            session_id: "sess-fail-generic",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterShellExecution", () => {
    describe("#given any shell execution completes", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterShellExecution", {
            tool_name: "Shell",
            output: "command output",
            session_id: "sess-after-shell",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/beforeMCPExecution", () => {
    describe("#given an MCP tool is about to execute", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/beforeMCPExecution", {
            mcp_name: "websearch",
            session_id: "sess-before-mcp",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterMCPExecution", () => {
    describe("#given an MCP tool completes execution", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterMCPExecution", {
            mcp_name: "websearch",
            output: "search results",
            session_id: "sess-after-mcp",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterFileEdit", () => {
    describe("#given a file edit completes", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const sid = `sess-after-edit-${randomUUID()}`
          await post("/sessionStart", { session_id: sid })
          const result = await post("/afterFileEdit", {
            file_path: "/project/src/file.ts",
            session_id: sid,
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterAgentResponse", () => {
    describe("#given an agent produces a response", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterAgentResponse", {
            response: "Agent response text",
            session_id: "sess-after-agent",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterAgentThought", () => {
    describe("#given a short thinking duration under 30s", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterAgentThought", {
            duration_ms: 5000,
            session_id: "sess-thought-short",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })

    describe("#given a long thinking duration exceeding 30s", () => {
      describe("#when the handler is called", () => {
        test("#then it still returns empty object", async () => {
          const result = await post("/afterAgentThought", {
            duration_ms: 45000,
            session_id: "sess-thought-long",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("unknown route", () => {
    test("returns 404", async () => {
      const res = await fetch(`${BASE}/nonexistent`, { method: "POST" })
      expect(res.status).toBe(404)
    })
  })

  describe("body parsing resilience", () => {
    test("POST /shutdown with empty body returns 200 shutting_down", async () => {
      const res = await fetch(`${BASE}/shutdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe("shutting_down")
    })

    test("POST /shutdown with valid JSON body returns 200", async () => {
      const res = await fetch(`${BASE}/shutdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.status).toBe("shutting_down")
    })

    test("POST /sessionStart with empty body returns 200 falling back to empty object", async () => {
      const res = await fetch(`${BASE}/sessionStart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toBeDefined()
    })

    test("POST /sessionStart with malformed JSON returns 400 with Invalid JSON body", async () => {
      const res = await fetch(`${BASE}/sessionStart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe("Invalid JSON body")
    })
  })
})
