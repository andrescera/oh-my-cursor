import { describe, expect, test } from "bun:test"
import { createMetrics } from "./metrics"

describe("metrics ring buffer", () => {
  test("slow trips are recorded; ring buffer caps at 64", () => {
    const metrics = createMetrics()
    for (let i = 0; i < 70; i++) {
      metrics.recordSlowHandler({
        route: "/preToolUse",
        budgetMs: 50,
        observedMs: 100 + i,
        ts: new Date(2026, 0, 1, 0, 0, 0, i).toISOString(),
      })
    }
    const snapshot = metrics.getSnapshot()
    expect(snapshot.slowHandlers.length).toBe(64)
    expect(snapshot.slowHandlers[0]?.observedMs).toBe(169)
    expect(snapshot.slowHandlers[63]?.observedMs).toBe(106)
  })

  test("getSnapshot completes in <50ms", () => {
    const metrics = createMetrics()
    for (let i = 0; i < 10; i++) {
      metrics.recordSlowHandler({
        route: "/beforeShellExecution",
        budgetMs: 50,
        observedMs: 80,
        ts: new Date().toISOString(),
      })
    }
    const start = Date.now()
    const snapshot = metrics.getSnapshot()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(50)
    expect(snapshot.slowHandlers.length).toBe(10)
  })

  test("circuit-breaker state per route reported accurately", () => {
    const metrics = createMetrics()
    const resetAt = Date.now() + 60_000
    metrics.setCircuitState({
      "/preToolUse": { tripped: true, tripCount: 5, resetAt },
      "/beforeShellExecution": { tripped: false, tripCount: 1, resetAt: null },
    })
    const snapshot = metrics.getSnapshot()
    expect(snapshot.circuitState["/preToolUse"]?.tripped).toBe(true)
    expect(snapshot.circuitState["/preToolUse"]?.tripCount).toBe(5)
    expect(snapshot.circuitState["/preToolUse"]?.resetAt).toBe(resetAt)
    expect(snapshot.circuitState["/beforeShellExecution"]?.tripped).toBe(false)
  })

  test("worker tick stats are tracked", () => {
    const metrics = createMetrics()
    expect(metrics.getSnapshot().workerStats.totalTicks).toBe(0)
    expect(metrics.getSnapshot().workerStats.lastTickAt).toBeNull()
    expect(metrics.getSnapshot().workerStats.lastTickDurationMs).toBeNull()

    metrics.recordWorkerTick(150)
    const snapshot = metrics.getSnapshot()
    expect(snapshot.workerStats.totalTicks).toBe(1)
    expect(snapshot.workerStats.lastTickDurationMs).toBe(150)
    expect(snapshot.workerStats.lastTickAt).not.toBeNull()

    metrics.recordWorkerTick(200)
    const next = metrics.getSnapshot()
    expect(next.workerStats.totalTicks).toBe(2)
    expect(next.workerStats.lastTickDurationMs).toBe(200)
  })

  test("snapshot does not expose internal mutable state", () => {
    const metrics = createMetrics()
    metrics.recordSlowHandler({
      route: "/preToolUse",
      budgetMs: 50,
      observedMs: 100,
      ts: new Date().toISOString(),
    })
    const snapA = metrics.getSnapshot()
    snapA.slowHandlers.push({ route: "x", budgetMs: 0, observedMs: 0, ts: "" })
    const snapB = metrics.getSnapshot()
    expect(snapB.slowHandlers.length).toBe(1)
  })
})
