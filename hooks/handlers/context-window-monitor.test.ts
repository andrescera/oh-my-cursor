import { describe, it, expect } from "bun:test"
import type { ConversationState } from "../types"
import type { RegisterContextOptions } from "../context-collector"
import { createContextWindowMonitor } from "./context-window-monitor"

function stubConversation(
  estimatedTokens: number,
  tokenWarningEmitted: boolean,
): ConversationState {
  return { estimatedTokens, tokenWarningEmitted } as ConversationState
}

type RegisterCall = { conversationId: string; options: RegisterContextOptions }

function fakeCollector() {
  const calls: RegisterCall[] = []
  return {
    calls,
    register(conversationId: string, options: RegisterContextOptions) {
      calls.push({ conversationId, options })
    },
  }
}

describe("createContextWindowMonitor", () => {
  describe("#given a fresh monitor", () => {
    it("returns a handler function", () => {
      const handler = createContextWindowMonitor()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#when output is small", () => {
    it("does not register and never returns additional_context", () => {
      const collector = fakeCollector()
      const handler = createContextWindowMonitor({ collector })
      const conversation = stubConversation(0, false)

      const result = handler({ conversation, content: "short output", conversationId: "c1" })

      expect(result).toEqual({})
      expect(result).not.toHaveProperty("additional_context")
      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when cumulative tokens exceed 80% threshold", () => {
    it("registers a critical context-window finding and returns NO additional_context", () => {
      const collector = fakeCollector()
      const conversation = stubConversation(159_000, false)
      const handler = createContextWindowMonitor({ collector })

      // Add enough to push over: 1001 tokens = ~4004 chars
      const content = "x".repeat(4_004)
      const result = handler({ conversation, content, conversationId: "c1" })

      expect(result).not.toHaveProperty("additional_context")
      expect(collector.calls).toHaveLength(1)
      const { conversationId, options } = collector.calls[0]
      expect(conversationId).toBe("c1")
      expect(options.priority).toBe("critical")
      expect(options.source).toBe("context-window-monitor")
      expect(options.content).toContain("[context-window-warning]")
      expect(options.content).toContain("/summarize")
      expect(options.content).toContain("%")
    })

    it("registers the preemptive warning only once per session", () => {
      const collector = fakeCollector()
      const conversation = stubConversation(159_000, false)
      const handler = createContextWindowMonitor({ collector })
      const content = "x".repeat(4_004)

      handler({ conversation, content, conversationId: "c1" })
      handler({ conversation, content: "y", conversationId: "c1" })

      expect(collector.calls).toHaveLength(1)
    })
  })

  describe("#when multiple calls accumulate tokens", () => {
    it("tracks cumulative token usage across calls", () => {
      const collector = fakeCollector()
      const conversation = stubConversation(0, false)
      const handler = createContextWindowMonitor({ collector })

      // Each call adds chars / 4 tokens
      // 160k tokens threshold = 640k chars total needed
      const chunkSize = 160_000 // 40k tokens per call
      const chunk = "x".repeat(chunkSize)

      // Call 4 times = 160k tokens, exactly at threshold
      handler({ conversation, content: chunk, conversationId: "c1" })
      handler({ conversation, content: chunk, conversationId: "c1" })
      handler({ conversation, content: chunk, conversationId: "c1" })
      handler({ conversation, content: chunk, conversationId: "c1" })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("[context-window-warning]")

      handler({ conversation, content: chunk, conversationId: "c1" })
      expect(collector.calls).toHaveLength(1)
    })
  })

  describe("#when content is missing or empty", () => {
    it("handles undefined content gracefully without registering", () => {
      const collector = fakeCollector()
      const conversation = stubConversation(0, false)
      const handler = createContextWindowMonitor({ collector })

      const result = handler({ conversation, conversationId: "c1" })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })

    it("handles empty string content gracefully without registering", () => {
      const collector = fakeCollector()
      const conversation = stubConversation(0, false)
      const handler = createContextWindowMonitor({ collector })

      const result = handler({ conversation, content: "", conversationId: "c1" })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })
})
