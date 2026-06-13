import { describe, it, expect, beforeEach } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import { createDelegateTaskRetry } from "./delegate-task-retry"
import {
  createModelRotationProvider,
  modelRotationProvider,
  recordRetryableFailure,
  resetRotationOnSuccess,
  resetRotationState,
  MODEL_ROTATION_PROVIDER_ID,
  type RotationDeps,
} from "./delegate-task-retry-rotation"
import {
  TaskInputComposer,
  taskInputComposer,
  type TaskInput,
} from "./task-input-composer"
import { createModelRoutingProvider } from "./model-routing-mutation"
import type { OhMyCursorConfig } from "../schemas/config"
import type { EnumResult } from "../lib/task-schema-introspector"

type RegisterCall = { conversationId: string; options: RegisterContextOptions }

// ---------------------------------------------------------------------------
// Hermetic rotation helpers — no real config files, no real bundle scan.
// ---------------------------------------------------------------------------

type Override = { model?: string; fallback_models?: string[]; disable?: boolean }
type Category = Override & { description?: string }

function makeConfig(partial: {
  agent_overrides?: Record<string, Override>
  categories?: Record<string, Category>
}): OhMyCursorConfig {
  return {
    agent_overrides: partial.agent_overrides ?? {},
    categories: partial.categories ?? {},
  } as unknown as OhMyCursorConfig
}

function enumResult(models: string[]): EnumResult {
  return { models, agents: [], source: "fallback", cachedAt: new Date().toISOString() }
}

function rotationDeps(
  config: OhMyCursorConfig,
  collector?: ReturnType<typeof fakeCollector>,
): RotationDeps {
  return {
    loadConfig: () => config,
    getProjectDir: () => undefined,
    ...(collector ? { contextCollector: collector } : {}),
  }
}

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

// ---------------------------------------------------------------------------
// Fallback-model rotation state machine (per-(conversation, agent) keyed store)
// ---------------------------------------------------------------------------

describe("model rotation — state machine", () => {
  beforeEach(() => {
    resetRotationState()
  })

  it("does not rotate when fallback_models is empty", () => {
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: [] } } })
    const deps = rotationDeps(config)
    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toBeNull()
  })

  it("first retryable failure arms fallback_models[0]", () => {
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: ["fb0", "fb1"] } } })
    const deps = rotationDeps(config)
    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "fb0" })
  })

  it("second retryable failure advances to fallback_models[1]", () => {
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: ["fb0", "fb1"] } } })
    const deps = rotationDeps(config)
    recordRetryableFailure("c1", "explore", deps)
    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "fb1" })
  })

  it("exhaustion stops rotating and registers a critical advisory naming all tried models", () => {
    const collector = fakeCollector()
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: ["fb0", "fb1"] } } })
    const deps = rotationDeps(config, collector)
    recordRetryableFailure("c1", "explore", deps)
    recordRetryableFailure("c1", "explore", deps)
    recordRetryableFailure("c1", "explore", deps)

    const provider = createModelRotationProvider(rotationDeps(config))
    expect(provider.mutate("c1", { subagent_type: "explore" })).toBeNull()

    expect(collector.calls).toHaveLength(1)
    expect(collector.calls[0].conversationId).toBe("c1")
    expect(collector.calls[0].options.priority).toBe("critical")
    expect(collector.calls[0].options.source).toBe("model-rotation")
    const content = String(collector.calls[0].options.content)
    expect(content).toContain("fb0")
    expect(content).toContain("fb1")
  })

  it("registers the exhaustion advisory only once across repeated failures", () => {
    const collector = fakeCollector()
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: ["fb0"] } } })
    const deps = rotationDeps(config, collector)
    recordRetryableFailure("c1", "explore", deps)
    recordRetryableFailure("c1", "explore", deps)
    recordRetryableFailure("c1", "explore", deps)
    recordRetryableFailure("c1", "explore", deps)
    expect(collector.calls).toHaveLength(1)
  })

  it("a clean success resets the rotation index", () => {
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: ["fb0", "fb1"] } } })
    const deps = rotationDeps(config)
    recordRetryableFailure("c1", "explore", deps)
    resetRotationOnSuccess("c1", "explore")
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toBeNull()
  })

  it("isolates rotation state across conversations", () => {
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: ["fb0", "fb1"] } } })
    const deps = rotationDeps(config)
    recordRetryableFailure("convA", "explore", deps)
    recordRetryableFailure("convA", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("convA", { subagent_type: "explore" })).toEqual({ model: "fb1" })
    expect(provider.mutate("convB", { subagent_type: "explore" })).toBeNull()
  })

  it("isolates rotation state across agent types", () => {
    const config = makeConfig({
      agent_overrides: {
        explore: { fallback_models: ["fb0"] },
        librarian: { fallback_models: ["lb0"] },
      },
    })
    const deps = rotationDeps(config)
    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "fb0" })
    expect(provider.mutate("c1", { subagent_type: "librarian" })).toBeNull()
  })

  it("uses categories[agent].fallback_models when no agent override fallback exists", () => {
    const config = makeConfig({ categories: { explore: { fallback_models: ["cat0"] } } })
    const deps = rotationDeps(config)
    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "cat0" })
  })

  it("returns null when no agent type can be extracted", () => {
    const config = makeConfig({ agent_overrides: { explore: { fallback_models: ["fb0"] } } })
    const deps = rotationDeps(config)
    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { description: "no agent here" })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Provider registration + priority (rotation beats model-routing)
// ---------------------------------------------------------------------------

describe("model rotation — provider registration", () => {
  it("exports a provider with id 'model-rotation' and priority 200", () => {
    expect(modelRotationProvider.id).toBe(MODEL_ROTATION_PROVIDER_ID)
    expect(modelRotationProvider.id).toBe("model-rotation")
    expect(modelRotationProvider.priority).toBe(200)
  })

  it("registered the provider on the shared taskInputComposer at module load", () => {
    const before = taskInputComposer.size()
    taskInputComposer.unregister(MODEL_ROTATION_PROVIDER_ID)
    expect(taskInputComposer.size()).toBe(before - 1)
    taskInputComposer.register(modelRotationProvider)
    expect(taskInputComposer.size()).toBe(before)
  })

  it("rotation priority (200) beats the model-routing priority (100)", () => {
    const routing = createModelRoutingProvider()
    expect(modelRotationProvider.priority).toBeGreaterThan(routing.priority)
  })
})

// ---------------------------------------------------------------------------
// Handler wiring — delegate-task-retry drives the rotation hooks
// ---------------------------------------------------------------------------

describe("createDelegateTaskRetry — rotation wiring", () => {
  it("arms rotation on a retryable failure", () => {
    const recordCalls: Array<[string, string]> = []
    const handler = createDelegateTaskRetry({
      collector: fakeCollector(),
      recordRetryableFailure: (c, a) => recordCalls.push([c, a]),
      resetRotationOnSuccess: () => {},
    })
    handler(
      { tool_input: { subagent_type: "explore" }, output: "server error 500", conversationId: "c1" },
      {},
    )
    expect(recordCalls).toEqual([["c1", "explore"]])
  })

  it("resets rotation on a clean (non-error) output", () => {
    const resetCalls: Array<[string, string]> = []
    const handler = createDelegateTaskRetry({
      collector: fakeCollector(),
      recordRetryableFailure: () => {},
      resetRotationOnSuccess: (c, a) => resetCalls.push([c, a]),
    })
    handler(
      {
        tool_input: { subagent_type: "explore" },
        output: "Task completed successfully with results",
        conversationId: "c1",
      },
      {},
    )
    expect(resetCalls).toEqual([["c1", "explore"]])
  })

  it("does not touch rotation when output is missing", () => {
    const recordCalls: number[] = []
    const resetCalls: number[] = []
    const handler = createDelegateTaskRetry({
      collector: fakeCollector(),
      recordRetryableFailure: () => recordCalls.push(1),
      resetRotationOnSuccess: () => resetCalls.push(1),
    })
    handler({ tool_input: { subagent_type: "explore" }, conversationId: "c1" }, {})
    expect(recordCalls).toHaveLength(0)
    expect(resetCalls).toHaveLength(0)
  })

  it("keeps the delegate-retry advisory byte-identical on a retryable failure", () => {
    const collector = fakeCollector()
    const handler = createDelegateTaskRetry({
      collector,
      recordRetryableFailure: () => {},
      resetRotationOnSuccess: () => {},
    })
    handler(
      {
        tool_input: { subagent_type: "explore" },
        output: "HTTP 429 too many requests — rate limit exceeded",
        conversationId: "c1",
      },
      {},
    )
    expect(collector.calls).toHaveLength(1)
    expect(collector.calls[0].options.id).toBe("delegate-retry")
    expect(collector.calls[0].options.source).toBe("delegate-task-retry")
    expect(collector.calls[0].options.priority).toBe("high")
    expect(collector.calls[0].options.content).toContain("Rate limit hit")
  })
})

// ---------------------------------------------------------------------------
// Faithful composer harness — real composition precedence with controlled config
// ---------------------------------------------------------------------------

describe("model rotation — faithful composer precedence", () => {
  beforeEach(() => {
    resetRotationState()
  })

  function harness(config: OhMyCursorConfig): TaskInputComposer {
    const loadConfig = () => config
    const composer = new TaskInputComposer()
    composer.register(
      createModelRoutingProvider({
        loadConfig,
        getEnum: async () => enumResult(["static-x", "fb0", "fb1"]),
        getProjectDir: () => undefined,
      }),
    )
    composer.register(createModelRotationProvider({ loadConfig, getProjectDir: () => undefined }))
    return composer
  }

  it("rotates fb0 → fb1 over the static override, then resets to static on success", () => {
    const config = makeConfig({
      agent_overrides: { explore: { model: "static-x", fallback_models: ["fb0", "fb1"] } },
    })
    const deps = rotationDeps(config)
    const composer = harness(config)
    const toolInput: TaskInput = { subagent_type: "explore", description: "d", prompt: "p" }

    expect(composer.compose("conv", toolInput)?.model).toBe("static-x")

    recordRetryableFailure("conv", "explore", deps)
    const first = composer.compose("conv", toolInput)
    expect(first?.model).toBe("fb0")
    expect(first?.subagent_type).toBe("explore")
    expect(first?.prompt).toBe("p")

    recordRetryableFailure("conv", "explore", deps)
    expect(composer.compose("conv", toolInput)?.model).toBe("fb1")

    resetRotationOnSuccess("conv", "explore")
    expect(composer.compose("conv", toolInput)?.model).toBe("static-x")
  })

  it("defers to the static model-routing override once fallbacks are exhausted", () => {
    const config = makeConfig({
      agent_overrides: { explore: { model: "static-x", fallback_models: ["fb0"] } },
    })
    const deps = rotationDeps(config)
    const composer = harness(config)
    const toolInput: TaskInput = { subagent_type: "explore", prompt: "p" }

    recordRetryableFailure("conv", "explore", deps)
    expect(composer.compose("conv", toolInput)?.model).toBe("fb0")

    recordRetryableFailure("conv", "explore", deps)
    expect(composer.compose("conv", toolInput)?.model).toBe("static-x")
  })
})
