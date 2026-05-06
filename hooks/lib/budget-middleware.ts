export interface SlowHandlerEvent {
  route: string
  budgetMs: number
  observedMs: number
  deferred: true
  ts: string
}

export type SlowHandlerCallback = (event: SlowHandlerEvent) => void

export interface BudgetMiddlewareOptions {
  onSlowHandler?: SlowHandlerCallback
}

const TRIP_WINDOW_MS = 30_000
const TRIP_THRESHOLD = 5
const CIRCUIT_RESET_MS = 60_000

interface CircuitEntry {
  trips: number[]
  resetAt: number | null
}

export interface BudgetMiddleware {
  withBudget<T>(
    routeName: string,
    budgetMs: number,
    handler: () => Promise<T>,
  ): Promise<T | { deferred: true }>
  getCircuitState(): Record<string, { tripped: boolean; tripCount: number; resetAt: number | null }>
  resetCircuit(routeName: string): void
}

export function createBudgetMiddleware(options: BudgetMiddlewareOptions = {}): BudgetMiddleware {
  const { onSlowHandler } = options
  const circuits = new Map<string, CircuitEntry>()

  function getOrCreateCircuit(route: string): CircuitEntry {
    let entry = circuits.get(route)
    if (!entry) {
      entry = { trips: [], resetAt: null }
      circuits.set(route, entry)
    }
    return entry
  }

  function isCircuitOpen(route: string, now: number): boolean {
    const entry = circuits.get(route)
    if (!entry) return false
    if (entry.resetAt !== null) {
      if (now >= entry.resetAt) {
        entry.resetAt = null
        entry.trips = []
        return false
      }
      return true
    }
    return false
  }

  function recordTrip(route: string, now: number): void {
    const entry = getOrCreateCircuit(route)
    entry.trips = entry.trips.filter((t) => now - t <= TRIP_WINDOW_MS)
    entry.trips.push(now)
    if (entry.trips.length >= TRIP_THRESHOLD && entry.resetAt === null) {
      entry.resetAt = now + CIRCUIT_RESET_MS
    }
  }

  async function withBudget<T>(
    routeName: string,
    budgetMs: number,
    handler: () => Promise<T>,
  ): Promise<T | { deferred: true }> {
    const start = Date.now()

    if (isCircuitOpen(routeName, start)) {
      return { deferred: true }
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const timeoutPromise = new Promise<{ deferred: true }>((resolve) => {
      timeoutHandle = setTimeout(() => {
        resolve({ deferred: true })
      }, budgetMs)
    })

    const handlerPromise = (async () => {
      try {
        return await handler()
      } finally {
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle)
          timeoutHandle = null
        }
      }
    })()

    handlerPromise.catch(() => {})

    const result = await Promise.race([handlerPromise, timeoutPromise])

    const isDeferredSentinel =
      typeof result === "object" &&
      result !== null &&
      (result as { deferred?: unknown }).deferred === true &&
      Object.keys(result as object).length === 1

    if (isDeferredSentinel) {
      const observedMs = Date.now() - start
      const ts = new Date().toISOString()
      recordTrip(routeName, Date.now())
      if (onSlowHandler) {
        try {
          onSlowHandler({
            route: routeName,
            budgetMs,
            observedMs,
            deferred: true,
            ts,
          })
        } catch {}
      }
      return { deferred: true }
    }

    return result as T
  }

  function getCircuitState(): Record<string, { tripped: boolean; tripCount: number; resetAt: number | null }> {
    const out: Record<string, { tripped: boolean; tripCount: number; resetAt: number | null }> = {}
    const now = Date.now()
    for (const [route, entry] of circuits) {
      const tripped = entry.resetAt !== null && now < entry.resetAt
      out[route] = {
        tripped,
        tripCount: entry.trips.length,
        resetAt: entry.resetAt,
      }
    }
    return out
  }

  function resetCircuit(routeName: string): void {
    const entry = circuits.get(routeName)
    if (!entry) return
    entry.trips = []
    entry.resetAt = null
  }

  return { withBudget, getCircuitState, resetCircuit }
}
