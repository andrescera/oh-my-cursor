import { describe, it, expect } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import { createEmptyTaskDetector } from "./empty-task-detector"

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

describe("createEmptyTaskDetector", () => {
  describe("#given a fresh detector", () => {
    it("returns a handler function", () => {
      const handler = createEmptyTaskDetector()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#when status is completed", () => {
    describe("#then output is empty", () => {
      it("registers a high-priority finding with NO additional_context", () => {
        const collector = fakeCollector()
        const handler = createEmptyTaskDetector({ collector })

        const result = handler({ status: "completed", output: "", conversationId: "c1" })

        expect(result).not.toHaveProperty("additional_context")
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].conversationId).toBe("c1")
        expect(collector.calls[0].options.priority).toBe("high")
        expect(collector.calls[0].options.source).toBe("empty-task-detector")
        expect(collector.calls[0].options.content).toContain("empty/minimal output")
        expect(collector.calls[0].options.content).toContain("0 chars")
      })
    })

    describe("#then output is under 50 chars", () => {
      it("registers a finding mentioning the char count", () => {
        const collector = fakeCollector()
        const handler = createEmptyTaskDetector({ collector })

        handler({ status: "completed", output: "ok", conversationId: "c1" })

        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].options.content).toContain("empty/minimal output")
        expect(collector.calls[0].options.content).toContain("2 chars")
      })
    })

    describe("#then output is over 50 chars", () => {
      it("returns empty result and does not register", () => {
        const collector = fakeCollector()
        const handler = createEmptyTaskDetector({ collector })
        const longOutput = "x".repeat(51)

        const result = handler({ status: "completed", output: longOutput, conversationId: "c1" })

        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })
    })
  })

  describe("#when status is not completed", () => {
    it("returns empty result and does not register even with empty output", () => {
      const collector = fakeCollector()
      const handler = createEmptyTaskDetector({ collector })

      const result = handler({ status: "running", output: "", conversationId: "c1" })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })

    it("returns empty result and does not register with undefined output", () => {
      const collector = fakeCollector()
      const handler = createEmptyTaskDetector({ collector })

      const result = handler({ status: "failed", conversationId: "c1" })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when fields are missing", () => {
    it("handles undefined output gracefully for completed status", () => {
      const collector = fakeCollector()
      const handler = createEmptyTaskDetector({ collector })

      const result = handler({ status: "completed", conversationId: "c1" })

      expect(result).not.toHaveProperty("additional_context")
      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("0 chars")
    })
  })
})
