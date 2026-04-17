import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"

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
    const pidStr = readFileSync(pidFile, "utf-8").trim()
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

export type KillPortSquatterResult = "killed" | "absent" | "not_us" | "lsof_missing"

/**
 * Linux-only: relies on /proc/<pid>/status and lsof.
 * Discovers the process(es) holding the given TCP port, verifies same-user
 * ownership, and kills with SIGTERM → poll → SIGKILL escalation.
 */
export async function killPortSquatter(port: number, label: string): Promise<KillPortSquatterResult> {
  let lsofOutput: string
  try {
    const proc = Bun.spawn(["lsof", "-ti", `:${port}`], { stdout: "pipe", stderr: "pipe" })
    const raw = await new Response(proc.stdout).text()
    await proc.exited
    lsofOutput = raw.trim()
    // lsof exits 1 with empty stdout when nothing matches - treat as absent
    if (!lsofOutput) return "absent"
  } catch (err) {
    const code = err instanceof Error && "code" in err ? (err as { code?: string }).code : undefined
    if (code === "ENOENT" || (err instanceof Error && err.message.includes("ENOENT"))) {
      console.warn(`[oh-my-cursor] lsof not found on PATH; cannot kill squatter on port ${port} (${label})`)
      return "lsof_missing"
    }
    console.warn(`[oh-my-cursor] lsof not found on PATH; cannot kill squatter on port ${port} (${label})`)
    return "lsof_missing"
  }

  const currentUid = typeof process.getuid === "function" ? process.getuid() : -1
  let anyKilled = false

  for (const pidStr of lsofOutput.split("\n").filter(Boolean)) {
    const pid = parseInt(pidStr, 10)
    if (isNaN(pid)) continue

    // Check ownership via /proc/<pid>/status
    let squatterUid = -1
    try {
      const status = readFileSync(`/proc/${pid}/status`, "utf-8")
      const uidLine = status.split("\n").find((l) => l.startsWith("Uid:"))
      if (uidLine) {
        const parts = uidLine.split(/\s+/)
        squatterUid = parseInt(parts[1], 10)
      }
    } catch {
      // Process already gone; count as successful kill
      anyKilled = true
      continue
    }

    if (currentUid !== -1 && squatterUid !== -1 && squatterUid !== currentUid) {
      console.error(
        `[oh-my-cursor] Port ${port} (${label}) is held by PID ${pid} owned by uid ${squatterUid}; refusing to kill foreign process. Change the port in config or free it manually.`,
      )
      return "not_us"
    }

    // SIGTERM + poll up to 3 × 100ms
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      anyKilled = true
      continue
    }

    let signalUsed: "SIGTERM" | "SIGKILL" = "SIGTERM"
    for (let i = 0; i < 3; i++) {
      await sleep(100)
      if (!isProcessAlive(pid)) break
    }

    if (isProcessAlive(pid)) {
      signalUsed = "SIGKILL"
      try {
        process.kill(pid, "SIGKILL")
      } catch {
        // Already dead between the check and the kill
      }
      await sleep(100)
    }

    if (isProcessAlive(pid)) {
      console.error(
        `[oh-my-cursor] Failed to kill PID ${pid} on port ${port} (${label}) even after SIGKILL`,
      )
      continue
    }

    console.log(
      `[oh-my-cursor] Killed stale squatter on port ${port} (${label}), PID ${pid} (signal ${signalUsed})`,
    )
    anyKilled = true
  }

  return anyKilled ? "killed" : "absent"
}
