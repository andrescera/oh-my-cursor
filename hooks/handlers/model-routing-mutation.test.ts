import { describe, it, expect } from "bun:test"
import {
  createModelRoutingProvider,
  modelRoutingProvider,
  MODEL_ROUTING_PROVIDER_ID,
  type ModelRoutingDeps,
} from "./model-routing-mutation"
import { taskInputComposer } from "./task-input-composer"
import type { OhMyCursorConfig } from "../schemas/config"
import type { EnumResult } from "../lib/task-schema-introspector"
import type { IntrospectionSnapshot } from "../lib/introspection-runtime"

// ---------------------------------------------------------------------------
// Test helpers — hermetic deps (no real config files, no real bundle scan).
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
  return { models, agents: [], source: "fallback", cachedAt: new Date().toISOString(), needsCapture: false }
}

function snapshotOf(models: string[]): IntrospectionSnapshot {
  return {
    models,
    agents: [],
    source: "fallback",
    cachedAt: new Date().toISOString(),
    observedAdditions: [],
  }
}

const DEFAULT_SNAPSHOT_MODELS: string[] = [
  "composer-2-fast",
  "composer-2.5",
  "gpt-5.4-medium",
  "gpt-5.4-high",
  "gemini-3.1-pro",
  "gemini-3-flash",
  "claude-opus-4-7-thinking-xhigh",
  "claude-opus-4-7-thinking",
  "gpt-5.5-extra-high",
  "gpt-5.5-medium",
  "claude-4.6-sonnet-medium-thinking",
  "claude-4.6-sonnet-thinking",
]

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

type RegisterCall = { conversationId: string; options: Record<string, unknown> }
type WarnCall = { message: string; meta?: Record<string, unknown> }

function makeDeps(
  opts: {
    config?: OhMyCursorConfig
    enumModels?: string[]
    snapshotModels?: string[]
    getSnapshot?: () => IntrospectionSnapshot
  } = {},
): {
  deps: ModelRoutingDeps
  registerCalls: RegisterCall[]
  warnCalls: WarnCall[]
  getEnumCount: () => number
} {
  const registerCalls: RegisterCall[] = []
  const warnCalls: WarnCall[] = []
  let getEnumCount = 0
  const config = opts.config ?? makeConfig({})
  const enumModels = opts.enumModels ?? []
  const snapshotModels = opts.snapshotModels ?? DEFAULT_SNAPSHOT_MODELS
  const deps: ModelRoutingDeps = {
    loadConfig: () => config,
    getEnum: async (): Promise<EnumResult> => {
      getEnumCount++
      return enumResult(enumModels)
    },
    getSnapshot: opts.getSnapshot ?? ((): IntrospectionSnapshot => snapshotOf(snapshotModels)),
    contextCollector: {
      register: (conversationId: string, options: Record<string, unknown>): void => {
        registerCalls.push({ conversationId, options })
      },
    },
    logWarn: (message: string, meta?: Record<string, unknown>): void => {
      warnCalls.push({ message, meta })
    },
    getProjectDir: () => undefined,
  }
  return { deps, registerCalls, warnCalls, getEnumCount: () => getEnumCount }
}

// ---------------------------------------------------------------------------
// Resolution precedence: agent_overrides[agent].model wins
// ---------------------------------------------------------------------------

describe("model-routing-mutation — agent_overrides precedence", () => {
  it("override model wins over the incoming tool_input.model", () => {
    const { deps } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "gpt-5.4-medium" } } }),
      enumModels: ["gpt-5.4-medium", "composer-2-fast"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { subagent_type: "explore", model: "composer-2-fast" })

    expect(result).toEqual({ model: "gpt-5.4-medium" })
  })

  it("applies the override even when no incoming model is present", () => {
    const { deps } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "gpt-5.4-medium" } } }),
      enumModels: ["gpt-5.4-medium"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { subagent_type: "explore" })

    expect(result).toEqual({ model: "gpt-5.4-medium" })
  })

  it("uses the agent_type fallback field when subagent_type is absent", () => {
    const { deps } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "gpt-5.4-medium" } } }),
      enumModels: ["gpt-5.4-medium"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { agent_type: "explore" })

    expect(result).toEqual({ model: "gpt-5.4-medium" })
  })
})

// ---------------------------------------------------------------------------
// No-op cases: absent override, identical model, no agent
// ---------------------------------------------------------------------------

describe("model-routing-mutation — no-op (null) cases", () => {
  it("returns null when no override or category exists for the agent", () => {
    const { deps } = makeDeps({ config: makeConfig({}) })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { subagent_type: "explore", model: "composer-2-fast" })

    expect(result).toBeNull()
  })

  it("returns null when the resolved model equals the incoming model", () => {
    const { deps } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "composer-2-fast" } } }),
      enumModels: ["composer-2-fast"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { subagent_type: "explore", model: "composer-2-fast" })

    expect(result).toBeNull()
  })

  it("returns null when no agent type can be extracted", () => {
    const { deps } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "gpt-5.4-medium" } } }),
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { description: "no agent here" })

    expect(result).toBeNull()
  })

  it("does NOT trigger enum validation on a no-op", async () => {
    const { deps, getEnumCount } = makeDeps({ config: makeConfig({}) })
    const provider = createModelRoutingProvider(deps)

    provider.mutate("conv-1", { subagent_type: "explore", model: "composer-2-fast" })
    await flush()

    expect(getEnumCount()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Category fallback + precedence
// ---------------------------------------------------------------------------

describe("model-routing-mutation — category fallback", () => {
  it("falls back to categories[agent].model when no agent override exists", () => {
    const { deps } = makeDeps({
      config: makeConfig({ categories: { explore: { model: "composer-2.5" } } }),
      enumModels: ["composer-2.5"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { subagent_type: "explore", model: "composer-2-fast" })

    expect(result).toEqual({ model: "composer-2.5" })
  })

  it("agent_overrides[agent].model wins over categories[agent].model", () => {
    const { deps } = makeDeps({
      config: makeConfig({
        agent_overrides: { explore: { model: "gpt-5.4-medium" } },
        categories: { explore: { model: "gemini-3.1-pro" } },
      }),
      enumModels: ["gpt-5.4-medium", "gemini-3.1-pro"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { subagent_type: "explore" })

    expect(result).toEqual({ model: "gpt-5.4-medium" })
  })

  it("falls back to category when the override has no model and is not disabled", () => {
    const { deps } = makeDeps({
      config: makeConfig({
        agent_overrides: { explore: { fallback_models: [] } },
        categories: { explore: { model: "composer-2.5" } },
      }),
      enumModels: ["composer-2.5"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-1", { subagent_type: "explore" })

    expect(result).toEqual({ model: "composer-2.5" })
  })
})

// ---------------------------------------------------------------------------
// Disabled agent: no model mutation + critical advisory
// ---------------------------------------------------------------------------

describe("model-routing-mutation — disabled agent", () => {
  it("does NOT mutate the model and registers a critical advisory", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { disable: true, model: "gpt-5.4-medium" } } }),
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-7", { subagent_type: "explore", model: "composer-2-fast" })

    expect(result).toBeNull()
    expect(registerCalls).toHaveLength(1)
    expect(registerCalls[0].conversationId).toBe("conv-7")
    expect(registerCalls[0].options.priority).toBe("critical")
    expect(String(registerCalls[0].options.content)).toContain("disabled")
    expect(String(registerCalls[0].options.content)).toContain("explore")
  })

  it("disabled override short-circuits the category model too", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({
        agent_overrides: { explore: { disable: true } },
        categories: { explore: { model: "gemini-3.1-pro" } },
      }),
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-7", { subagent_type: "explore" })

    expect(result).toBeNull()
    expect(registerCalls).toHaveLength(1)
    expect(registerCalls[0].options.priority).toBe("critical")
  })

  it("does NOT run enum validation for a disabled agent", async () => {
    const { deps, getEnumCount, warnCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { disable: true, model: "gpt-5.4-medium" } } }),
    })
    const provider = createModelRoutingProvider(deps)

    provider.mutate("conv-7", { subagent_type: "explore" })
    await flush()

    expect(getEnumCount()).toBe(0)
    expect(warnCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Advisory enum validation: unknown slug applied + warned; known slug silent
// ---------------------------------------------------------------------------

describe("model-routing-mutation — advisory slug validation", () => {
  it("applies an unknown slug anyway and warns via the daemon logger", async () => {
    const { deps, warnCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { "custom-worker": { model: "totally-fake-model" } } }),
      enumModels: ["composer-2-fast", "gpt-5.4-medium"],
      snapshotModels: ["composer-2-fast", "gpt-5.4-medium"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-8", { subagent_type: "custom-worker" })

    expect(result).toEqual({ model: "totally-fake-model" })

    await flush()
    expect(warnCalls).toHaveLength(1)
    expect(warnCalls[0].message).toContain("totally-fake-model")
  })

  it("does NOT warn when the resolved slug is in the introspector enum", async () => {
    const { deps, warnCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "gpt-5.4-medium" } } }),
      enumModels: ["composer-2-fast", "gpt-5.4-medium", "gemini-3.1-pro"],
    })
    const provider = createModelRoutingProvider(deps)

    provider.mutate("conv-9", { subagent_type: "explore" })

    await flush()
    expect(warnCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Dispatch-time per-agent allowlist validation + fallback
// ---------------------------------------------------------------------------

describe("model-routing-mutation — per-agent allowlist validation", () => {
  it("falls back to the category default when a curated agent's override is not allowed", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({
        agent_overrides: { explore: { model: "claude-opus-4-7-thinking-xhigh" } },
        categories: { explore: { model: "composer-2.5" } },
      }),
      enumModels: ["claude-opus-4-7-thinking-xhigh", "composer-2.5"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-a", { subagent_type: "explore" })

    expect(result).toEqual({ model: "composer-2.5" })
    expect(registerCalls).toHaveLength(1)
    expect(registerCalls[0].conversationId).toBe("conv-a")
    expect(registerCalls[0].options.priority).toBe("critical")
    expect(String(registerCalls[0].options.content)).toContain("explore")
    expect(String(registerCalls[0].options.content)).toContain("claude-opus-4-7-thinking-xhigh")
    expect(String(registerCalls[0].options.content)).toContain("composer-2.5")
  })

  it("inherits the parent model (null) with a critical advisory when no valid fallback exists", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "claude-opus-4-7-thinking-xhigh" } } }),
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-b", { subagent_type: "explore", model: "composer-2-fast" })

    expect(result).toBeNull()
    expect(registerCalls).toHaveLength(1)
    expect(registerCalls[0].options.priority).toBe("critical")
    expect(String(registerCalls[0].options.content)).toContain("explore")
    expect(String(registerCalls[0].options.content)).toContain("claude-opus-4-7-thinking-xhigh")
    expect(String(registerCalls[0].options.content)).toContain("inherit")
  })

  it("inherits when the only category fallback is itself disallowed for the curated agent", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({
        agent_overrides: { explore: { model: "claude-opus-4-7-thinking-xhigh" } },
        categories: { explore: { model: "gemini-3.1-pro" } },
      }),
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-b2", { subagent_type: "explore" })

    expect(result).toBeNull()
    expect(registerCalls).toHaveLength(1)
    expect(String(registerCalls[0].options.content)).toContain("inherit")
  })

  it("applies the override as-is for a permissive (unknown) agent and registers no advisory", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { "custom-worker": { model: "some-custom-model" } } }),
      snapshotModels: ["composer-2-fast"],
      enumModels: ["composer-2-fast"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-c", { subagent_type: "custom-worker" })

    expect(result).toEqual({ model: "some-custom-model" })
    expect(registerCalls).toHaveLength(0)
  })

  it("treats the agent as permissive (applies as-is) when the snapshot read throws", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "claude-opus-4-7-thinking-xhigh" } } }),
      getSnapshot: (): IntrospectionSnapshot => {
        throw new Error("cache not warm")
      },
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-cold", { subagent_type: "explore" })

    expect(result).toEqual({ model: "claude-opus-4-7-thinking-xhigh" })
    expect(registerCalls).toHaveLength(0)
  })

  it("never rejects or falls back when the resolved model is 'inherit'", () => {
    const { deps, registerCalls } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "inherit" } } }),
      snapshotModels: ["composer-2-fast"],
    })
    const provider = createModelRoutingProvider(deps)

    const result = provider.mutate("conv-d", { subagent_type: "explore", model: "composer-2-fast" })

    expect(result).toEqual({ model: "inherit" })
    expect(registerCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Hot-path timing budget (synchronous; never awaits in mutate)
// ---------------------------------------------------------------------------

describe("model-routing-mutation — hot-path timing", () => {
  it("mutate() p99 stays under 50ms over 100 calls with a warm cache", () => {
    const { deps } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "composer-2-fast" } } }),
      snapshotModels: ["composer-2-fast", "composer-2.5", "gpt-5.4-medium"],
    })
    const provider = createModelRoutingProvider(deps)

    const durations: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      provider.mutate("conv-perf", { subagent_type: "explore" })
      durations.push(performance.now() - start)
    }

    durations.sort((a, b) => a - b)
    const p99 = durations[Math.floor(0.99 * (durations.length - 1))]
    expect(p99).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// Per-agent isolation
// ---------------------------------------------------------------------------

describe("model-routing-mutation — per-agent isolation", () => {
  it("only mutates the agent that has an override; others pass through", () => {
    const { deps } = makeDeps({
      config: makeConfig({ agent_overrides: { explore: { model: "gpt-5.4-medium" } } }),
      enumModels: ["gpt-5.4-medium"],
    })
    const provider = createModelRoutingProvider(deps)

    const librarian = provider.mutate("conv-1", { subagent_type: "librarian", model: "composer-2-fast" })
    const explore = provider.mutate("conv-1", { subagent_type: "explore", model: "composer-2-fast" })

    expect(librarian).toBeNull()
    expect(explore).toEqual({ model: "gpt-5.4-medium" })
  })
})

// ---------------------------------------------------------------------------
// Singleton registration at module load
// ---------------------------------------------------------------------------

describe("model-routing-mutation — singleton registration", () => {
  it("exports a provider with the canonical id and a numeric priority", () => {
    expect(modelRoutingProvider.id).toBe(MODEL_ROUTING_PROVIDER_ID)
    expect(modelRoutingProvider.id).toBe("model-routing")
    expect(typeof modelRoutingProvider.priority).toBe("number")
  })

  it("registered the provider on the shared taskInputComposer singleton at module load", () => {
    // Unregistering the module-load provider must drop the singleton size by 1,
    // proving the import side-effect registered exactly this provider.
    const before = taskInputComposer.size()
    taskInputComposer.unregister(MODEL_ROUTING_PROVIDER_ID)
    expect(taskInputComposer.size()).toBe(before - 1)
    // restore so other suites see the canonical singleton state
    taskInputComposer.register(modelRoutingProvider)
    expect(taskInputComposer.size()).toBe(before)
  })
})
