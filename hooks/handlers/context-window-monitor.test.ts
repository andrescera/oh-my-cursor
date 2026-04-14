import { describe, it, expect } from "bun:test"
import { createContextWindowMonitor, type ContextWindowSessionEntry } from "./context-window-monitor"

describe("createContextWindowMonitor", () => {
  describe("#given a fresh monitor", () => {
    it("returns a handler function", () => {
      const sessionTokens = new Map<string, ContextWindowSessionEntry>()
      const handler = createContextWindowMonitor(sessionTokens)
      expect(typeof handler).toBe("function")
    })
  })

  describe("#when output is small", () => {
    it("does not trigger a warning", () => {
      const sessionTokens = new Map<string, ContextWindowSessionEntry>()
      const handler = createContextWindowMonitor(sessionTokens)

      const result = handler({ sessionId: "s1", content: "short output" })

      expect(result).toEqual({})
    })
  })

  describe("#when cumulative tokens exceed 80% threshold", () => {
    it("triggers a warning with percentage", () => {
      const sessionTokens = new Map<string, ContextWindowSessionEntry>()
      // Pre-seed with tokens just below threshold: 200k * 0.8 = 160k tokens
      // We need 160k tokens worth of chars already counted
      sessionTokens.set("s1", { tokens: 159_000, preemptiveWarningEmitted: false })
      const handler = createContextWindowMonitor(sessionTokens)

      // Add enough to push over: 1001 tokens = ~4004 chars
      const content = "x".repeat(4_004)
      const result = handler({ sessionId: "s1", content })

      expect(result.additional_context).toBeDefined()
      expect(result.additional_context).toContain("[context-window-warning]")
      expect(result.additional_context).toContain("/summarize")
      expect(result.additional_context).toContain("%")
    })

    it("emits the preemptive warning only once per session", () => {
      const sessionTokens = new Map<string, ContextWindowSessionEntry>()
      sessionTokens.set("s1", { tokens: 159_000, preemptiveWarningEmitted: false })
      const handler = createContextWindowMonitor(sessionTokens)
      const content = "x".repeat(4_004)

      expect(handler({ sessionId: "s1", content }).additional_context).toBeDefined()
      expect(handler({ sessionId: "s1", content: "y" })).toEqual({})
    })
  })

  describe("#when multiple calls accumulate tokens", () => {
    it("tracks cumulative token usage across calls", () => {
      const sessionTokens = new Map<string, ContextWindowSessionEntry>()
      const handler = createContextWindowMonitor(sessionTokens)

      // Each call adds chars / 4 tokens
      // 160k tokens threshold = 640k chars total needed
      const chunkSize = 160_000 // 40k tokens per call
      const chunk = "x".repeat(chunkSize)

      // Call 4 times = 160k tokens, exactly at threshold
      handler({ sessionId: "s1", content: chunk })
      handler({ sessionId: "s1", content: chunk })
      handler({ sessionId: "s1", content: chunk })
      const result = handler({ sessionId: "s1", content: chunk })

      expect(result.additional_context).toBeDefined()
      expect(result.additional_context).toContain("[context-window-warning]")
      expect(handler({ sessionId: "s1", content: chunk })).toEqual({})
    })
  })

  describe("#when content is missing or empty", () => {
    it("handles undefined content gracefully", () => {
      const sessionTokens = new Map<string, ContextWindowSessionEntry>()
      const handler = createContextWindowMonitor(sessionTokens)

      const result = handler({ sessionId: "s1" })

      expect(result).toEqual({})
    })

    it("handles empty string content gracefully", () => {
      const sessionTokens = new Map<string, ContextWindowSessionEntry>()
      const handler = createContextWindowMonitor(sessionTokens)

      const result = handler({ sessionId: "s1", content: "" })

      expect(result).toEqual({})
    })
  })
})
