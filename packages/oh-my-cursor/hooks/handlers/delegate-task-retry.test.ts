import { describe, it, expect } from "bun:test"
import { createDelegateTaskRetry } from "./delegate-task-retry"

describe("createDelegateTaskRetry", () => {
  describe("#given a fresh retry handler", () => {
    it("returns a handler function", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)
      expect(typeof handler).toBe("function")
    })
  })

  describe("#when first failure occurs", () => {
    it("increments count and returns empty result", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: task failed",
      })

      expect(failureCounts.get("explore")).toBe(1)
      expect(result).toEqual({})
    })
  })

  describe("#when second failure occurs", () => {
    it("returns suggestion message", () => {
      const failureCounts = new Map<string, number>()
      failureCounts.set("explore", 1)
      const handler = createDelegateTaskRetry(failureCounts)

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: task failed again",
      })

      expect(failureCounts.get("explore")).toBe(2)
      expect(result.additional_context).toContain("failed 2 times")
      expect(result.additional_context).toContain("Consider")
    })
  })

  describe("#when fourth failure occurs", () => {
    it("returns escalation message", () => {
      const failureCounts = new Map<string, number>()
      failureCounts.set("explore", 3)
      const handler = createDelegateTaskRetry(failureCounts)

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: task failed yet again",
      })

      expect(failureCounts.get("explore")).toBe(4)
      expect(result.additional_context).toContain("failed 4 times")
      expect(result.additional_context).toContain("escalating to user")
    })
  })

  describe("#when output indicates success", () => {
    it("does not increment failure count", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Task completed successfully with results",
      })

      expect(failureCounts.has("explore")).toBe(false)
      expect(result).toEqual({})
    })
  })

  describe("#when different agent types fail", () => {
    it("tracks each agent type independently", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)

      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: explore failed",
      })
      handler({
        tool_input: { subagent_type: "shell" },
        output: "Error: shell failed",
      })
      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: explore failed again",
      })

      expect(failureCounts.get("explore")).toBe(2)
      expect(failureCounts.get("shell")).toBe(1)
    })
  })

  describe("#when tool_input uses description fallback", () => {
    it("extracts agent type from description", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)

      handler({
        tool_input: { description: "search codebase" },
        output: "Error: failed to search",
      })

      expect(failureCounts.get("search codebase")).toBe(1)
    })
  })

  describe("#when output is missing", () => {
    it("returns empty result without incrementing", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)

      const result = handler({
        tool_input: { subagent_type: "explore" },
      })

      expect(failureCounts.has("explore")).toBe(false)
      expect(result).toEqual({})
    })
  })
})
