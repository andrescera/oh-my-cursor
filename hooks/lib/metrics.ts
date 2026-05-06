export interface SlowHandlerRecord {
  route: string
  budgetMs: number
  observedMs: number
  ts: string
}

export interface CircuitStateEntry {
  tripped: boolean
  tripCount: number
  resetAt: number | null
}

export interface WorkerTickStats {
  lastTickAt: string | null
  lastTickDurationMs: number | null
  totalTicks: number
}

export interface MetricsSnapshot {
  slowHandlers: SlowHandlerRecord[]
  circuitState: Record<string, CircuitStateEntry>
  workerStats: WorkerTickStats
}

export interface Metrics {
  recordSlowHandler(record: SlowHandlerRecord): void
  setCircuitState(state: Record<string, CircuitStateEntry>): void
  recordWorkerTick(durationMs: number): void
  getSnapshot(): MetricsSnapshot
}

export function createMetrics(maxSlowHandlers = 64): Metrics {
  const capacity = Math.max(1, maxSlowHandlers)
  const buffer: Array<SlowHandlerRecord | undefined> = new Array(capacity)
  let writeIndex = 0
  let count = 0

  let circuitState: Record<string, CircuitStateEntry> = {}

  const workerStats: WorkerTickStats = {
    lastTickAt: null,
    lastTickDurationMs: null,
    totalTicks: 0,
  }

  function recordSlowHandler(record: SlowHandlerRecord): void {
    buffer[writeIndex] = {
      route: record.route,
      budgetMs: record.budgetMs,
      observedMs: record.observedMs,
      ts: record.ts,
    }
    writeIndex = (writeIndex + 1) % capacity
    if (count < capacity) count++
  }

  function setCircuitState(state: Record<string, CircuitStateEntry>): void {
    const copy: Record<string, CircuitStateEntry> = {}
    for (const [route, entry] of Object.entries(state)) {
      copy[route] = {
        tripped: entry.tripped,
        tripCount: entry.tripCount,
        resetAt: entry.resetAt,
      }
    }
    circuitState = copy
  }

  function recordWorkerTick(durationMs: number): void {
    workerStats.lastTickAt = new Date().toISOString()
    workerStats.lastTickDurationMs = durationMs
    workerStats.totalTicks++
  }

  function getSnapshot(): MetricsSnapshot {
    const slowHandlers: SlowHandlerRecord[] = []
    for (let i = 0; i < count; i++) {
      const idx = (writeIndex - 1 - i + capacity) % capacity
      const entry = buffer[idx]
      if (entry) {
        slowHandlers.push({
          route: entry.route,
          budgetMs: entry.budgetMs,
          observedMs: entry.observedMs,
          ts: entry.ts,
        })
      }
    }

    const circuitCopy: Record<string, CircuitStateEntry> = {}
    for (const [route, entry] of Object.entries(circuitState)) {
      circuitCopy[route] = {
        tripped: entry.tripped,
        tripCount: entry.tripCount,
        resetAt: entry.resetAt,
      }
    }

    return {
      slowHandlers,
      circuitState: circuitCopy,
      workerStats: {
        lastTickAt: workerStats.lastTickAt,
        lastTickDurationMs: workerStats.lastTickDurationMs,
        totalTicks: workerStats.totalTicks,
      },
    }
  }

  return { recordSlowHandler, setCircuitState, recordWorkerTick, getSnapshot }
}
