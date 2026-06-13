import { describe, test, expect } from "bun:test"
import { createIntrospectionRuntime } from "./introspection-runtime"
import type { EnumResult } from "./task-schema-introspector"
import { DEFAULT_CONFIG } from "../config"

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

  test("snapshot without modelsByAgent is valid (optional field)", async () => {
    const rt = createIntrospectionRuntime({
      getEnum: async () => makeEnumResult(),
      passiveObserve: () => {},
      loadConfig: () => DEFAULT_CONFIG,
    })
    await rt.init()
    const snap = rt.getSnapshot()
    // modelsByAgent is optional, so it should not be present by default
    expect(snap.modelsByAgent).toBeUndefined()
    // but the snapshot should still be a valid IntrospectionSnapshot
    expect(snap.models).toBeDefined()
    expect(snap.agents).toBeDefined()
    expect(snap.source).toBeDefined()
    expect(snap.cachedAt).toBeDefined()
    expect(snap.observedAdditions).toBeDefined()
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
})
