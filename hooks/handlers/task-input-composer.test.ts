import { describe, it, expect, beforeEach } from "bun:test"
import {
  TaskInputComposer,
  taskInputComposer,
  mergeUpdatedInputs,
  isTaskToolName,
  isDenyResult,
  composeTaskUpdatedInput,
  type TaskMutationProvider,
} from "./task-input-composer"

const ORIGINAL_TASK_INPUT = {
  subagent_type: "explore",
  description: "30-second probe",
  prompt: "List the top-level files in the repo and report the project name.",
} as const

function modelProvider(id: string, priority: number, model: string): TaskMutationProvider {
  return { id, priority, mutate: () => ({ model }) }
}

describe("TaskInputComposer.compose — echo-all field preservation", () => {
  let composer: TaskInputComposer

  beforeEach(() => {
    composer = new TaskInputComposer()
  })

  it("spreads the FULL original tool_input first, then applies the mutation (replace-safe echo-all)", () => {
    composer.register(modelProvider("model-router", 100, "composer-2-fast"))

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })

    expect(updated).not.toBeNull()
    // every original field survives
    expect(updated!.subagent_type).toBe("explore")
    expect(updated!.description).toBe("30-second probe")
    expect(updated!.prompt).toBe(ORIGINAL_TASK_INPUT.prompt)
    // mutation applied on top
    expect(updated!.model).toBe("composer-2-fast")
  })

  it("returns a NEW object — does not mutate the caller's original tool_input", () => {
    composer.register(modelProvider("model-router", 100, "composer-2-fast"))

    const original = { ...ORIGINAL_TASK_INPUT }
    const updated = composer.compose("conv-1", original)

    expect(updated).not.toBe(original)
    expect(original).not.toHaveProperty("model")
    expect(Object.keys(original).sort()).toEqual(
      ["description", "prompt", "subagent_type"],
    )
  })

  it("preserves original fields even when a provider does NOT echo them (partial mutation)", () => {
    // Provider only returns model; subagent_type/prompt MUST still survive.
    composer.register({ id: "p", priority: 1, mutate: () => ({ model: "x" }) })

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })

    expect(updated!.subagent_type).toBe("explore")
    expect(updated!.prompt).toBe(ORIGINAL_TASK_INPUT.prompt)
    expect(updated!.model).toBe("x")
  })
})

describe("TaskInputComposer.compose — zero-mutation pass-through", () => {
  let composer: TaskInputComposer

  beforeEach(() => {
    composer = new TaskInputComposer()
  })

  it("returns null when there are NO registered providers", () => {
    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })
    expect(updated).toBeNull()
  })

  it("returns null when every provider returns null", () => {
    composer.register({ id: "a", priority: 1, mutate: () => null })
    composer.register({ id: "b", priority: 2, mutate: () => null })

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })
    expect(updated).toBeNull()
  })

  it("treats an empty-object mutation as no mutation (pass-through)", () => {
    composer.register({ id: "a", priority: 1, mutate: () => ({}) })

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })
    expect(updated).toBeNull()
  })
})

describe("TaskInputComposer.compose — priority ordering & conflict resolution", () => {
  let composer: TaskInputComposer

  beforeEach(() => {
    composer = new TaskInputComposer()
  })

  it("merges non-conflicting keys from multiple providers", () => {
    composer.register({ id: "a", priority: 10, mutate: () => ({ model: "m" }) })
    composer.register({ id: "b", priority: 20, mutate: () => ({ extra: "e" }) })

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })

    expect(updated!.model).toBe("m")
    expect(updated!.extra).toBe("e")
    expect(updated!.subagent_type).toBe("explore")
  })

  it("higher-priority provider wins on a key conflict (applied last)", () => {
    composer.register(modelProvider("low", 1, "low-model"))
    composer.register(modelProvider("high", 100, "high-model"))

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })

    expect(updated!.model).toBe("high-model")
  })

  it("ordering is independent of registration order (sorted by priority)", () => {
    // Register high first, low second — result must still be high winning.
    composer.register(modelProvider("high", 100, "high-model"))
    composer.register(modelProvider("low", 1, "low-model"))

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })

    expect(updated!.model).toBe("high-model")
  })

  it("tie-breaks equal priorities deterministically by provider id", () => {
    composer.register({ id: "zzz", priority: 50, mutate: () => ({ model: "zzz" }) })
    composer.register({ id: "aaa", priority: 50, mutate: () => ({ model: "aaa" }) })

    // id ascending: aaa applied first, zzz applied last → zzz wins
    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })
    expect(updated!.model).toBe("zzz")
  })
})

describe("TaskInputComposer.compose — provider throw isolation", () => {
  it("skips a throwing provider, still applies the others, and logs the failure", () => {
    const logged: Array<{ message: string; meta?: Record<string, unknown> }> = []
    const composer = new TaskInputComposer({
      logError: (message, meta) => logged.push({ message, meta }),
    })

    composer.register({
      id: "boom",
      priority: 1,
      mutate: () => {
        throw new Error("provider exploded")
      },
    })
    composer.register(modelProvider("ok", 2, "survivor"))

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })

    expect(updated!.model).toBe("survivor")
    expect(updated!.subagent_type).toBe("explore")
    expect(logged.length).toBe(1)
    expect(logged[0].message).toContain("boom")
  })

  it("returns null (pass-through) when the ONLY provider throws", () => {
    const composer = new TaskInputComposer({ logError: () => {} })
    composer.register({
      id: "boom",
      priority: 1,
      mutate: () => {
        throw new Error("explode")
      },
    })

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })
    expect(updated).toBeNull()
  })
})

describe("TaskInputComposer.compose — per-conversation isolation", () => {
  it("applies a mutation only for the conversation the provider targets", () => {
    const composer = new TaskInputComposer()
    composer.register({
      id: "scoped",
      priority: 1,
      mutate: (conversationId) =>
        conversationId === "conv-a" ? { model: "scoped-model" } : null,
    })

    const a = composer.compose("conv-a", { ...ORIGINAL_TASK_INPUT })
    const b = composer.compose("conv-b", { ...ORIGINAL_TASK_INPUT })

    expect(a!.model).toBe("scoped-model")
    expect(b).toBeNull()
  })

  it("passes the conversationId through to the provider", () => {
    const composer = new TaskInputComposer()
    const seen: string[] = []
    composer.register({
      id: "spy",
      priority: 1,
      mutate: (conversationId) => {
        seen.push(conversationId)
        return null
      },
    })

    composer.compose("conv-xyz", { ...ORIGINAL_TASK_INPUT })
    expect(seen).toEqual(["conv-xyz"])
  })
})

describe("TaskInputComposer registry management", () => {
  it("re-registering the same id replaces the prior provider", () => {
    const composer = new TaskInputComposer()
    composer.register(modelProvider("dup", 1, "first"))
    composer.register(modelProvider("dup", 1, "second"))

    const updated = composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })
    expect(updated!.model).toBe("second")
  })

  it("unregister removes a provider", () => {
    const composer = new TaskInputComposer()
    composer.register(modelProvider("gone", 1, "x"))
    composer.unregister("gone")

    expect(composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })).toBeNull()
  })

  it("reset clears all providers", () => {
    const composer = new TaskInputComposer()
    composer.register(modelProvider("a", 1, "x"))
    composer.register(modelProvider("b", 2, "y"))
    composer.reset()

    expect(composer.compose("conv-1", { ...ORIGINAL_TASK_INPUT })).toBeNull()
  })

  it("exposes a shared singleton instance", () => {
    expect(taskInputComposer).toBeInstanceOf(TaskInputComposer)
  })
})

describe("isTaskToolName", () => {
  it("matches the Task tool family (Task|task|Agent|agent)", () => {
    expect(isTaskToolName("Task")).toBe(true)
    expect(isTaskToolName("task")).toBe(true)
    expect(isTaskToolName("Agent")).toBe(true)
    expect(isTaskToolName("agent")).toBe(true)
  })

  it("rejects non-Task tools", () => {
    expect(isTaskToolName("Write")).toBe(false)
    expect(isTaskToolName("Shell")).toBe(false)
    expect(isTaskToolName("WebFetch")).toBe(false)
    expect(isTaskToolName("")).toBe(false)
    expect(isTaskToolName(undefined)).toBe(false)
    expect(isTaskToolName(42)).toBe(false)
  })
})

describe("isDenyResult", () => {
  it("detects deny via permission field", () => {
    expect(isDenyResult({ permission: "deny" })).toBe(true)
  })

  it("detects deny via decision field", () => {
    expect(isDenyResult({ decision: "deny" })).toBe(true)
  })

  it("returns false for allow / advisory / empty results", () => {
    expect(isDenyResult({})).toBe(false)
    expect(isDenyResult({ permission: "allow" })).toBe(false)
    expect(isDenyResult({ additional_context: "[momus-loop] ..." })).toBe(false)
  })
})

describe("mergeUpdatedInputs (re-exported for non-Task handlers)", () => {
  it("shallow-merges updated_input across responses (later wins)", () => {
    const merged = mergeUpdatedInputs([
      { updated_input: { command: "a", flag: "1" } },
      { updated_input: { command: "b" } },
    ])
    expect(merged.updated_input).toEqual({ command: "b", flag: "1" })
  })

  it("returns an empty object (pass-through) when no response carries updated_input", () => {
    const merged = mergeUpdatedInputs([{}, { permission: "allow" }])
    expect(merged.updated_input).toBeUndefined()
    expect(Object.keys(merged)).toHaveLength(0)
  })
})

describe("composeTaskUpdatedInput — daemon route helper", () => {
  let composer: TaskInputComposer

  beforeEach(() => {
    composer = new TaskInputComposer()
  })

  it("attaches updated_input (echo-all) onto the handler result for a Task tool", () => {
    composer.register(modelProvider("router", 100, "composer-2-fast"))

    const parsed = {
      tool_name: "Task",
      conversation_id: "conv-1",
      tool_input: { ...ORIGINAL_TASK_INPUT },
    }
    const out = composeTaskUpdatedInput("/preToolUse", parsed, {}, composer)

    expect(out.updated_input).toBeDefined()
    const ui = out.updated_input as Record<string, unknown>
    expect(ui.subagent_type).toBe("explore")
    expect(ui.prompt).toBe(ORIGINAL_TASK_INPUT.prompt)
    expect(ui.model).toBe("composer-2-fast")
  })

  it("emits NO updated_input key when there are zero mutations (pass-through)", () => {
    const parsed = {
      tool_name: "Task",
      conversation_id: "conv-1",
      tool_input: { ...ORIGINAL_TASK_INPUT },
    }
    const out = composeTaskUpdatedInput("/preToolUse", parsed, {}, composer)

    expect(out).not.toHaveProperty("updated_input")
  })

  it("does NOT compose for non-Task tools (passes handler result through untouched)", () => {
    composer.register(modelProvider("router", 100, "composer-2-fast"))

    const parsed = {
      tool_name: "Write",
      conversation_id: "conv-1",
      tool_input: { file_path: "/tmp/x", contents: "y" },
    }
    const handlerResult = { foo: "bar" }
    const out = composeTaskUpdatedInput("/preToolUse", parsed, handlerResult, composer)

    expect(out).not.toHaveProperty("updated_input")
    expect(out.foo).toBe("bar")
  })

  it("does NOT compose on a non-preToolUse path", () => {
    composer.register(modelProvider("router", 100, "composer-2-fast"))

    const parsed = {
      tool_name: "Task",
      conversation_id: "conv-1",
      tool_input: { ...ORIGINAL_TASK_INPUT },
    }
    const out = composeTaskUpdatedInput("/postToolUse", parsed, {}, composer)

    expect(out).not.toHaveProperty("updated_input")
  })

  it("does NOT attach updated_input when the handler result is a deny (short-circuit wins)", () => {
    composer.register(modelProvider("router", 100, "composer-2-fast"))

    const parsed = {
      tool_name: "Task",
      conversation_id: "conv-1",
      tool_input: { ...ORIGINAL_TASK_INPUT },
    }
    const denyResult = { permission: "deny", decision: "deny", user_message: "blocked" }
    const out = composeTaskUpdatedInput("/preToolUse", parsed, denyResult, composer)

    expect(out).not.toHaveProperty("updated_input")
    expect(out.permission).toBe("deny")
  })

  it("preserves other handler-result fields while adding updated_input (e.g. momus advisory)", () => {
    composer.register(modelProvider("router", 100, "composer-2-fast"))

    const parsed = {
      tool_name: "Task",
      conversation_id: "conv-1",
      tool_input: { ...ORIGINAL_TASK_INPUT },
    }
    const advisory = { additional_context: "[momus-loop] limit reached" }
    const out = composeTaskUpdatedInput("/preToolUse", parsed, advisory, composer)

    expect(out.additional_context).toBe("[momus-loop] limit reached")
    expect(out.updated_input).toBeDefined()
  })

  it("falls back to session_id when conversation_id is absent", () => {
    const seen: string[] = []
    composer.register({
      id: "spy",
      priority: 1,
      mutate: (conversationId) => {
        seen.push(conversationId)
        return { model: "x" }
      },
    })

    const parsed = {
      tool_name: "Task",
      session_id: "sess-9",
      tool_input: { ...ORIGINAL_TASK_INPUT },
    }
    composeTaskUpdatedInput("/preToolUse", parsed, {}, composer)
    expect(seen).toEqual(["sess-9"])
  })

  it("does not mutate the passed-in handler result object", () => {
    composer.register(modelProvider("router", 100, "composer-2-fast"))

    const parsed = {
      tool_name: "Task",
      conversation_id: "conv-1",
      tool_input: { ...ORIGINAL_TASK_INPUT },
    }
    const handlerResult: Record<string, unknown> = {}
    composeTaskUpdatedInput("/preToolUse", parsed, handlerResult, composer)

    expect(handlerResult).not.toHaveProperty("updated_input")
  })
})
