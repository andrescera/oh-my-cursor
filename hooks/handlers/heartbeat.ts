import { writeFileSync } from "node:fs"

const HEARTBEAT_FILE = "/tmp/oh-my-cursor-heartbeat"
const HEARTBEAT_INTERVAL_MS = 30_000

export function createHeartbeatHandler(startTime: number) {
  return () => ({
    alive: true,
    timestamp: Date.now(),
    uptime: Date.now() - startTime,
  })
}

export function startHeartbeatWriter(): ReturnType<typeof setInterval> {
  writeFileSync(HEARTBEAT_FILE, String(Date.now()), "utf-8")
  return setInterval(() => {
    try {
      writeFileSync(HEARTBEAT_FILE, String(Date.now()), "utf-8")
    } catch (err) {
      console.error(
        "[oh-my-cursor] Failed to write heartbeat:",
        err instanceof Error ? err.message : String(err),
      )
    }
  }, HEARTBEAT_INTERVAL_MS)
}

export { HEARTBEAT_FILE, HEARTBEAT_INTERVAL_MS }
