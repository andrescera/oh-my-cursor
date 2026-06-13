import { describe, it, expect } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import { createDelegateTaskRetry } from "./delegate-task-retry"

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

function lastAdvisory(collector: ReturnType<typeof fakeCollector>): string {
  const call = collector.calls.at(-1)
  return call ? (call.options.content as string) : ""
}

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
        expectedAdvice: "Rate limit hit. Wait 30s then retry. If persistent, try model: 'composer-2-fast' parameter.",
      },
      {
        label: "model_unavailable",
        output: "Error: model_not_supported for this request",
        expectedAdvice: "Model not available. Retry with model: 'composer-2-fast'. If using sisyphus, consider sisyphus-junior as fallback.",
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
      it(`classifies ${label} and registers matching advice (NO additional_context)`, () => {
        const delegateRetryState: Record<string, number> = {}
        const collector = fakeCollector()
        const handler = createDelegateTaskRetry({ collector })

        const result = handler({
          tool_input: { subagent_type: "explore" },
          output,
          conversationId: "c1",
        }, delegateRetryState)

        expect(result).not.toHaveProperty("additional_context")
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].conversationId).toBe("c1")
        expect(collector.calls[0].options.priority).toBe("high")
        expect(collector.calls[0].options.source).toBe("delegate-task-retry")
        expect(collector.calls[0].options.content).toContain(expectedAdvice)
        expect(delegateRetryState["explore"]).toBe(1)
      })
    }

    it("returns empty and does not register when output matches no error pattern", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })

      const result = handler({
        tool_input: { subagent_type: "explore" },
        output: "Task completed successfully with results",
        conversationId: "c1",
      }, delegateRetryState)

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
      expect("explore" in delegateRetryState).toBe(false)
    })
  })

  describe("HTTP status hints in output", () => {
    it("treats 429 as rate_limit", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })
      handler({
        tool_input: { subagent_type: "x" },
        output: "upstream returned status 429",
        conversationId: "c1",
      }, delegateRetryState)
      expect(lastAdvisory(collector)).toContain("Rate limit hit")
    })

    it("treats 504 as timeout", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })
      handler({
        tool_input: { subagent_type: "x" },
        output: "gateway 504 Gateway Timeout",
        conversationId: "c1",
      }, delegateRetryState)
      expect(lastAdvisory(collector)).toContain("Task timed out")
    })

    for (const code of [500, 502, 503] as const) {
      it(`treats ${code} as generic error`, () => {
        const delegateRetryState: Record<string, number> = {}
        const collector = fakeCollector()
        const handler = createDelegateTaskRetry({ collector })
        handler({
          tool_input: { subagent_type: "x" },
          output: `server error ${code}`,
          conversationId: "c1",
        }, delegateRetryState)
        expect(lastAdvisory(collector)).toContain(
          "Task failed. Resume the same agent ID with fix context. After 3 failures, escalate to user.",
        )
      })
    }
  })

  describe("model-switching advice on model errors", () => {
    it("includes fast model retry guidance for model_unavailable", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })
      handler({
        tool_input: { subagent_type: "worker" },
        output: "model unavailable for subagent_type shell",
        conversationId: "c1",
      }, delegateRetryState)
      expect(lastAdvisory(collector)).toContain("Retry with model: 'composer-2-fast'")
    })

    it("after two model_unavailable errors for same agent type, advises switching subagent_type entirely", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })
      handler(
        {
          tool_input: { subagent_type: "hephaestus" },
          output: "model unavailable for requested worker",
          conversationId: "c1",
        },
        delegateRetryState,
      )
      handler(
        {
          tool_input: { subagent_type: "hephaestus" },
          output: "Error: model_not_supported",
          conversationId: "c1",
        },
        delegateRetryState,
      )
      expect(lastAdvisory(collector)).toContain(
        "switch to a different subagent_type entirely",
      )
      expect(lastAdvisory(collector)).not.toContain("Consider switching to a different subagent_type")
    })
  })

  describe("agent-switching advice after consecutive failures", () => {
    it("suggests switching subagent after second failure for same agent type", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })

      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: first failure",
        conversationId: "c1",
      }, delegateRetryState)
      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: second failure",
        conversationId: "c1",
      }, delegateRetryState)

      expect(delegateRetryState["explore"]).toBe(2)
      expect(lastAdvisory(collector)).toContain("Consider switching to a different subagent_type")
    })

    it("escalates when same agent type fails more than three times", () => {
      const delegateRetryState: Record<string, number> = {}
      delegateRetryState["explore"] = 3
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })

      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: fourth failure",
        conversationId: "c1",
      }, delegateRetryState)

      expect(delegateRetryState["explore"]).toBe(4)
      const advisory = lastAdvisory(collector)
      expect(advisory).toContain("ESCALATION:")
      expect(advisory).toContain("Agent type 'explore' has failed 4 times")
      expect(advisory).toContain("Try a different agent type")
      expect(advisory).toContain("Use model: 'composer-2-fast'")
      expect(advisory).toContain("Ask the user for guidance")
    })
  })

  describe("#when output is missing", () => {
    it("returns empty result without incrementing or registering", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })

      const result = handler({
        tool_input: { subagent_type: "explore" },
        conversationId: "c1",
      }, delegateRetryState)

      expect("explore" in delegateRetryState).toBe(false)
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when tool_input uses description fallback", () => {
    it("extracts agent type from description", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })

      handler({
        tool_input: { description: "search codebase" },
        output: "Error: failed to search",
        conversationId: "c1",
      }, delegateRetryState)

      expect(delegateRetryState["search codebase"]).toBe(1)
    })
  })

  describe("#when different agent types fail", () => {
    it("tracks each agent type independently", () => {
      const delegateRetryState: Record<string, number> = {}
      const collector = fakeCollector()
      const handler = createDelegateTaskRetry({ collector })

      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: explore failed",
        conversationId: "c1",
      }, delegateRetryState)
      handler({
        tool_input: { subagent_type: "shell" },
        output: "Error: shell failed",
        conversationId: "c1",
      }, delegateRetryState)
      handler({
        tool_input: { subagent_type: "explore" },
        output: "Error: explore failed again",
        conversationId: "c1",
      }, delegateRetryState)

      expect(delegateRetryState["explore"]).toBe(2)
      expect(delegateRetryState["shell"]).toBe(1)
    })
  })
})
