import { openSync, closeSync, writeSync, readFileSync, unlinkSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { isProcessAlive } from "../process-guard"

const LOCK_DIR = "/tmp"
const DEFAULT_HEALTH_TIMEOUT_MS = 2000
const DEFAULT_HEALTH_INTERVAL_MS = 150
const DEFAULT_PROBE_TIMEOUT_MS = 500

export interface LockHolder {
  pid: number
  startedAt: string
}

export type AcquireOutcome =
  | { acquired: true; reason: "fresh" | "stale-takeover"; path: string; holder: LockHolder }
  | { acquired: false; reason: "already-running"; path: string; holder: LockHolder }
  | { acquired: false; reason: "contended"; path: string }

export interface AcquireLockDeps {
  /** Liveness probe (injectable for tests). Defaults to process-guard's isProcessAlive. */
  isAlive?: (pid: number) => boolean
  /** Daemon health probe (injectable for tests). Must confirm a real oh-my-cursor daemon. */
  probeHealth?: (port: number) => Promise<boolean>
  /** Sleep helper (injectable for tests). */
  sleep?: (ms: number) => Promise<void>
  /** PID written into the lock and used for ownership checks. Defaults to process.pid. */
  pid?: number
  /** Clock for the startedAt timestamp. Defaults to a Date-backed ISO string. */
  nowIso?: () => string
  /** Max time to wait for an alive-but-not-yet-serving holder to answer /health. */
  healthTimeoutMs?: number
  /** Poll interval while waiting for the holder to answer /health. */
  healthIntervalMs?: number
}

/**
 * Per-project lock path. Two distinct project roots map to distinct files, so two
 * projects can each run their own daemon — there is intentionally NO global lock.
 */
export function lockPathForProject(projectRoot: string): string {
  const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 8)
  return `${LOCK_DIR}/oh-my-cursor-${hash}.lock`
}

function readHolder(path: string): LockHolder | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<LockHolder>
    if (typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid)) return null
    return {
      pid: parsed.pid,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : "",
    }
  } catch {
    return null
  }
}

/**
 * Atomic exclusive create via O_EXCL ("wx"). Returns true only if THIS call created
 * the file — the kernel guarantees exactly one winner across concurrent processes.
 */
function tryCreateExclusive(path: string, holder: LockHolder): boolean {
  let fd: number | null = null
  try {
    fd = openSync(path, "wx")
    writeSync(fd, JSON.stringify(holder))
    return true
  } catch (err) {
    const code = (err as { code?: string } | null)?.code
    if (code === "EEXIST") return false
    throw err
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // fd already closed
      }
    }
  }
}

/**
 * Default health probe. A bare 200 is NOT enough — a foreign squatter on the port
 * can return 200. We require the oh-my-cursor /health envelope (status === "ok") so
 * we only ever defer to a genuine daemon.
 */
async function defaultProbeHealth(port: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal })
    if (!res.ok) return false
    const data = (await res.json().catch(() => null)) as { status?: string } | null
    return !!data && data.status === "ok"
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Acquire the per-project singleton startup lock.
 *
 * Decision tree when the lock already exists:
 *   - holder PID alive AND answers /health on `port`  -> defer ("already-running")
 *   - holder PID alive but not yet serving            -> poll up to healthTimeoutMs
 *   - holder PID dead / hung / foreign                -> remove + atomically retry O_EXCL once
 *   - retry lost to a sibling starter                 -> defer if it is healthy, else "contended"
 *
 * The cross-process race is real even in single-threaded Bun: three concurrent
 * `bun daemon.ts` invocations are three OS processes. O_EXCL is the only primitive
 * that makes exactly one of them the winner.
 */
export async function acquireStartupLock(
  projectRoot: string,
  port: number,
  deps: AcquireLockDeps = {},
): Promise<AcquireOutcome> {
  const path = lockPathForProject(projectRoot)
  const isAlive = deps.isAlive ?? isProcessAlive
  const probeHealth = deps.probeHealth ?? defaultProbeHealth
  const sleep = deps.sleep ?? defaultSleep
  const pid = deps.pid ?? process.pid
  const nowIso = deps.nowIso ?? (() => new Date().toISOString())
  const healthTimeoutMs = deps.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS
  const healthIntervalMs = deps.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS

  const holder: LockHolder = { pid, startedAt: nowIso() }

  // Fast path: no existing lock -> exclusive create wins outright.
  if (tryCreateExclusive(path, holder)) {
    return { acquired: true, reason: "fresh", path, holder }
  }

  // Lock exists. Inspect the current holder before doing anything destructive.
  const existing = readHolder(path)
  if (existing && isAlive(existing.pid)) {
    // The holder process exists. It may be a fully-running daemon, or a sibling
    // that just won the lock and is still binding the port. Poll /health so we
    // never tear down a freshly-elected winner mid-startup.
    if (await probeHealth(port)) {
      return { acquired: false, reason: "already-running", path, holder: existing }
    }
    const deadline = Date.now() + healthTimeoutMs
    while (Date.now() < deadline && isAlive(existing.pid)) {
      await sleep(healthIntervalMs)
      if (await probeHealth(port)) {
        return { acquired: false, reason: "already-running", path, holder: existing }
      }
    }
    // Alive but never answered /health within the window -> hung, foreign, or a
    // same-project daemon bound to a different port. Treat as stale and take over.
  }

  // Stale (dead PID, unreadable, or hung). Remove and atomically retry O_EXCL once.
  try {
    unlinkSync(path)
  } catch {
    // Another starter may have removed it first — ENOENT is fine.
  }

  if (tryCreateExclusive(path, holder)) {
    return { acquired: true, reason: "stale-takeover", path, holder }
  }

  // Lost the takeover race to a sibling starter. Defer to it if it is healthy,
  // otherwise report contention so the caller can exit cleanly without binding.
  const winner = readHolder(path)
  if (winner && isAlive(winner.pid) && (await probeHealth(port))) {
    return { acquired: false, reason: "already-running", path, holder: winner }
  }
  return { acquired: false, reason: "contended", path }
}

/**
 * Release the lock — but ONLY if we still own it. Never remove a successor's lock
 * (e.g. a daemon that took over after we lost a race). Best-effort and idempotent.
 */
export function releaseStartupLock(projectRoot: string, deps: { pid?: number } = {}): void {
  const path = lockPathForProject(projectRoot)
  const pid = deps.pid ?? process.pid
  try {
    if (!existsSync(path)) return
    const holder = readHolder(path)
    if (holder && holder.pid !== pid) return
    unlinkSync(path)
  } catch {
    // best-effort cleanup
  }
}
