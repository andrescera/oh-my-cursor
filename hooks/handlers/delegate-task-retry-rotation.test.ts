import { describe, it, expect, beforeEach } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import {
  createModelRotationProvider,
  recordRetryableFailure,
  resetRotationState,
  type RotationDeps,
} from "./delegate-task-retry-rotation"
import type { OhMyCursorConfig } from "../schemas/config"
import type { IntrospectionSnapshot } from "../lib/introspection-runtime"

// ---------------------------------------------------------------------------
// Hermetic helpers — no real config files, no real bundle scan, injected snapshot.
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

function makeSnapshot(models: string[]): IntrospectionSnapshot {
  return {
    models,
    agents: [],
    source: "fallback",
    cachedAt: new Date().toISOString(),
    observedAdditions: [],
  }
}

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

function rotationDeps(
  config: OhMyCursorConfig,
  snapshot: IntrospectionSnapshot,
  collector?: ReturnType<typeof fakeCollector>,
): RotationDeps {
  return {
    loadConfig: () => config,
    getProjectDir: () => undefined,
    getSnapshot: () => snapshot,
    ...(collector ? { contextCollector: collector } : {}),
  }
}

function skipAdvisories(collector: ReturnType<typeof fakeCollector>): RegisterCall[] {
  return collector.calls.filter((c) => String(c.options.id).startsWith("model-rotation-skipped:"))
}

describe("model rotation — per-agent allowlist filtering", () => {
  beforeEach(() => {
    resetRotationState()
  })

  it("skips a fallback entry that is not allowed for the agent and registers one advisory", () => {
    // "explore" curated set: composer-2-fast, composer-2, gpt-5.4-medium.
    // "claude-opus-4-7-thinking-xhigh" is NOT in explore's curated set → must be skipped.
    const collector = fakeCollector()
    const snapshot = makeSnapshot(["composer-2-fast", "claude-opus-4-7-thinking-xhigh"])
    const config = makeConfig({
      agent_overrides: {
        explore: { fallback_models: ["claude-opus-4-7-thinking-xhigh", "composer-2-fast"] },
      },
    })
    const deps = rotationDeps(config, snapshot, collector)

    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)

    // The disallowed entry is skipped; the next allowed entry is armed.
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "composer-2-fast" })

    const skips = skipAdvisories(collector)
    expect(skips).toHaveLength(1)
    expect(skips[0].conversationId).toBe("c1")
    expect(skips[0].options.source).toBe("model-rotation")
    expect(skips[0].options.priority).toBe("critical")
    const content = String(skips[0].options.content)
    expect(content).toContain("claude-opus-4-7-thinking-xhigh")
    expect(content).toContain("explore")
  })

  it("registers the skip advisory only once across repeated dispatches of the same pair", () => {
    const collector = fakeCollector()
    const snapshot = makeSnapshot(["composer-2-fast"])
    const config = makeConfig({
      agent_overrides: {
        explore: { fallback_models: ["claude-opus-4-7-thinking-xhigh", "composer-2-fast"] },
      },
    })
    const deps = rotationDeps(config, snapshot, collector)

    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)

    provider.mutate("c1", { subagent_type: "explore" })
    provider.mutate("c1", { subagent_type: "explore" })
    provider.mutate("c1", { subagent_type: "explore" })

    expect(skipAdvisories(collector)).toHaveLength(1)
  })

  it("uses valid entries normally and registers no skip advisory", () => {
    const collector = fakeCollector()
    const snapshot = makeSnapshot(["composer-2-fast", "composer-2.5"])
    const config = makeConfig({
      agent_overrides: { explore: { fallback_models: ["composer-2-fast", "composer-2.5"] } },
    })
    const deps = rotationDeps(config, snapshot, collector)

    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "composer-2-fast" })

    recordRetryableFailure("c1", "explore", deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "composer-2.5" })

    expect(skipAdvisories(collector)).toHaveLength(0)
  })

  it("permissive agent (unknown / empty curated) → nothing skipped", () => {
    const collector = fakeCollector()
    // Unknown agent → permissive → allowed set is snapshot.models. Both fallbacks present.
    const snapshot = makeSnapshot(["fb0", "fb1"])
    const config = makeConfig({
      agent_overrides: { "unknown-agent": { fallback_models: ["fb0", "fb1"] } },
    })
    const deps = rotationDeps(config, snapshot, collector)

    recordRetryableFailure("c1", "unknown-agent", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "unknown-agent" })).toEqual({ model: "fb0" })

    expect(skipAdvisories(collector)).toHaveLength(0)
  })

  it("'inherit' is exempt and never skipped", () => {
    const collector = fakeCollector()
    // explore curated set does NOT contain "inherit", but isModelAllowedForAgent exempts it.
    const snapshot = makeSnapshot(["composer-2-fast"])
    const config = makeConfig({
      agent_overrides: { explore: { fallback_models: ["inherit", "composer-2-fast"] } },
    })
    const deps = rotationDeps(config, snapshot, collector)

    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toEqual({ model: "inherit" })

    expect(skipAdvisories(collector)).toHaveLength(0)
  })

  it("returns null (defers to static override) when every fallback is disallowed", () => {
    const collector = fakeCollector()
    const snapshot = makeSnapshot(["composer-2-fast"])
    const config = makeConfig({
      agent_overrides: {
        explore: { fallback_models: ["claude-opus-4-7-thinking-xhigh", "gpt-5.5-extra-high"] },
      },
    })
    const deps = rotationDeps(config, snapshot, collector)

    recordRetryableFailure("c1", "explore", deps)
    const provider = createModelRotationProvider(deps)
    expect(provider.mutate("c1", { subagent_type: "explore" })).toBeNull()

    // One advisory per skipped (disallowed) entry.
    expect(skipAdvisories(collector)).toHaveLength(2)
  })

  it("recordRetryableFailure counts only actually-attempted (allowed) models in the exhaustion advisory", () => {
    const collector = fakeCollector()
    const snapshot = makeSnapshot(["composer-2-fast"])
    const config = makeConfig({
      agent_overrides: {
        explore: { fallback_models: ["claude-opus-4-7-thinking-xhigh", "composer-2-fast"] },
      },
    })
    const deps = rotationDeps(config, snapshot, collector)

    recordRetryableFailure("c1", "explore", deps) // arms (index 0)
    recordRetryableFailure("c1", "explore", deps) // skip disallowed[0], attempt composer-2-fast
    recordRetryableFailure("c1", "explore", deps) // exhausts

    const exhausted = collector.calls.find(
      (c) => String(c.options.id).startsWith("model-rotation-exhausted:"),
    )
    expect(exhausted).toBeDefined()
    const content = String(exhausted!.options.content)
    // Only the allowed/attempted model is "tried"; the skipped disallowed slug is not.
    expect(content).toContain("composer-2-fast")
    expect(content).not.toContain("claude-opus-4-7-thinking-xhigh")
  })
})
