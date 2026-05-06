import { describe, expect, test } from "bun:test"

import { spawnWithTimeout } from "./spawn-with-timeout"

describe("spawnWithTimeout", () => {
  test("returns immediately when child exits before timeout", async () => {
    const result = await spawnWithTimeout(["echo", "hello"], { timeoutMs: 5000 })
    expect(result.timedOut).toBe(false)
    expect(result.stdout).toContain("hello")
    expect(result.exitCode).toBe(0)
    expect(result.durationMs).toBeLessThan(1000)
  })

  test("timedOut: true when child sleeps past timeoutMs", async () => {
    const result = await spawnWithTimeout(["sleep", "10"], { timeoutMs: 200 })
    expect(result.timedOut).toBe(true)
    expect(result.durationMs).toBeGreaterThanOrEqual(150)
    expect(result.durationMs).toBeLessThan(2000)
  })

  test("output cap: stdout truncated to maxOutputBytes", async () => {
    const result = await spawnWithTimeout(["yes"], {
      timeoutMs: 500,
      maxOutputBytes: 512,
    })
    expect(result.timedOut).toBe(true)
    expect(result.stdout.length).toBeLessThan(4096)
  })

  test("external abort: aborting before completion kills child", async () => {
    const controller = new AbortController()
    const promise = spawnWithTimeout(["sleep", "10"], {
      timeoutMs: 5000,
      signal: controller.signal,
    })
    await new Promise((r) => setTimeout(r, 100))
    controller.abort()
    const result = await promise
    expect(result.timedOut === true || result.exitCode !== 0).toBe(true)
    expect(result.durationMs).toBeLessThan(2000)
  })

  test("failure: spawning /no/such/bin rejects", async () => {
    await expect(
      spawnWithTimeout(["/no/such/bin"], { timeoutMs: 1000 }),
    ).rejects.toThrow()
  })
})
