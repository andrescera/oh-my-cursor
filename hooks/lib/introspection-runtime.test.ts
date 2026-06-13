import { describe, test, expect } from "bun:test"
import { createIntrospectionRuntime } from "./introspection-runtime"
import type { EnumResult } from "./task-schema-introspector"
import { DEFAULT_CONFIG } from "../config"
import { KNOWN_AGENT_TYPES } from "./known-models"
import { AGENT_MODEL_ALLOWLIST } from "./agent-model-allowlist"

function makeEnumResult(over: Partial<EnumResult> = {}): EnumResult {
  return {
    models: over.models ?? ["composer-2-fast", "gpt-5.4-medium"],
    agents: over.agents ?? ["explore", "librarian"],
    source: over.source ?? "bundle",
    cursorVersion: over.cursorVersion,
    cachedAt: over.cachedAt ?? new Date().toISOString(),
  }
}

describe("introspection-runtime", () => {
  test("getSnapshot returns a usable fallback floor (>=6 models) before init resolves", () => {
    let resolveScan: (r: EnumResult) => void = () => {}
    const rt = createIntrospectionRuntime({
      getEnum: () => new Promise<EnumResult>((r) => { resolveScan = r }),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    // init kicked off but never resolved yet — snapshot must still be serveable
    void rt.init()
    const snap = rt.getSnapshot()
    expect(Array.isArray(snap.models)).toBe(true)
    expect(snap.models.length).toBeGreaterThanOrEqual(6)
    expect(["bundle", "observed", "fallback"]).toContain(snap.source)
    expect(Array.isArray(snap.observedAdditions)).toBe(true)
    resolveScan(makeEnumResult())
  })

  test("init() populates the snapshot from getEnum", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult({ source: "bundle", cursorVersion: "3.7.27", models: ["a-1", "b-2", "c-3"] }),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    const snap = rt.getSnapshot()
    expect(snap.source).toBe("bundle")
    expect(snap.cursorVersion).toBe("3.7.27")
    expect(snap.models).toContain("a-1")
  })

  test("observe() surfaces a never-before-seen model in observedAdditions and merged models", async () => {
    const observed: Array<Record<string, unknown>> = []
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult({ models: ["composer-2-fast"], agents: ["explore"] }),
      passiveObserve: (r) => { observed.push(r as Record<string, unknown>) },
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    rt.observe({ tool_name: "Task", tool_input: { subagent_type: "explore", model: "future-model-x1" } })
    const snap = rt.getSnapshot()
    expect(snap.observedAdditions).toContain("future-model-x1")
    expect(snap.models).toContain("future-model-x1")
    // the runtime must forward the record to the introspector's passiveObserve
    expect(observed.length).toBeGreaterThan(0)
  })

  test("observe() does NOT list an already-known model as an addition", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult({ models: ["composer-2-fast", "gpt-5.4-medium"], agents: ["explore"] }),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    rt.observe({ tool_input: { model: "composer-2-fast" } })
    const snap = rt.getSnapshot()
    expect(snap.observedAdditions).not.toContain("composer-2-fast")
  })

  test("cursor_version mismatch vs cache triggers an async rescan (getEnum re-invoked)", async () => {
    let calls = 0
    const versions: Array<string | undefined> = []
    const rt = createIntrospectionRuntime({
      getEnum: async (opts) => {
        calls++
        versions.push(opts?.cursorVersion)
        return makeEnumResult({ cursorVersion: opts?.cursorVersion ?? "3.7.27" })
      },
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    expect(calls).toBe(1)
    rt.observe({ cursor_version: "9.9.9", tool_input: { model: "future-x" } })
    // rescan is async/non-blocking — give the microtask queue a tick
    await Bun.sleep(20)
    expect(calls).toBe(2)
    expect(versions).toContain("9.9.9")
  })

  test("same cursor_version does NOT trigger a rescan", async () => {
    let calls = 0
    const rt = createIntrospectionRuntime({
      getEnum: async (opts) => {
        calls++
        return makeEnumResult({ cursorVersion: opts?.cursorVersion ?? "3.7.27" })
      },
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    expect(calls).toBe(1)
    rt.observe({ cursor_version: "3.7.27", tool_input: { model: "future-y" } })
    await Bun.sleep(20)
    expect(calls).toBe(1)
  })

  test("a version-mismatch rescan that folds the observation into base.models still reports it in observedAdditions", async () => {
    // Mirrors the real introspector: getEnum unions passively-observed slugs into
    // its merged models. The regression: observedAdditions must survive that fold.
    const folded = new Set<string>(["composer-2-fast"])
    const rt = createIntrospectionRuntime({
      getEnum: async (opts) => makeEnumResult({
        models: [...folded],
        cursorVersion: opts?.cursorVersion ?? "3.7.27",
      }),
      passiveObserve: (r) => {
        const m = (r as { model?: unknown }).model
        if (typeof m === "string") folded.add(m)
      },
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    rt.observe({ cursor_version: "9.9.9", tool_input: { model: "future-model-x1" } })
    await Bun.sleep(20)
    const snap = rt.getSnapshot()
    expect(snap.models).toContain("future-model-x1")
    expect(snap.observedAdditions).toContain("future-model-x1")
  })

  test("observe() never throws on malformed input", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult(),
      passiveObserve: () => { throw new Error("boom") },
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    expect(() => rt.observe(null as unknown as Record<string, unknown>)).not.toThrow()
    expect(() => rt.observe({ tool_input: 12345 } as unknown as Record<string, unknown>)).not.toThrow()
  })

  test("init() never rejects even if getEnum throws", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async () => { throw new Error("scan exploded") },
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await expect(rt.init()).resolves.toBeUndefined()
    const snap = rt.getSnapshot()
    expect(snap.models.length).toBeGreaterThanOrEqual(6)
  })

  test("getSnapshot populates modelsByAgent with an entry for every known agent", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult(),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    const snap = rt.getSnapshot()
    expect(snap.modelsByAgent).toBeDefined()
    for (const agent of KNOWN_AGENT_TYPES) {
      expect(Array.isArray(snap.modelsByAgent?.[agent])).toBe(true)
      expect(snap.modelsByAgent?.[agent]?.length).toBeGreaterThan(0)
    }
    // the snapshot should still be a valid IntrospectionSnapshot
    expect(snap.models).toBeDefined()
    expect(snap.agents).toBeDefined()
    expect(snap.source).toBeDefined()
    expect(snap.cachedAt).toBeDefined()
    expect(snap.observedAdditions).toBeDefined()
  })

  test("curated agents resolve to their curated set; permissive agents resolve to snapshot.models", async () => {
    // "future-agent" is unknown (no curated entry) => PERMISSIVE; it must equal snapshot.models.
    // No observation occurs, so base.models === snapshot.models (no observedAdditions drift).
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult({
        models: ["composer-2-fast", "gpt-5.4-medium", "gpt-5.5-extra-high"],
        agents: ["explore", "future-agent"],
      }),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    const snap = rt.getSnapshot()
    // curated agent: exactly the curated allowlist set
    expect(snap.modelsByAgent?.explore).toEqual([...AGENT_MODEL_ALLOWLIST.explore])
    for (const m of snap.modelsByAgent?.explore ?? []) {
      expect(AGENT_MODEL_ALLOWLIST.explore).toContain(m)
    }
    // permissive (unknown) agent: full snapshot.models
    expect(snap.modelsByAgent?.["future-agent"]).toEqual(snap.models)
  })

  test("version-change rescan recomputes modelsByAgent to reflect the new models[]", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async (opts) => {
        if (opts?.cursorVersion === "9.9.9") {
          return makeEnumResult({
            models: ["gpt-5.5-extra-high", "new-model-z"],
            agents: ["explore", "future-agent"],
            cursorVersion: "9.9.9",
          })
        }
        return makeEnumResult({
          models: ["composer-2-fast"],
          agents: ["explore", "future-agent"],
          cursorVersion: "3.7.27",
        })
      },
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    let snap = rt.getSnapshot()
    // permissive agent reflects the original version's models
    expect(snap.modelsByAgent?.["future-agent"]).toEqual(["composer-2-fast"])

    rt.observe({ cursor_version: "9.9.9" })
    await Bun.sleep(20)
    snap = rt.getSnapshot()
    // after rescan, permissive agent reflects the NEW version's models[]
    expect(snap.modelsByAgent?.["future-agent"]).toEqual(["gpt-5.5-extra-high", "new-model-z"])
    expect(snap.modelsByAgent?.["future-agent"]).toContain("new-model-z")
  })

  test("snapshot with modelsByAgent type-checks correctly", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult(),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    const snap = rt.getSnapshot()
    // Verify the type is compatible with Record<string, string[]>
    const withModels: typeof snap = {
      ...snap,
      modelsByAgent: { "explore": ["composer-2-fast"], "sisyphus": ["gpt-5.4-medium"] },
    }
    expect(withModels.modelsByAgent).toBeDefined()
    expect(withModels.modelsByAgent?.explore).toEqual(["composer-2-fast"])
  })

  test("introspection-updated: a cursorVersion change fires onVersionChange exactly once with the new version", async () => {
    const emissions: Array<{ cursorVersion: string; cachedAt: string }> = []
    const rt = createIntrospectionRuntime({
      getEnum: async (opts) => makeEnumResult({
        cursorVersion: opts?.cursorVersion ?? "3.7.27",
        cachedAt: "2026-01-01T00:00:00.000Z",
      }),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
      onVersionChange: (payload) => { emissions.push(payload) },
    })
    // init establishes the baseline version — must NOT emit (no rescan yet)
    await rt.init()
    expect(emissions.length).toBe(0)

    // version drift triggers a rescan that confirms the new version
    rt.observe({ cursor_version: "9.9.9" })
    await Bun.sleep(20)

    expect(emissions.length).toBe(1)
    expect(emissions[0]?.cursorVersion).toBe("9.9.9")
    expect(typeof emissions[0]?.cachedAt).toBe("string")
  })

  test("introspection-updated: no onVersionChange emission when the cursorVersion is unchanged", async () => {
    const emissions: Array<{ cursorVersion: string; cachedAt: string }> = []
    const rt = createIntrospectionRuntime({
      getEnum: async (opts) => makeEnumResult({ cursorVersion: opts?.cursorVersion ?? "3.7.27" }),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
      onVersionChange: (payload) => { emissions.push(payload) },
    })
    await rt.init()
    expect(emissions.length).toBe(0)

    // same version as the baseline — no rescan, no emission
    rt.observe({ cursor_version: "3.7.27" })
    await Bun.sleep(20)

    expect(emissions.length).toBe(0)
  })

  test("introspection-updated: onVersionChange can be registered post-construction via setOnVersionChange", async () => {
    const emissions: Array<{ cursorVersion: string; cachedAt: string }> = []
    const rt = createIntrospectionRuntime({
      getEnum: async (opts) => makeEnumResult({ cursorVersion: opts?.cursorVersion ?? "3.7.27" }),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    rt.setOnVersionChange((payload) => { emissions.push(payload) })
    await rt.init()
    expect(emissions.length).toBe(0)

    rt.observe({ cursor_version: "9.9.9" })
    await Bun.sleep(20)

    expect(emissions.length).toBe(1)
    expect(emissions[0]?.cursorVersion).toBe("9.9.9")
  })
})
