import { describe, expect, test } from "bun:test"
import { bindWithRetry, flushOnCrash } from "./bind-with-retry"

type FakeServer = { stop: () => void }

function eaddrinuseError(): Error {
  const err = new Error("listen EADDRINUSE: address already in use 0.0.0.0:27847")
  // Bun typically attaches code on errors but we don't depend on it
  ;(err as Error & { code?: string }).code = "EADDRINUSE"
  return err
}

describe("bindWithRetry", () => {
  test("returns server immediately when first attempt succeeds", () => {
    const server: FakeServer = { stop: () => {} }
    let calls = 0
    const sleeps: number[] = []
    const result = bindWithRetry({} as Parameters<typeof bindWithRetry>[0], {
      attempts: 5,
      backoffsMs: [1, 1, 1, 1, 1],
      serveFn: () => {
        calls++
        return server as unknown as ReturnType<Parameters<typeof bindWithRetry>[1]["serveFn"] & {}>
      },
      sleepFn: (ms) => {
        sleeps.push(ms)
      },
    })
    expect(result).toBe(server)
    expect(calls).toBe(1)
    expect(sleeps).toHaveLength(0)
  })

  test("succeeds within 5 attempts when first attempt throws EADDRINUSE", () => {
    const server: FakeServer = { stop: () => {} }
    let calls = 0
    const sleeps: number[] = []
    const result = bindWithRetry({} as Parameters<typeof bindWithRetry>[0], {
      attempts: 5,
      backoffsMs: [1, 1, 1, 1, 1],
      serveFn: () => {
        calls++
        if (calls < 3) throw eaddrinuseError()
        return server as unknown as ReturnType<Parameters<typeof bindWithRetry>[1]["serveFn"] & {}>
      },
      sleepFn: (ms) => {
        sleeps.push(ms)
      },
    })
    expect(result).toBe(server)
    expect(calls).toBe(3)
    expect(sleeps).toEqual([1, 1])
  })

  test("uses provided backoffs in sequence", () => {
    const sleeps: number[] = []
    let calls = 0
    expect(() =>
      bindWithRetry({} as Parameters<typeof bindWithRetry>[0], {
        attempts: 5,
        backoffsMs: [200, 400, 800, 1600, 3200],
        serveFn: () => {
          calls++
          throw eaddrinuseError()
        },
        sleepFn: (ms) => {
          sleeps.push(ms)
        },
      }),
    ).toThrow()
    expect(calls).toBe(5)
    // 4 sleeps occur between 5 attempts; final attempt does not sleep again.
    expect(sleeps).toEqual([200, 400, 800, 1600])
  })

  test("throws after 5 failed attempts", () => {
    let calls = 0
    expect(() =>
      bindWithRetry({} as Parameters<typeof bindWithRetry>[0], {
        attempts: 5,
        backoffsMs: [1, 1, 1, 1, 1],
        serveFn: () => {
          calls++
          throw eaddrinuseError()
        },
        sleepFn: () => {},
      }),
    ).toThrow(/EADDRINUSE/)
    expect(calls).toBe(5)
  })

  test("rethrows non-EADDRINUSE errors immediately without retrying", () => {
    let calls = 0
    expect(() =>
      bindWithRetry({} as Parameters<typeof bindWithRetry>[0], {
        attempts: 5,
        backoffsMs: [1, 1, 1, 1, 1],
        serveFn: () => {
          calls++
          throw new Error("permission denied")
        },
        sleepFn: () => {},
      }),
    ).toThrow(/permission denied/)
    expect(calls).toBe(1)
  })
})

describe("flushOnCrash", () => {
  test("calls flushEventLog AND forceFlush in that order", () => {
    const calls: string[] = []
    flushOnCrash({
      flushEventLog: () => {
        calls.push("flushEventLog")
      },
      forceFlush: () => {
        calls.push("forceFlush")
      },
    })
    expect(calls).toEqual(["flushEventLog", "forceFlush"])
  })

  test("still calls forceFlush even if flushEventLog throws", () => {
    const calls: string[] = []
    expect(() =>
      flushOnCrash({
        flushEventLog: () => {
          calls.push("flushEventLog")
          throw new Error("boom")
        },
        forceFlush: () => {
          calls.push("forceFlush")
        },
      }),
    ).not.toThrow()
    expect(calls).toEqual(["flushEventLog", "forceFlush"])
  })
})
