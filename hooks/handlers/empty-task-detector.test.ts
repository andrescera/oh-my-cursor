import { describe, it, expect } from "bun:test"
import { createEmptyTaskDetector } from "./empty-task-detector"

describe("createEmptyTaskDetector", () => {
  describe("#given a fresh detector", () => {
    it("returns a handler function", () => {
      const handler = createEmptyTaskDetector()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#when status is completed", () => {
    describe("#then output is empty", () => {
      it("triggers a warning", () => {
        const handler = createEmptyTaskDetector()

        const result = handler({ status: "completed", output: "" })

        expect(result.additional_context).toBeDefined()
        expect(result.additional_context).toContain("empty/minimal output")
        expect(result.additional_context).toContain("0 chars")
      })
    })

    describe("#then output is under 50 chars", () => {
      it("triggers a warning", () => {
        const handler = createEmptyTaskDetector()

        const result = handler({ status: "completed", output: "ok" })

        expect(result.additional_context).toBeDefined()
        expect(result.additional_context).toContain("empty/minimal output")
        expect(result.additional_context).toContain("2 chars")
      })
    })

    describe("#then output is over 50 chars", () => {
      it("returns empty result", () => {
        const handler = createEmptyTaskDetector()
        const longOutput = "x".repeat(51)

        const result = handler({ status: "completed", output: longOutput })

        expect(result).toEqual({})
      })
    })
  })

  describe("#when status is not completed", () => {
    it("returns empty result even with empty output", () => {
      const handler = createEmptyTaskDetector()

      const result = handler({ status: "running", output: "" })

      expect(result).toEqual({})
    })

    it("returns empty result with undefined output", () => {
      const handler = createEmptyTaskDetector()

      const result = handler({ status: "failed" })

      expect(result).toEqual({})
    })
  })

  describe("#when fields are missing", () => {
    it("handles undefined output gracefully for completed status", () => {
      const handler = createEmptyTaskDetector()

      const result = handler({ status: "completed" })

      expect(result.additional_context).toBeDefined()
      expect(result.additional_context).toContain("0 chars")
    })
  })
})
