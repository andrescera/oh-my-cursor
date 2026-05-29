import { describe, it, expect, beforeEach } from "bun:test"
import { createPrometheusMdOnlyHandler } from "./prometheus-md-only"
import { contextCollector } from "../context-collector"
import { conversations, getOrCreateConversation } from "../shared"

const CONV = "prometheus-md-only-test-conv"

function prometheusWrite(path: string, extra: Record<string, unknown> = {}) {
  return {
    tool_name: "Write",
    conversation_id: CONV,
    agent_type: "prometheus",
    tool_input: { file_path: path },
    ...extra,
  }
}

describe("prometheus-md-only", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("denies Prometheus write to .ts file with advisory fallback", () => {
    const handler = createPrometheusMdOnlyHandler(conversations)["/preToolUse"]!
    const result = handler(prometheusWrite("src/foo.ts"))

    expect(result.permission).toBe("deny")
    expect(result.additional_context).toContain("[prometheus-md-only]")
    expect(result.additional_context).toContain("src/foo.ts")
    expect(result.userMessage).toBe(result.additional_context)
    expect(result.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
    })
  })

  it("allows Prometheus write to .md file without deny", () => {
    const handler = createPrometheusMdOnlyHandler(conversations)["/preToolUse"]!
    const result = handler(prometheusWrite("docs/plan.md"))
    expect(result).toEqual({})
    expect(result.permission).toBeUndefined()
  })

  it("allows Prometheus write under .cursor/plans/ with reminder advisory", () => {
    const handler = createPrometheusMdOnlyHandler(conversations)["/preToolUse"]!
    const result = handler(prometheusWrite(".cursor/plans/my-plan.txt"))

    expect(result).toEqual({})
    expect(result.permission).toBeUndefined()

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[prometheus-md-only]")
    expect(pending.merged).toContain(".cursor/plans/my-plan.txt")
  })

  it("allows non-Prometheus agent to write .ts files", () => {
    const handler = createPrometheusMdOnlyHandler(conversations)["/preToolUse"]!
    const result = handler({
      tool_name: "Write",
      conversation_id: CONV,
      agent_type: "sisyphus",
      tool_input: { file_path: "src/foo.ts" },
    })
    expect(result).toEqual({})
  })

  it("detects Prometheus via active plan-phase todo", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.todoStates.set("plan-write", "in_progress")
    conv.activePlan = { path: "", phase: "plan-write", completedTasks: [] }

    const handler = createPrometheusMdOnlyHandler(conversations)["/preToolUse"]!
    const result = handler({
      tool_name: "Write",
      conversation_id: CONV,
      tool_input: { file_path: "src/bar.ts" },
    })

    expect(result.permission).toBe("deny")
    expect(result.additional_context).toContain("[prometheus-md-only]")
  })
})
