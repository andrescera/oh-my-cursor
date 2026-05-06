import { test, expect } from "bun:test"
import { resolve } from "node:path"
import { existsSync, readFileSync, rmSync, writeFileSync, utimesSync } from "node:fs"

const PORT_FILE = "/tmp/oh-my-cursor-daemon.port"
const HEARTBEAT_FILE = "/tmp/oh-my-cursor-heartbeat"
const PID_FILE = "/tmp/oh-my-cursor-daemon.pid"

type Snapshot = { path: string; prior: string | null }

function snapshot(path: string): Snapshot {
  return { path, prior: existsSync(path) ? readFileSync(path, "utf8") : null }
}

function restore(snap: Snapshot) {
  if (snap.prior === null) {
    rmSync(snap.path, { force: true })
  } else {
    writeFileSync(snap.path, snap.prior, "utf8")
  }
}

test(
  "ensure-daemon.sh fast-paths in <500ms when daemon is already healthy",
  async () => {
    const scriptPath = resolve(import.meta.dir, "ensure-daemon.sh")
    const port = 27851

    const portSnap = snapshot(PORT_FILE)
    const heartbeatSnap = snapshot(HEARTBEAT_FILE)
    const pidSnap = snapshot(PID_FILE)

    const server = Bun.serve({
      port,
      fetch: () => Response.json({ status: "ok" }),
    })

    try {
      writeFileSync(PORT_FILE, `${port}\n`, "utf8")
      const now = new Date()
      utimesSync(PORT_FILE, now, now)
      rmSync(HEARTBEAT_FILE, { force: true })
      rmSync(PID_FILE, { force: true })

      const startedAt = Date.now()
      const proc = Bun.spawn(["bash", scriptPath, "/health"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          OH_MY_CURSOR_PORT: String(port),
          OH_MY_CURSOR_DAEMON_PORT: String(port),
        },
      })
      proc.stdin.write("{}")
      proc.stdin.end()

      const exitCode = await proc.exited
      const elapsedMs = Date.now() - startedAt

      expect(exitCode).toBe(0)
      expect(elapsedMs).toBeLessThan(500)
    } finally {
      server.stop(true)
      restore(portSnap)
      restore(heartbeatSnap)
      restore(pidSnap)
    }
  },
  5000,
)

test(
  "ensure-daemon.sh exits within OH_MY_CURSOR_ENSURE_TIMEOUT_MS+200ms when daemon is unreachable",
  async () => {
    const scriptPath = resolve(import.meta.dir, "ensure-daemon.sh")
    const port = 27852

    const portSnap = snapshot(PORT_FILE)
    const heartbeatSnap = snapshot(HEARTBEAT_FILE)
    const pidSnap = snapshot(PID_FILE)

    try {
      writeFileSync(PORT_FILE, `${port}\n`, "utf8")
      const stale = new Date(Date.now() - 60_000)
      utimesSync(PORT_FILE, stale, stale)
      rmSync(HEARTBEAT_FILE, { force: true })
      rmSync(PID_FILE, { force: true })

      const startedAt = Date.now()
      const proc = Bun.spawn(["bash", scriptPath, "/health"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          OH_MY_CURSOR_PORT: String(port),
          OH_MY_CURSOR_DAEMON_PORT: String(port),
          OH_MY_CURSOR_ENSURE_TIMEOUT_MS: "500",
        },
      })
      proc.stdin.write("{}")
      proc.stdin.end()

      const exitCode = await proc.exited
      const elapsedMs = Date.now() - startedAt

      expect(exitCode).not.toBe(0)
      expect(elapsedMs).toBeLessThan(700)
    } finally {
      restore(portSnap)
      restore(heartbeatSnap)
      restore(pidSnap)
    }
  },
  5000,
)

test(
  "wait_for_health caps at ~1s with 20×50ms attempts when daemon never answers",
  async () => {
    const script = `
wait_for_health() {
  local port="$1"
  local max_attempts=20
  local attempt=0
  while (( attempt < max_attempts )); do
    if curl -sf --max-time 0.5 "http://localhost:\${port}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.05
    attempt=$((attempt + 1))
  done
  return 1
}
wait_for_health 27853
`
    const startedAt = Date.now()
    const proc = Bun.spawn(["bash", "-c", script], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const exitCode = await proc.exited
    const elapsedMs = Date.now() - startedAt

    expect(exitCode).not.toBe(0)
    expect(elapsedMs).toBeGreaterThan(500)
    expect(elapsedMs).toBeLessThan(2500)
  },
  5000,
)
