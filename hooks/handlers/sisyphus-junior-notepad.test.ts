import { describe, it, expect, beforeEach } from "bun:test"
import { createSisyphusJuniorNotepadHandler } from "./sisyphus-junior-notepad"
import { contextCollector } from "../context-collector"
import { conversations, getOrCreateConversation } from "../shared"

const CONV = "sisyphus-junior-notepad-test-conv"

function task(subagentType: string) {
  return {
    tool_name: "Task",
    conversation_id: CONV,
    tool_input: { subagent_type: subagentType, prompt: "do work" },
  }
}

describe("sisyphus-junior-notepad", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("registers advisory for sisyphus-junior Task when activePlan exists", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.activePlan = {
      path: ".cursor/plans/my-feature.plan.md",
      phase: "plan-execute",
      completedTasks: [],
    }

    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    handler(task("sisyphus-junior"))

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[sisyphus-junior-notepad]")
    expect(pending.merged).toContain(".cursor/notepads/my-feature/")
    expect(pending.merged).toContain("sisyphus-junior")
  })

  it("does not register advisory when activePlan is missing", () => {
    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    handler(task("sisyphus-junior"))

    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("does not register advisory for explore agent type", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.activePlan = { path: "plan.md", phase: "x", completedTasks: [] }

    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    handler(task("explore"))

    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })
})
