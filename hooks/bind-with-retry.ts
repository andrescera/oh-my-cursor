import { serve, sleepSync } from "bun"

type ServeOpts = Parameters<typeof serve>[0]
export type Server = ReturnType<typeof serve>
type ServeFn = (opts: ServeOpts) => Server

export type BindWithRetryDeps = {
  attempts?: number
  backoffsMs?: number[]
  serveFn?: ServeFn
  sleepFn?: (ms: number) => void
}

const DEFAULT_BACKOFFS_MS = [200, 400, 800, 1600, 3200]

function isAddrInUse(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string } | null)?.code ?? ""
  return (
    code === "EADDRINUSE" ||
    /EADDRINUSE/i.test(message) ||
    /address already in use/i.test(message) ||
    /\bin use\b/i.test(message)
  )
}

export function bindWithRetry(serveOpts: ServeOpts, deps: BindWithRetryDeps = {}): Server {
  const attempts = deps.attempts ?? 5
  const backoffsMs = deps.backoffsMs ?? DEFAULT_BACKOFFS_MS
  const serveFn = deps.serveFn ?? (serve as ServeFn)
  const sleepFn = deps.sleepFn ?? ((ms: number) => sleepSync(ms))

  let lastError: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      return serveFn(serveOpts)
    } catch (err) {
      lastError = err
      if (!isAddrInUse(err)) throw err
      if (i + 1 < attempts) {
        const delay = backoffsMs[i] ?? backoffsMs[backoffsMs.length - 1] ?? 200
        sleepFn(delay)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export type FlushOnCrashDeps = {
  flushEventLog: () => void
  forceFlush: () => void
}

export function flushOnCrash(deps: FlushOnCrashDeps): void {
  // Crash path: each flush is best-effort. Swallow individual failures so a broken
  // event-log writer cannot prevent the conversation-state flush (and vice versa).
  try {
    deps.flushEventLog()
  } catch (err) {
    console.error("[oh-my-cursor] flushEventLog failed during crash:", err)
  }
  try {
    deps.forceFlush()
  } catch (err) {
    console.error("[oh-my-cursor] persistence.forceFlush failed during crash:", err)
  }
}
