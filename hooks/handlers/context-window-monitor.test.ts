import { describe, it, expect } from "bun:test"
import type { ConversationState } from "../types"
import { createContextWindowMonitor } from "./context-window-monitor"

function stubConversation(
  estimatedTokens: number,
  tokenWarningEmitted: boolean,
): ConversationState {
  return { estimatedTokens, tokenWarningEmitted } as ConversationState
}

describe("createContextWindowMonitor", () => {
  describe("#given a fresh monitor", () => {
    it("returns a handler function", () => {
      const handler = createContextWindowMonitor()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#when output is small", () => {
    it("does not trigger a warning", () => {
      const handler = createContextWindowMonitor()
      const conversation = stubConversation(0, false)

      const result = handler({ conversation, content: "short output" })

      expect(result).toEqual({})
    })
  })

  describe("#when cumulative tokens exceed 80% threshold", () => {
    it("triggers a warning with percentage", () => {
      const conversation = stubConversation(159_000, false)
      const handler = createContextWindowMonitor()

      // Add enough to push over: 1001 tokens = ~4004 chars
      const content = "x".repeat(4_004)
      const result = handler({ conversation, content })

      expect(result.additional_context).toBeDefined()
      expect(result.additional_context).toContain("[context-window-warning]")
      expect(result.additional_context).toContain("/summarize")
      expect(result.additional_context).toContain("%")
    })

    it("emits the preemptive warning only once per session", () => {
      const conversation = stubConversation(159_000, false)
      const handler = createContextWindowMonitor()
      const content = "x".repeat(4_004)

      expect(handler({ conversation, content }).additional_context).toBeDefined()
      expect(handler({ conversation, content: "y" })).toEqual({})
    })
  })

  describe("#when multiple calls accumulate tokens", () => {
    it("tracks cumulative token usage across calls", () => {
      const conversation = stubConversation(0, false)
      const handler = createContextWindowMonitor()

      // Each call adds chars / 4 tokens
      // 160k tokens threshold = 640k chars total needed
      const chunkSize = 160_000 // 40k tokens per call
      const chunk = "x".repeat(chunkSize)

      // Call 4 times = 160k tokens, exactly at threshold
      handler({ conversation, content: chunk })
      handler({ conversation, content: chunk })
      handler({ conversation, content: chunk })
      const result = handler({ conversation, content: chunk })

      expect(result.additional_context).toBeDefined()
      expect(result.additional_context).toContain("[context-window-warning]")
      expect(handler({ conversation, content: chunk })).toEqual({})
    })
  })

  describe("#when content is missing or empty", () => {
    it("handles undefined content gracefully", () => {
      const conversation = stubConversation(0, false)
      const handler = createContextWindowMonitor()

      const result = handler({ conversation })

      expect(result).toEqual({})
    })

    it("handles empty string content gracefully", () => {
      const conversation = stubConversation(0, false)
      const handler = createContextWindowMonitor()

      const result = handler({ conversation, content: "" })

      expect(result).toEqual({})
    })
  })
})
