import { describe, expect, test } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import { createToolOutputTruncator } from "./tool-output-truncator"

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

describe("tool-output-truncator", () => {
  describe("#given createToolOutputTruncator", () => {
    test("returns a handler function", () => {
      const handler = createToolOutputTruncator()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#given output within limit", () => {
    describe("#when output is short", () => {
      test("#then returns empty object and does not register", () => {
        const collector = fakeCollector()
        const handler = createToolOutputTruncator({ collector })
        const result = handler({ output: "short output", conversationId: "c1" })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })
    })

    describe("#when output is exactly 30000 chars", () => {
      test("#then returns empty object and does not register", () => {
        const collector = fakeCollector()
        const handler = createToolOutputTruncator({ collector })
        const result = handler({ output: "x".repeat(30_000), conversationId: "c1" })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })
    })
  })

  describe("#given output exceeding limit", () => {
    describe("#when output is 30001 chars", () => {
      test("#then truncates with separator and never returns additional_context", () => {
        const collector = fakeCollector()
        const handler = createToolOutputTruncator({ collector })
        const output = "A".repeat(15_000) + "B".repeat(15_001)
        const result = handler({ output, conversationId: "c1" })
        expect(result).not.toHaveProperty("additional_context")
        expect(result.modified_output).toBeDefined()
        expect((result.modified_output as string)).toContain("TRUNCATED:")
        expect((result.modified_output as string)).toContain(`${output.length} chars total`)
      })

      test("#then registers a normal-priority truncation advisory", () => {
        const collector = fakeCollector()
        const handler = createToolOutputTruncator({ collector })
        const output = "A".repeat(15_000) + "B".repeat(15_001)
        handler({ output, conversationId: "c1" })
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].conversationId).toBe("c1")
        expect(collector.calls[0].options.priority).toBe("normal")
        expect(collector.calls[0].options.source).toBe("tool-output-truncator")
        expect(collector.calls[0].options.content).toContain("truncated from")
        expect(collector.calls[0].options.content).toContain(`${output.length}`)
      })
    })

    describe("#when output is large", () => {
      test("#then preserves first 10000 chars", () => {
        const handler = createToolOutputTruncator({ collector: fakeCollector() })
        const head = "H".repeat(10_000)
        const rest = "T".repeat(25_000)
        const result = handler({ output: head + rest, conversationId: "c1" })
        expect((result.modified_output as string).startsWith(head)).toBe(true)
      })

      test("#then preserves last 10000 chars", () => {
        const handler = createToolOutputTruncator({ collector: fakeCollector() })
        const front = "F".repeat(25_000)
        const tail = "L".repeat(10_000)
        const result = handler({ output: front + tail, conversationId: "c1" })
        expect((result.modified_output as string).endsWith(tail)).toBe(true)
      })

      test("#then includes char count in separator", () => {
        const handler = createToolOutputTruncator({ collector: fakeCollector() })
        const output = "x".repeat(50_000)
        const result = handler({ output, conversationId: "c1" })
        expect((result.modified_output as string)).toContain("50000 chars total")
        expect((result.modified_output as string)).toContain("first 10k + last 10k")
      })
    })
  })

  describe("#given missing or empty output", () => {
    test("#then returns empty for missing output", () => {
      const collector = fakeCollector()
      const handler = createToolOutputTruncator({ collector })
      const result = handler({ conversationId: "c1" })
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })

    test("#then returns empty for empty string output", () => {
      const collector = fakeCollector()
      const handler = createToolOutputTruncator({ collector })
      const result = handler({ output: "", conversationId: "c1" })
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })

    test("#then returns empty for undefined output", () => {
      const collector = fakeCollector()
      const handler = createToolOutputTruncator({ collector })
      const result = handler({ output: undefined, conversationId: "c1" })
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })
})
