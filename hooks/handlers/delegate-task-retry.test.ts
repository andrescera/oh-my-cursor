import { describe, it, expect } from "bun:test"
import { createDelegateTaskRetry } from "./delegate-task-retry"

describe("createDelegateTaskRetry", () => {
  describe("#given a fresh retry handler", () => {
    it("returns a handler function", () => {
      const handler = createDelegateTaskRetry()
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
        expectedAdvice: "Rate limit hit. Wait 30s then retry. If persistent, try model: 'fast' parameter.",
      },
      {
        label: "model_unavailable",
        output: "Error: model_not_supported for this request",
        expectedAdvice: "Model not available. Retry with model: 'fast'. If using sisyphus, consider sisyphus-junior as fallback.",
      },
      {
        label: "timeout",
        output: "The subagent timed out after 120s",
        expectedAdvice: "Task timed out. Break into smaller subtasks or retry with a simpler agent type.",
      },
      {
        label: "generic",
        output: "Something failed with exception in worker",
        expectedAdvice: "Task failed. Resume the same agent ID with fix context. After 3 failures, escalate to user.",
      },
    ]

    for (const { label, output, expectedAdvice } of cases) {
      it(`classifies ${label} and returns matching advice`, () => {
        const delegateRetryState: Record<string, number> = {}
        const handler = createDelegateTaskRetry()

        const result = handler({
          tool_input: { subagent_type: "explore" },
          output,
        }, delegateRetryState)

        expect(result.additional_context).toContain(expectedAdvice)
        expect(delegateRetryState["explore"]).toBe(1)
      })
    }

    it("returns empty when output matches no error pattern", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Task completed successfully with results",
      }, delegateRetryState)

      expect(result).toEqual({})
      expect("explore" in delegateRetryState).toBe(false)
    })
  })

  describe("HTTP status hints in output", () => {
    it("treats 429 as rate_limit", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()
      const result = handler({
        tool_input: { subagent_type: "x" },
        output: "upstream returned status 429",
      }, delegateRetryState)
      expect(result.additional_context).toContain("Rate limit hit")
    })

    it("treats 504 as timeout", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()
      const result = handler({
        tool_input: { subagent_type: "x" },
        output: "gateway 504 Gateway Timeout",
      }, delegateRetryState)
      expect(result.additional_context).toContain("Task timed out")
    })

    for (const code of [500, 502, 503] as const) {
      it(`treats ${code} as generic error`, () => {
        const delegateRetryState: Record<string, number> = {}
        const handler = createDelegateTaskRetry()
        const result = handler({
          tool_input: { subagent_type: "x" },
          output: `server error ${code}`,
        }, delegateRetryState)
        expect(result.additional_context).toContain(
          "Task failed. Resume the same agent ID with fix context. After 3 failures, escalate to user.",
        )
      })
    }
  })

  describe("model-switching advice on model errors", () => {
    it("includes fast model retry guidance for model_unavailable", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()
      const result = handler({
        tool_input: { subagent_type: "worker" },
        output: "model unavailable for subagent_type shell",
      }, delegateRetryState)
      expect(result.additional_context).toContain("Retry with model: 'fast'")
    })

    it("after two model_unavailable errors for same agent type, advises switching subagent_type entirely", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()
      handler(
        {
          tool_input: { subagent_type: "hephaestus" },
          output: "model unavailable for requested worker",
        },
        delegateRetryState,
      )
      const result = handler(
        {
          tool_input: { subagent_type: "hephaestus" },
          output: "Error: model_not_supported",
        },
        delegateRetryState,
      )
      expect(result.additional_context).toContain(
        "switch to a different subagent_type entirely",
      )
      expect(result.additional_context).not.toContain("Consider switching to a different subagent_type")
    })
  })

  describe("agent-switching advice after consecutive failures", () => {
    it("suggests switching subagent after second failure for same agent type", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()

      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: first failure",
      }, delegateRetryState)
      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: second failure",
      }, delegateRetryState)

      expect(delegateRetryState["explore"]).toBe(2)
      expect(result.additional_context).toContain("Consider switching to a different subagent_type")
    })

    it("escalates when same agent type fails more than three times", () => {
      const delegateRetryState: Record<string, number> = {}
      delegateRetryState["explore"] = 3
      const handler = createDelegateTaskRetry()

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: fourth failure",
      }, delegateRetryState)

      expect(delegateRetryState["explore"]).toBe(4)
      expect(result.additional_context).toContain("ESCALATION:")
      expect(result.additional_context).toContain("Agent type 'explore' has failed 4 times")
      expect(result.additional_context).toContain("Try a different agent type")
      expect(result.additional_context).toContain("Use model: 'fast'")
      expect(result.additional_context).toContain("Ask the user for guidance")
    })
  })

  describe("#when output is missing", () => {
    it("returns empty result without incrementing", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()

      const result = handler({
        tool_input: { subagent_type: "explore" },
      }, delegateRetryState)

      expect("explore" in delegateRetryState).toBe(false)
      expect(result).toEqual({})
    })
  })

  describe("#when tool_input uses description fallback", () => {
    it("extracts agent type from description", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()

      handler({
        tool_input: { description: "search codebase" },
        output: "Error: failed to search",
      }, delegateRetryState)

      expect(delegateRetryState["search codebase"]).toBe(1)
    })
  })

  describe("#when different agent types fail", () => {
    it("tracks each agent type independently", () => {
      const delegateRetryState: Record<string, number> = {}
      const handler = createDelegateTaskRetry()

      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: explore failed",
      }, delegateRetryState)
      handler({
        tool_input: { subagent_type: "shell" },
        output: "Error: shell failed",
      }, delegateRetryState)
      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: explore failed again",
      }, delegateRetryState)

      expect(delegateRetryState["explore"]).toBe(2)
      expect(delegateRetryState["shell"]).toBe(1)
    })
  })
})
