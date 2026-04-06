import { describe, test, expect, afterEach } from "bun:test"
import { existsSync, unlinkSync, readFileSync } from "node:fs"
import { createHeartbeatHandler, startHeartbeatWriter, HEARTBEAT_FILE } from "./heartbeat"

function cleanup(): void {
  try {
    if (existsSync(HEARTBEAT_FILE)) unlinkSync(HEARTBEAT_FILE)
  } catch {
    // best-effort
  }
}

describe("heartbeat", () => {
  afterEach(cleanup)

  describe("#given a heartbeat handler created with a known start time", () => {
    describe("#when the handler is called", () => {
      test("#then it returns alive status with uptime", () => {
        // given
        const startTime = Date.now() - 5000
        const handler = createHeartbeatHandler(startTime)

        // when
        const result = handler()

        // then
        expect(result.alive).toBe(true)
        expect(typeof result.timestamp).toBe("number")
        expect(result.timestamp).toBeGreaterThanOrEqual(startTime)
        expect(result.uptime).toBeGreaterThanOrEqual(5000)
      })
    })
  })

  describe("#given a heartbeat handler called multiple times", () => {
    describe("#when results are compared", () => {
      test("#then timestamps increase and uptime grows", () => {
        // given
        const startTime = Date.now() - 10_000
        const handler = createHeartbeatHandler(startTime)

        // when
        const first = handler()
        const second = handler()

        // then
        expect(second.timestamp).toBeGreaterThanOrEqual(first.timestamp)
        expect(second.uptime).toBeGreaterThanOrEqual(first.uptime)
      })
    })
  })

  describe("#given startHeartbeatWriter is called", () => {
    describe("#when the writer starts", () => {
      test("#then it writes a timestamp file immediately", () => {
        // given / when
        const interval = startHeartbeatWriter()

        // then
        try {
          expect(existsSync(HEARTBEAT_FILE)).toBe(true)
          const content = readFileSync(HEARTBEAT_FILE, "utf-8").trim()
          const ts = parseInt(content, 10)
          expect(isNaN(ts)).toBe(false)
          const age = Date.now() - ts
          expect(age).toBeLessThan(5000)
        } finally {
          clearInterval(interval)
        }
      })
    })
  })

  describe("#given startHeartbeatWriter returns an interval", () => {
    describe("#when the interval is cleared", () => {
      test("#then the heartbeat file still exists from the initial write", () => {
        // given
        const interval = startHeartbeatWriter()

        // when
        clearInterval(interval)

        // then
        expect(existsSync(HEARTBEAT_FILE)).toBe(true)
      })
    })
  })
})
