import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"

// Isolated subprocess daemon so config writes land in temp dirs (never the real
// repo .cursor/ or the developer's ~/.config). Port 27899 per the plan's QA
// convention; distinct from daemon.test.ts (27849) and DEFAULT_PORT (27847).
const PORT = 27899
const BASE = `http://localhost:${PORT}`
const TOKEN = "test-agent-overrides-token-xyz"
const PID_FILE = "/tmp/oh-my-cursor-daemon.pid"
const PORT_FILE = "/tmp/oh-my-cursor-daemon.port"

let projectDir: string
let homeDir: string
let daemon: ReturnType<typeof Bun.spawn> | null = null
const pidPortBackups: Array<[string, string]> = []

function projectConfigPath(): string {
  return join(projectDir, ".cursor", "oh-my-cursor.jsonc")
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${TOKEN}`, ...extra }
}

async function waitForHealth(timeoutMs = 6000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.status === 200) return true
    } catch {}
    await Bun.sleep(100)
  }
  return false
}

beforeAll(async () => {
  projectDir = mkdtempSync(join(tmpdir(), "omc-aoe-proj-"))
  homeDir = mkdtempSync(join(tmpdir(), "omc-aoe-home-"))
  mkdirSync(join(projectDir, ".cursor"), { recursive: true })
  mkdirSync(join(homeDir, ".config", "oh-my-cursor"), { recursive: true })

  // Best-effort clear of a leaked daemon from an interrupted prior run so the
  // fresh spawn can bind 27899 instead of hitting a stale process.
  try {
    Bun.spawnSync(["bash", "-c", `lsof -ti :${PORT} | xargs -r kill -9`])
    await Bun.sleep(200)
  } catch {}

  // Back up global pid/port files so we never clobber a real running daemon.
  for (const f of [PID_FILE, PORT_FILE]) {
    if (existsSync(f)) {
      const bak = `${f}.aoe-test-bak`
      renameSync(f, bak)
      pidPortBackups.push([f, bak])
    }
  }

  // Spawn WITH cwd=projectDir so the daemon's `process.cwd()`-derived project
  // config path lands in the temp dir, never the real repo. daemon.ts must be
  // referenced by absolute path since the cwd is no longer the repo root.
  const daemonEntry = resolve(import.meta.dir, "daemon.ts")
  const { OH_MY_CURSOR_PORT: _omit, ...baseEnv } = process.env
  daemon = Bun.spawn(["bun", "run", daemonEntry], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...baseEnv,
      HOME: homeDir,
      OH_MY_CURSOR_PORT: String(PORT),
      OH_MY_CURSOR_DAEMON_TOKEN: TOKEN,
      OH_MY_CURSOR_PROJECT_DIR: projectDir,
    },
  })

  const healthy = await waitForHealth()
  if (!healthy) {
    const stderr = daemon ? await new Response(daemon.stderr as ReadableStream).text() : ""
    throw new Error(`Isolated daemon failed to become healthy on ${PORT}. stderr:\n${stderr.slice(0, 2000)}`)
  }
}, 20000)

afterAll(async () => {
  if (daemon) {
    try {
      daemon.kill()
    } catch {}
    try {
      await daemon.exited
    } catch {}
    daemon = null
  }
  // Remove pid/port files written by the test daemon (no backup entry).
  for (const f of [PID_FILE, PORT_FILE]) {
    if (existsSync(f) && !pidPortBackups.some(([orig]) => orig === f)) {
      try {
        unlinkSync(f)
      } catch {}
    }
  }
  for (const [orig, bak] of pidPortBackups) {
    try {
      if (existsSync(bak)) renameSync(bak, orig)
    } catch {}
  }
  for (const d of [projectDir, homeDir]) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {}
  }
})

async function postOverrides(
  body: unknown,
  headers: Record<string, string> = authHeaders({ "Content-Type": "application/json" }),
): Promise<Response> {
  return fetch(`${BASE}/config/agent-overrides`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

describe("POST /config/agent-overrides", () => {
  test("requires the shared-secret token (401 without it)", async () => {
    const res = await fetch(`${BASE}/config/agent-overrides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "project", agent_overrides: {} }),
    })
    expect(res.status).toBe(401)
  })

  test("valid write returns 200 + saved status, round-trips via /config/full hot-reload", async () => {
    const res = await postOverrides({
      target: "project",
      agent_overrides: { explore: { model: "gpt-5.4-medium" } },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("saved")
    expect(data.path).toBe(projectConfigPath())
    expect(Array.isArray(data.warnings)).toBe(true)

    // file actually on disk
    expect(existsSync(projectConfigPath())).toBe(true)
    const onDisk = JSON.parse(readFileSync(projectConfigPath(), "utf-8"))
    expect(onDisk.agent_overrides.explore.model).toBe("gpt-5.4-medium")

    // hot-reload: GET /config/full reflects the new value with no daemon restart
    const full = await fetch(`${BASE}/config/full`, { headers: authHeaders() })
    expect(full.status).toBe(200)
    const cfg = await full.json()
    expect(cfg.agent_overrides.explore.model).toBe("gpt-5.4-medium")
  })

  test("invalid body returns 400 and leaves the file byte-identical", async () => {
    expect(existsSync(projectConfigPath())).toBe(true)
    const before = createHash("sha256").update(readFileSync(projectConfigPath())).digest("hex")

    const res = await postOverrides({
      target: "project",
      agent_overrides: { explore: { model: "x", bogus_key: 1 } },
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()

    const after = createHash("sha256").update(readFileSync(projectConfigPath())).digest("hex")
    expect(after).toBe(before)
  })

  test("unknown model yields an advisory warning but still writes (200)", async () => {
    const res = await postOverrides({
      target: "project",
      agent_overrides: { explore: { model: "totally-fake-model-zzz" } },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("saved")
    expect(Array.isArray(data.warnings)).toBe(true)
    expect(data.warnings.join("\n")).toContain("totally-fake-model-zzz")
    const onDisk = JSON.parse(readFileSync(projectConfigPath(), "utf-8"))
    expect(onDisk.agent_overrides.explore.model).toBe("totally-fake-model-zzz")
  })

  test("emits an SSE config-changed event on /events/stream after a successful write", async () => {
    const controller = new AbortController()
    const streamRes = await fetch(`${BASE}/events/stream?token=${TOKEN}`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    })
    expect(streamRes.status).toBe(200)
    const reader = streamRes.body!.getReader()
    const decoder = new TextDecoder()

    // Give the stream a moment to register, then trigger a write.
    await Bun.sleep(150)
    const writeRes = await postOverrides({
      target: "project",
      agent_overrides: { explore: { model: "composer-2-fast" } },
    })
    expect(writeRes.status).toBe(200)

    let buffer = ""
    let sawConfigChanged = false
    const deadline = Date.now() + 4000
    while (Date.now() < deadline && !sawConfigChanged) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (buffer.includes("event: config-changed")) sawConfigChanged = true
    }
    controller.abort()
    try {
      await reader.cancel()
    } catch {}
    expect(sawConfigChanged).toBe(true)
  }, 10000)
})
