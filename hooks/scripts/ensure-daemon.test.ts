import { test, expect } from "bun:test"
import { resolve } from "node:path"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"

test("ensure-daemon.sh exits non-zero within 3.5s when daemon is unreachable", async () => {
  const scriptPath = resolve(import.meta.dir, "ensure-daemon.sh")
  const portFile = "/tmp/oh-my-cursor-daemon.port"
  const heartbeatFile = "/tmp/oh-my-cursor-heartbeat"
  const priorPort = existsSync(portFile) ? readFileSync(portFile, "utf8") : null
  const priorHeartbeat = existsSync(heartbeatFile) ? readFileSync(heartbeatFile, "utf8") : null

  writeFileSync(portFile, "1\n", "utf8")
  writeFileSync(heartbeatFile, `${Date.now()}\n`, "utf8")

  const startedAt = Date.now()

  try {
    const proc = Bun.spawn(["bash", scriptPath, "/health"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        OH_MY_CURSOR_PORT: "1",
      },
    })

    proc.stdin.write("{}")
    proc.stdin.end()

    const exitCode = await proc.exited
    const elapsedMs = Date.now() - startedAt

    expect(exitCode).not.toBe(0)
    expect(elapsedMs).toBeLessThan(3500)
  } finally {
    if (priorPort === null) {
      rmSync(portFile, { force: true })
    } else {
      writeFileSync(portFile, priorPort, "utf8")
    }
    if (priorHeartbeat === null) {
      rmSync(heartbeatFile, { force: true })
    } else {
      writeFileSync(heartbeatFile, priorHeartbeat, "utf8")
    }
  }
})
