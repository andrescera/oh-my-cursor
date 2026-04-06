import { describe, expect, test } from "bun:test"
import { createToolOutputTruncator } from "./tool-output-truncator"

describe("tool-output-truncator", () => {
  describe("#given createToolOutputTruncator", () => {
    test("returns a handler function", () => {
      const handler = createToolOutputTruncator()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#given output within limit", () => {
    const handler = createToolOutputTruncator()

    describe("#when output is short", () => {
      test("#then returns empty object", () => {
        const result = handler({ output: "short output" })
        expect(result).toEqual({})
      })
    })

    describe("#when output is exactly 30000 chars", () => {
      test("#then returns empty object", () => {
        const result = handler({ output: "x".repeat(30_000) })
        expect(result).toEqual({})
      })
    })
  })

  describe("#given output exceeding limit", () => {
    const handler = createToolOutputTruncator()

    describe("#when output is 30001 chars", () => {
      test("#then truncates with separator", () => {
        const output = "A".repeat(15_000) + "B".repeat(15_001)
        const result = handler({ output })
        expect(result.modified_output).toBeDefined()
        expect((result.modified_output as string)).toContain("TRUNCATED:")
        expect((result.modified_output as string)).toContain(`${output.length} chars total`)
      })
    })

    describe("#when output is large", () => {
      test("#then preserves first 10000 chars", () => {
        const head = "H".repeat(10_000)
        const rest = "T".repeat(25_000)
        const result = handler({ output: head + rest })
        expect((result.modified_output as string).startsWith(head)).toBe(true)
      })

      test("#then preserves last 10000 chars", () => {
        const front = "F".repeat(25_000)
        const tail = "L".repeat(10_000)
        const result = handler({ output: front + tail })
        expect((result.modified_output as string).endsWith(tail)).toBe(true)
      })

      test("#then includes char count in separator", () => {
        const output = "x".repeat(50_000)
        const result = handler({ output })
        expect((result.modified_output as string)).toContain("50000 chars total")
        expect((result.modified_output as string)).toContain("first 10k + last 10k")
      })
    })
  })

  describe("#given missing or empty output", () => {
    const handler = createToolOutputTruncator()

    test("#then returns empty for missing output", () => {
      const result = handler({})
      expect(result).toEqual({})
    })

    test("#then returns empty for empty string output", () => {
      const result = handler({ output: "" })
      expect(result).toEqual({})
    })

    test("#then returns empty for undefined output", () => {
      const result = handler({ output: undefined })
      expect(result).toEqual({})
    })
  })
})
