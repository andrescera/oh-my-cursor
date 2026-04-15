import { existsSync, unlinkSync } from "node:fs"

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "EPERM") {
      return true
    }
    return false
  }
}

export function cleanupStaleProcess(
  pidFile: string,
  portFile?: string,
  label = "process",
): { cleaned: boolean; killedPid?: number } {
  if (!existsSync(pidFile)) return { cleaned: false }

  try {
    const pidStr = Bun.file(pidFile).textSync().trim()
    const pid = parseInt(pidStr, 10)
    if (isNaN(pid)) {
      console.log(`[oh-my-cursor] Removing invalid ${label} PID file`)
      unlinkSync(pidFile)
      return { cleaned: true }
    }

    const alive = isProcessAlive(pid)
    if (alive) {
      console.log(`[oh-my-cursor] Killing stale ${label} (PID ${pid})`)
      try { process.kill(pid, "SIGTERM") } catch {}
    }

    unlinkSync(pidFile)
    if (portFile) {
      try { if (existsSync(portFile)) unlinkSync(portFile) } catch {}
    }
    return { cleaned: true, killedPid: alive ? pid : undefined }
  } catch (err) {
    console.error(`[oh-my-cursor] Error cleaning stale ${label}:`, err instanceof Error ? err.message : String(err))
    return { cleaned: false }
  }
}
