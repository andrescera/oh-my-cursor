import { describe, test, expect } from "bun:test"

import { createBudgetMiddleware, type SlowHandlerEvent } from "./budget-middleware"

describe("createBudgetMiddleware", () => {
  test("fast handler returns real response unchanged", async () => {
    const mw = createBudgetMiddleware()
    const result = await mw.withBudget("test", 200, async () => ({ ok: true }))
    expect(result).toEqual({ ok: true })
  })

  test("slow handler returns {deferred:true} within budget+20ms and fires onSlowHandler", async () => {
    const events: SlowHandlerEvent[] = []
    const mw = createBudgetMiddleware({
      onSlowHandler: (ev) => events.push(ev),
    })

    const start = Date.now()
    const result = await mw.withBudget("test", 100, async () => {
      await Bun.sleep(500)
      return { ok: true }
    })
    const elapsed = Date.now() - start

    expect(result).toEqual({ deferred: true })
    expect(elapsed).toBeLessThan(150)

    expect(events.length).toBe(1)
    expect(events[0].route).toBe("test")
    expect(events[0].budgetMs).toBe(100)
    expect(events[0].observedMs).toBeGreaterThanOrEqual(100)
    expect(events[0].deferred).toBe(true)
    expect(typeof events[0].ts).toBe("string")
  })

  test("circuit breaker trips after 5 slow handlers within 30s", async () => {
    const mw = createBudgetMiddleware()

    for (let i = 0; i < 5; i++) {
      const result = await mw.withBudget("test", 50, async () => {
        await Bun.sleep(200)
        return { ok: true }
      })
      expect(result).toEqual({ deferred: true })
    }

    const start = Date.now()
    const result = await mw.withBudget("test", 50, async () => {
      await Bun.sleep(200)
      return { ok: true }
    })
    const elapsed = Date.now() - start

    expect(result).toEqual({ deferred: true })
    expect(elapsed).toBeLessThan(20)

    const state = mw.getCircuitState()
    expect(state["test"]).toBeDefined()
    expect(state["test"].tripped).toBe(true)
  })

  test("circuit breaker resets after manual resetCircuit()", async () => {
    const mw = createBudgetMiddleware()

    for (let i = 0; i < 5; i++) {
      await mw.withBudget("test", 50, async () => {
        await Bun.sleep(200)
        return { ok: true }
      })
    }

    expect(mw.getCircuitState()["test"].tripped).toBe(true)

    mw.resetCircuit("test")

    expect(mw.getCircuitState()["test"]?.tripped ?? false).toBe(false)

    const result = await mw.withBudget("test", 200, async () => ({ value: 42 }))
    expect(result).toEqual({ value: 42 })
  })
})
