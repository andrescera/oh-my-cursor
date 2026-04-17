import { getDaemonPort } from "../port-manager"

let daemonHealthy = true
let started = false

export function getDaemonHealthy(): boolean {
  return daemonHealthy
}

export function startDaemonHealthMonitor(): void {
  if (started) return
  started = true

  setInterval(async () => {
    try {
      const daemonPort = getDaemonPort(27847)
      const res = await fetch(`http://localhost:${daemonPort}/health`, {
        signal: AbortSignal.timeout(5000),
      })
      daemonHealthy = res.ok
      if (!res.ok) {
        console.warn(`[oh-my-cursor] Daemon health check failed: HTTP ${res.status}`)
      }
    } catch {
      daemonHealthy = false
      console.warn("[oh-my-cursor] Daemon health check failed: unreachable")
    }
  }, 30_000)
}
