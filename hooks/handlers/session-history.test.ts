import { describe, it, expect } from "bun:test"
import { createSessionHistoryHandler } from "./session-history"
import type { SessionState } from "../types"

function makeSession(id: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    id,
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    env: {},
    dispatchCounts: {},
    contextHistory: overrides.contextHistory ?? [],
    readPaths: new Set(),
    injectedPaths: new Set(),
    pendingWriteArgs: new Map(),
    toolCallCount: overrides.toolCallCount ?? 0,
    reminderInjected: false,
    ralphState: null,
    boulderState: null,
    stoppedAt: overrides.stoppedAt ?? null,
    errorCount: overrides.errorCount ?? 0,
    lastCompactionEpoch: 0,
    compactionSnapshot: null,
  }
}

describe("createSessionHistoryHandler", () => {
  describe("#given an empty session map", () => {
    describe("#when listing all sessions", () => {
      it("returns empty array", () => {
        const handler = createSessionHistoryHandler(new Map())

        const result = handler({})

        expect(result).toEqual({ sessions: [] })
      })
    })
  })

  describe("#given a single session", () => {
    describe("#when listing all sessions", () => {
      it("returns one summary", () => {
        const sessions = new Map([["s1", makeSession("s1", { toolCallCount: 5 })]])
        const handler = createSessionHistoryHandler(sessions)

        const result = handler({}) as { sessions: { id: string; toolCount: number }[] }

        expect(result.sessions).toHaveLength(1)
        expect(result.sessions[0].id).toBe("s1")
        expect(result.sessions[0].toolCount).toBe(5)
      })
    })
  })

  describe("#given multiple sessions", () => {
    describe("#when listing all sessions", () => {
      it("returns sessions sorted most recent first", () => {
        const sessions = new Map([
          ["s1", makeSession("s1", { startedAt: "2026-01-01T00:00:00Z" })],
          ["s2", makeSession("s2", { startedAt: "2026-01-03T00:00:00Z" })],
          ["s3", makeSession("s3", { startedAt: "2026-01-02T00:00:00Z" })],
        ])
        const handler = createSessionHistoryHandler(sessions)

        const result = handler({}) as { sessions: { id: string }[] }

        expect(result.sessions.map((s) => s.id)).toEqual(["s2", "s3", "s1"])
      })
    })
  })

  describe("#given more than 20 sessions", () => {
    describe("#when listing all sessions", () => {
      it("caps results at 20", () => {
        const sessions = new Map<string, SessionState>()
        for (let i = 0; i < 25; i++) {
          sessions.set(`s${i}`, makeSession(`s${i}`))
        }
        const handler = createSessionHistoryHandler(sessions)

        const result = handler({}) as { sessions: unknown[] }

        expect(result.sessions).toHaveLength(20)
      })
    })
  })

  describe("#given sessions with context history", () => {
    describe("#when querying with a search term", () => {
      it("returns only sessions matching the query", () => {
        const sessions = new Map([
          ["s1", makeSession("s1", { contextHistory: ["deployed to production"] })],
          ["s2", makeSession("s2", { contextHistory: ["ran unit tests"] })],
          ["s3", makeSession("s3", { contextHistory: ["fixed production bug"] })],
        ])
        const handler = createSessionHistoryHandler(sessions)

        const result = handler({ query: "production" }) as { sessions: { id: string }[] }

        expect(result.sessions).toHaveLength(2)
        const ids = result.sessions.map((s) => s.id)
        expect(ids).toContain("s1")
        expect(ids).toContain("s3")
      })

      it("matches case-insensitively", () => {
        const sessions = new Map([
          ["s1", makeSession("s1", { contextHistory: ["Deployed to PRODUCTION"] })],
        ])
        const handler = createSessionHistoryHandler(sessions)

        const result = handler({ query: "production" }) as { sessions: { id: string }[] }

        expect(result.sessions).toHaveLength(1)
      })

      it("returns empty when no sessions match", () => {
        const sessions = new Map([
          ["s1", makeSession("s1", { contextHistory: ["ran tests"] })],
        ])
        const handler = createSessionHistoryHandler(sessions)

        const result = handler({ query: "deploy" }) as { sessions: unknown[] }

        expect(result.sessions).toHaveLength(0)
      })
    })
  })

  describe("#given a specific session id", () => {
    describe("#when session exists", () => {
      it("returns full session detail", () => {
        const sessions = new Map([
          ["s1", makeSession("s1", {
            toolCallCount: 12,
            contextHistory: ["step1", "step2"],
            errorCount: 2,
            stoppedAt: "2026-01-01T01:00:00Z",
          })],
        ])
        const handler = createSessionHistoryHandler(sessions)

        const result = handler({ session_id: "s1" }) as Record<string, unknown>

        expect(result.id).toBe("s1")
        expect(result.toolCount).toBe(12)
        expect(result.contextHistory).toEqual(["step1", "step2"])
        expect(result.errorCount).toBe(2)
        expect(result.stoppedAt).toBe("2026-01-01T01:00:00Z")
      })
    })

    describe("#when session does not exist", () => {
      it("returns error", () => {
        const handler = createSessionHistoryHandler(new Map())

        const result = handler({ session_id: "nonexistent" })

        expect(result.error).toBe("session_not_found")
        expect(result.session_id).toBe("nonexistent")
      })
    })
  })
})
