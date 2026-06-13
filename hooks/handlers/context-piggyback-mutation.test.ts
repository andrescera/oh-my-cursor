import { describe, it, expect, beforeEach } from "bun:test"
import { ContextCollector } from "../context-collector"
import { TaskInputComposer, taskInputComposer } from "./task-input-composer"
import {
  createContextPiggybackProvider,
  effectivePiggybackBudget,
  contextPiggybackProvider,
  PROBED_PROMPT_SIZE_BOUND,
  CONTEXT_OPEN_TAG,
  CONTEXT_CLOSE_TAG,
} from "./context-piggyback-mutation"

const ORIGINAL_PROMPT = "Do the original task and report back."

function taskInput(prompt = ORIGINAL_PROMPT): Record<string, unknown> {
  return { subagent_type: "explore", description: "probe", prompt }
}

describe("effectivePiggybackBudget — min(max_piggyback_chars, probed_bound * 0.8)", () => {
  it("clamps to 80% of the probed bound when max_piggyback_chars is larger", () => {
    const probedCeiling = Math.floor(PROBED_PROMPT_SIZE_BOUND * 0.8)
    expect(effectivePiggybackBudget(1_000_000)).toBe(probedCeiling)
  })

  it("uses max_piggyback_chars when it is the smaller of the two", () => {
    expect(effectivePiggybackBudget(8000)).toBe(8000)
  })

  it("never exceeds the probed size bound", () => {
    expect(effectivePiggybackBudget(Number.MAX_SAFE_INTEGER)).toBeLessThanOrEqual(
      PROBED_PROMPT_SIZE_BOUND,
    )
  })
})

describe("contextPiggybackProvider — prompt prefix format", () => {
  let collector: ContextCollector

  beforeEach(() => {
    collector = new ContextCollector()
  })

  it("prefixes the original prompt with a fenced <omc:context> block", () => {
    collector.register("conv-1", {
      id: "ctx",
      source: "guard",
      content: "SENTINEL_CTX_9",
      priority: "critical",
    })
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    const result = provider.mutate("conv-1", taskInput())

    expect(result).not.toBeNull()
    const expected =
      CONTEXT_OPEN_TAG + "SENTINEL_CTX_9" + CONTEXT_CLOSE_TAG + ORIGINAL_PROMPT
    expect((result as { prompt: string }).prompt).toBe(expected)
  })

  it("keeps the original prompt text intact after the context block", () => {
    collector.register("conv-1", { id: "ctx", source: "guard", content: "ADVISORY" })
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    const prompt = (provider.mutate("conv-1", taskInput()) as { prompt: string }).prompt

    expect(prompt.startsWith("<omc:context>\n")).toBe(true)
    expect(prompt.endsWith(ORIGINAL_PROMPT)).toBe(true)
    expect(prompt).toContain("\n</omc:context>\n\n")
  })

  it("tolerates a missing original prompt (empty string)", () => {
    collector.register("conv-1", { id: "ctx", source: "guard", content: "ADVISORY" })
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    const result = provider.mutate("conv-1", { subagent_type: "explore" })

    expect((result as { prompt: string }).prompt).toBe(
      CONTEXT_OPEN_TAG + "ADVISORY" + CONTEXT_CLOSE_TAG,
    )
  })
})

describe("contextPiggybackProvider — empty collector pass-through", () => {
  it("returns null when there is no pending context for the conversation", () => {
    const collector = new ContextCollector()
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    expect(provider.mutate("conv-empty", taskInput())).toBeNull()
  })

  it("returns null when conversationId is empty", () => {
    const collector = new ContextCollector()
    collector.register("", { id: "ctx", source: "guard", content: "X" })
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    expect(provider.mutate("", taskInput())).toBeNull()
  })
})

describe("contextPiggybackProvider — budget trim & deferred delivery", () => {
  let collector: ContextCollector

  beforeEach(() => {
    collector = new ContextCollector()
  })

  it("delivers the critical entry in full and defers the low entry past budget", () => {
    collector.register("conv-1", {
      id: "crit",
      source: "guard",
      content: "C".repeat(6000),
      priority: "critical",
    })
    collector.register("conv-1", {
      id: "lo",
      source: "guard",
      content: "L".repeat(6000),
      priority: "low",
    })
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    const first = (provider.mutate("conv-1", taskInput()) as { prompt: string }).prompt
    expect(first).toContain("C".repeat(6000))
    expect(first).not.toContain("L".repeat(6000))

    expect(collector.hasPending("conv-1")).toBe(true)
    const second = (provider.mutate("conv-1", taskInput()) as { prompt: string }).prompt
    expect(second).toContain("L".repeat(6000))
    expect(collector.hasPending("conv-1")).toBe(false)
  })

  it("consumes delivered entries so a second call without new context is a no-op", () => {
    collector.register("conv-1", { id: "ctx", source: "guard", content: "ONCE" })
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    expect(provider.mutate("conv-1", taskInput())).not.toBeNull()
    expect(provider.mutate("conv-1", taskInput())).toBeNull()
  })
})

describe("contextPiggybackProvider — conversation isolation", () => {
  it("only delivers context for the targeted conversation", () => {
    const collector = new ContextCollector()
    collector.register("conv-a", { id: "a", source: "guard", content: "A_CTX" })
    collector.register("conv-b", { id: "b", source: "guard", content: "B_CTX" })
    const provider = createContextPiggybackProvider({
      collector,
      getMaxPiggybackChars: () => 8000,
    })

    const a = (provider.mutate("conv-a", taskInput()) as { prompt: string }).prompt
    expect(a).toContain("A_CTX")
    expect(a).not.toContain("B_CTX")
    expect(collector.hasPending("conv-b")).toBe(true)
  })
})

describe("contextPiggybackProvider — composition through the composer", () => {
  it("echo-all preserves subagent_type while replacing prompt with the fenced block", () => {
    const collector = new ContextCollector()
    collector.register("conv-1", { id: "ctx", source: "guard", content: "CTX_BODY" })
    const composer = new TaskInputComposer()
    composer.register(
      createContextPiggybackProvider({ collector, getMaxPiggybackChars: () => 8000 }),
    )

    const updated = composer.compose("conv-1", taskInput())

    expect(updated).not.toBeNull()
    expect(updated!.subagent_type).toBe("explore")
    expect(updated!.description).toBe("probe")
    expect(String(updated!.prompt)).toContain("CTX_BODY")
    expect(String(updated!.prompt)).toContain(ORIGINAL_PROMPT)
  })
})

describe("contextPiggybackProvider — singleton registration", () => {
  it("registers the provider with the shared taskInputComposer at module load", () => {
    expect(contextPiggybackProvider.id).toBe("context-piggyback")
    expect(taskInputComposer.size()).toBeGreaterThanOrEqual(1)
  })
})
