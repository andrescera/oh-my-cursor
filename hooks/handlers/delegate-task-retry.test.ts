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

  describe("error type classification", () => {
    const cases: Array<{
      label: string
      output: string
      expectedAdvice: string
    }> = [
      {
        label: "rate_limit",
        output: "HTTP 429 too many requests — rate limit exceeded",
        expectedAdvice: "Rate limit hit. Wait 30s",
      },
      {
        label: "model_unavailable",
        output: "Error: model_not_supported for this request",
        expectedAdvice: "Model not available. Retry with model: 'fast' parameter.",
      },
      {
        label: "timeout",
        output: "The subagent timed out after 120s",
        expectedAdvice: "Task timed out. Break into smaller subtasks.",
      },
      {
        label: "generic",
        output: "Something failed with exception in worker",
        expectedAdvice: "Task failed. Resume the same agent ID",
      },
    ]

    for (const { label, output, expectedAdvice } of cases) {
      it(`classifies ${label} and returns matching advice`, () => {
        const failureCounts = new Map<string, number>()
        const handler = createDelegateTaskRetry(failureCounts)

        const result = handler({
          tool_input: { subagent_type: "explore" },
          output,
        })

        expect(result.additional_context).toContain(expectedAdvice)
        expect(failureCounts.get("explore")).toBe(1)
      })
    }

    it("returns empty when output matches no error pattern", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Task completed successfully with results",
      })

      expect(result).toEqual({})
      expect(failureCounts.has("explore")).toBe(false)
    })
  })

  describe("HTTP status hints in output", () => {
    it("treats 429 as rate_limit", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)
      const result = handler({
        tool_input: { subagent_type: "x" },
        output: "upstream returned status 429",
      })
      expect(result.additional_context).toContain("Rate limit hit")
    })

    it("treats 504 as timeout", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)
      const result = handler({
        tool_input: { subagent_type: "x" },
        output: "gateway 504 Gateway Timeout",
      })
      expect(result.additional_context).toContain("Task timed out")
    })

    for (const code of [500, 502, 503] as const) {
      it(`treats ${code} as generic error`, () => {
        const failureCounts = new Map<string, number>()
        const handler = createDelegateTaskRetry(failureCounts)
        const result = handler({
          tool_input: { subagent_type: "x" },
          output: `server error ${code}`,
        })
        expect(result.additional_context).toContain("Task failed. Resume the same agent ID")
      })
    }
  })

  describe("model-switching advice on model errors", () => {
    it("includes fast model retry guidance for model_unavailable", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)
      const result = handler({
        tool_input: { subagent_type: "worker" },
        output: "model unavailable for subagent_type shell",
      })
      expect(result.additional_context).toContain("'fast' parameter")
    })
  })

  describe("agent-switching advice after consecutive failures", () => {
    it("suggests switching subagent after second failure for same agent type", () => {
      const failureCounts = new Map<string, number>()
      const handler = createDelegateTaskRetry(failureCounts)

      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: first failure",
      })
      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: second failure",
      })

      expect(failureCounts.get("explore")).toBe(2)
      expect(result.additional_context).toContain("Consider switching to a different subagent_type")
    })

    it("escalates when same agent type fails more than three times", () => {
      const failureCounts = new Map<string, number>()
      failureCounts.set("explore", 3)
      const handler = createDelegateTaskRetry(failureCounts)

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: fourth failure",
      })

      expect(failureCounts.get("explore")).toBe(4)
      expect(result.additional_context).toContain("explore")
      expect(result.additional_context).toContain("failed 4 times")
      expect(result.additional_context).toContain("escalating to user")
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
})
