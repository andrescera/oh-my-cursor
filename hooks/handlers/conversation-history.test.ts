import { describe, it, expect } from "bun:test"
import { createConversationHistoryHandler } from "./conversation-history"
import type { ConversationState } from "../types"

function makeConversation(id: string, overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    id,
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    env: {},
    dispatchCounts: {},
    dispatchCountsThisTurn: {},
    contextHistory: overrides.contextHistory ?? [],
    readPaths: new Set(),
    injectedPaths: new Set(),
    pendingWriteArgs: new Map(),
    toolCallCount: overrides.toolCallCount ?? 0,
    reminderInjected: false,
    recentToolTrail: [],
    toolCallsSinceTaskDispatch: 0,
    ralphState: null,
    boulderState: null,
    stoppedAt: overrides.stoppedAt ?? null,
    errorCount: overrides.errorCount ?? 0,
    lastCompactionEpoch: 0,
    compactionSnapshot: null,
    activePlan: null,
    todoStates: new Map(),
    continuationCooldownUntil: null,
    consecutiveContinuationFailures: 0,
    lastTodoSnapshot: "",
    momusIterations: 0,
    composerMode: null,
    abortDetectedAt: null,
    subagentOutcomes: [],
    subagentFailureCounts: {},
    delegateRetryState: {},
  }
}

describe("createConversationHistoryHandler", () => {
  describe("#given an empty conversation map", () => {
    describe("#when listing all conversations", () => {
      it("returns empty array", () => {
        const handler = createConversationHistoryHandler(new Map())

        const result = handler({})

        expect(result).toEqual({ conversations: [] })
      })
    })
  })

  describe("#given a single conversation", () => {
    describe("#when listing all conversations", () => {
      it("returns one summary", () => {
        const conversations = new Map([["s1", makeConversation("s1", { toolCallCount: 5 })]])
        const handler = createConversationHistoryHandler(conversations)

        const result = handler({}) as { conversations: { id: string; toolCount: number }[] }

        expect(result.conversations).toHaveLength(1)
        expect(result.conversations[0].id).toBe("s1")
        expect(result.conversations[0].toolCount).toBe(5)
      })
    })
  })

  describe("#given multiple conversations", () => {
    describe("#when listing all conversations", () => {
      it("returns conversations sorted most recent first", () => {
        const conversations = new Map([
          ["s1", makeConversation("s1", { startedAt: "2026-01-01T00:00:00Z" })],
          ["s2", makeConversation("s2", { startedAt: "2026-01-03T00:00:00Z" })],
          ["s3", makeConversation("s3", { startedAt: "2026-01-02T00:00:00Z" })],
        ])
        const handler = createConversationHistoryHandler(conversations)

        const result = handler({}) as { conversations: { id: string }[] }

        expect(result.conversations.map((s) => s.id)).toEqual(["s2", "s3", "s1"])
      })
    })
  })

  describe("#given more than 20 conversations", () => {
    describe("#when listing all conversations", () => {
      it("caps results at 20", () => {
        const conversations = new Map<string, ConversationState>()
        for (let i = 0; i < 25; i++) {
          conversations.set(`s${i}`, makeConversation(`s${i}`))
        }
        const handler = createConversationHistoryHandler(conversations)

        const result = handler({}) as { conversations: unknown[] }

        expect(result.conversations).toHaveLength(20)
      })
    })
  })

  describe("#given conversations with context history", () => {
    describe("#when querying with a search term", () => {
      it("returns only conversations matching the query", () => {
        const conversations = new Map([
          ["s1", makeConversation("s1", { contextHistory: ["deployed to production"] })],
          ["s2", makeConversation("s2", { contextHistory: ["ran unit tests"] })],
          ["s3", makeConversation("s3", { contextHistory: ["fixed production bug"] })],
        ])
        const handler = createConversationHistoryHandler(conversations)

        const result = handler({ query: "production" }) as { conversations: { id: string }[] }

        expect(result.conversations).toHaveLength(2)
        const ids = result.conversations.map((s) => s.id)
        expect(ids).toContain("s1")
        expect(ids).toContain("s3")
      })

      it("matches case-insensitively", () => {
        const conversations = new Map([
          ["s1", makeConversation("s1", { contextHistory: ["Deployed to PRODUCTION"] })],
        ])
        const handler = createConversationHistoryHandler(conversations)

        const result = handler({ query: "production" }) as { conversations: { id: string }[] }

        expect(result.conversations).toHaveLength(1)
      })

      it("returns empty when no conversations match", () => {
        const conversations = new Map([
          ["s1", makeConversation("s1", { contextHistory: ["ran tests"] })],
        ])
        const handler = createConversationHistoryHandler(conversations)

        const result = handler({ query: "deploy" }) as { conversations: unknown[] }

        expect(result.conversations).toHaveLength(0)
      })
    })
  })

  describe("#given a specific conversation id", () => {
    describe("#when conversation exists", () => {
      it("returns full conversation detail", () => {
        const conversations = new Map([
          ["s1", makeConversation("s1", {
            toolCallCount: 12,
            contextHistory: ["step1", "step2"],
            errorCount: 2,
            stoppedAt: "2026-01-01T01:00:00Z",
          })],
        ])
        const handler = createConversationHistoryHandler(conversations)

        const result = handler({ session_id: "s1" }) as Record<string, unknown>

        expect(result.id).toBe("s1")
        expect(result.toolCount).toBe(12)
        expect(result.contextHistory).toEqual(["step1", "step2"])
        expect(result.errorCount).toBe(2)
        expect(result.stoppedAt).toBe("2026-01-01T01:00:00Z")
      })
    })

    describe("#when conversation does not exist", () => {
      it("returns error", () => {
        const handler = createConversationHistoryHandler(new Map())

        const result = handler({ session_id: "nonexistent" })

        expect(result.error).toBe("session_not_found")
        expect(result.session_id).toBe("nonexistent")
      })
    })
  })
})
