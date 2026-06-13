import { describe, it, expect } from "bun:test"
import { KNOWN_CURSOR_MODELS, KNOWN_AGENT_TYPES } from "./known-models"
import type { IntrospectionSnapshot } from "./introspection-runtime"
import {
  AGENT_MODEL_ALLOWLIST,
  resolveAllowedModels,
  isModelAllowedForAgent,
} from "./agent-model-allowlist"

function makeSnapshot(models: string[] = ["composer-2-fast", "gpt-5.4-medium"]): IntrospectionSnapshot {
  return {
    models,
    agents: [],
    source: "fallback",
    cachedAt: new Date(0).toISOString(),
    observedAdditions: [],
  }
}

describe("AGENT_MODEL_ALLOWLIST", () => {
  it("contains every KNOWN_AGENT_TYPES key", () => {
    for (const agent of KNOWN_AGENT_TYPES) {
      expect(AGENT_MODEL_ALLOWLIST[agent]).toBeDefined()
    }
  })

  it("only lists slugs that are members of KNOWN_CURSOR_MODELS (no typos)", () => {
    const bad: string[] = []
    for (const [agent, models] of Object.entries(AGENT_MODEL_ALLOWLIST)) {
      for (const m of models) {
        if (!KNOWN_CURSOR_MODELS.includes(m)) bad.push(`${agent}:${m}`)
      }
    }
    expect(bad).toEqual([])
  })

  it("never lists 'inherit' as a curated slug", () => {
    for (const models of Object.values(AGENT_MODEL_ALLOWLIST)) {
      expect(models).not.toContain("inherit")
    }
  })

  it("is frozen (immutable export)", () => {
    expect(Object.isFrozen(AGENT_MODEL_ALLOWLIST)).toBe(true)
  })
})

describe("resolveAllowedModels", () => {
  it("returns the curated set for a known, non-empty agent", () => {
    const snap = makeSnapshot()
    const result = resolveAllowedModels("explore", snap)
    expect(result).toEqual([...AGENT_MODEL_ALLOWLIST["explore"]])
  })

  it("returns snapshot.models (PERMISSIVE) for an unknown agent", () => {
    const snap = makeSnapshot(["composer-2-fast", "gpt-5.4-medium"])
    expect(resolveAllowedModels("nope-not-an-agent", snap)).toEqual(snap.models)
  })

  it("returns snapshot.models (PERMISSIVE) for an agent with an empty curated array", () => {
    const snap = makeSnapshot(["composer-2-fast", "gemini-3-flash"])
    const emptyAgent = Object.entries(AGENT_MODEL_ALLOWLIST).find(([, ms]) => ms.length === 0)?.[0]
    if (emptyAgent) {
      expect(resolveAllowedModels(emptyAgent, snap)).toEqual(snap.models)
    } else {
      // No empty agents seeded — the unknown path is the same code branch.
      expect(resolveAllowedModels("definitely-unknown", snap)).toEqual(snap.models)
    }
  })

  it("never includes 'inherit' in its output", () => {
    const snap = makeSnapshot()
    for (const agent of KNOWN_AGENT_TYPES) {
      expect(resolveAllowedModels(agent, snap)).not.toContain("inherit")
    }
  })
})

describe("isModelAllowedForAgent", () => {
  it("returns true for 'inherit' regardless of agent", () => {
    const snap = makeSnapshot()
    expect(isModelAllowedForAgent("explore", "inherit", snap)).toBe(true)
    expect(isModelAllowedForAgent("sisyphus", "inherit", snap)).toBe(true)
    expect(isModelAllowedForAgent("totally-unknown", "inherit", snap)).toBe(true)
  })

  it("returns true for any model when the agent is permissive (unknown)", () => {
    const snap = makeSnapshot(["composer-2-fast", "gpt-5.4-medium"])
    expect(isModelAllowedForAgent("unknown-agent", "composer-2-fast", snap)).toBe(true)
    expect(isModelAllowedForAgent("unknown-agent", "gpt-5.4-medium", snap)).toBe(true)
  })

  it("allows only curated models for a known agent", () => {
    const snap = makeSnapshot()
    const curated = AGENT_MODEL_ALLOWLIST["explore"]
    for (const m of curated) {
      expect(isModelAllowedForAgent("explore", m, snap)).toBe(true)
    }
    const notCurated = KNOWN_CURSOR_MODELS.find((m) => !curated.includes(m))
    expect(notCurated).toBeDefined()
    expect(isModelAllowedForAgent("explore", notCurated as string, snap)).toBe(false)
  })
})
