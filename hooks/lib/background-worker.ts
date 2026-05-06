export interface BackgroundWorkerJobs {
  pruneStale: () => void | Promise<void>
  rotateIfNeeded: () => void | Promise<void>
  cleanupOldConversationFiles: () => void | Promise<void>
}

export interface BackgroundWorkerOptions {
  intervalMs?: number
  jitterMs?: number
  onTickComplete?: (durationMs: number) => void
}

export interface BackgroundWorker {
  start(): void
  stop(): Promise<void>
  runOnceForTesting(): Promise<void>
}

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_JITTER_MS = 5_000

export function createBackgroundWorker(
  jobs: BackgroundWorkerJobs,
  options: BackgroundWorkerOptions = {},
): BackgroundWorker {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const jitterMs = options.jitterMs ?? DEFAULT_JITTER_MS
  const onTickComplete = options.onTickComplete

  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let currentTick: Promise<void> | null = null

  const orderedJobs: Array<[keyof BackgroundWorkerJobs, () => void | Promise<void>]> = [
    ["pruneStale", jobs.pruneStale],
    ["rotateIfNeeded", jobs.rotateIfNeeded],
    ["cleanupOldConversationFiles", jobs.cleanupOldConversationFiles],
  ]

  async function runTick(): Promise<void> {
    const tickStart = Date.now()
    try {
      for (const [name, job] of orderedJobs) {
        try {
          await job()
        } catch (err) {
          console.error(
            `[oh-my-cursor][background-worker] job ${name} failed:`,
            err instanceof Error ? err.message : String(err),
          )
        }
      }
    } finally {
      if (onTickComplete) {
        try {
          onTickComplete(Date.now() - tickStart)
        } catch {}
      }
    }
  }

  function schedule(): void {
    if (stopped) return
    const delay = intervalMs + Math.random() * jitterMs
    timer = setTimeout(() => {
      timer = null
      if (stopped) return
      currentTick = runTick().finally(() => {
        currentTick = null
        if (!stopped) schedule()
      })
    }, delay)
  }

  return {
    start(): void {
      if (timer || stopped) return
      schedule()
    },
    async stop(): Promise<void> {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (currentTick) {
        try { await currentTick } catch { /* errors already logged inside runTick */ }
      }
    },
    async runOnceForTesting(): Promise<void> {
      await runTick()
    },
  }
}
