import { describe, it, expect, beforeEach } from "bun:test"
import { createAgentUsageReminderHandler } from "./agent-usage-reminder"
import { contextCollector } from "../context-collector"
import { conversations, getOrCreateConversation } from "../shared"

const CONV = "agent-usage-reminder-test-conv"

function grep() {
  return { tool_name: "Grep", conversation_id: CONV, tool_input: { pattern: "x" } }
}

describe("agent-usage-reminder", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("emits a delegation reminder after repeated searches without a Task dispatch", () => {
    const handler = createAgentUsageReminderHandler(conversations)["/postToolUse"]!
    const conv = getOrCreateConversation(CONV)
    conv.composerMode = "agent"

    for (let i = 0; i < 4; i++) handler(grep())

    expect(conv.dispatchCounts["agent-reminder"]).toBe(1)
    expect(contextCollector.getPending(CONV).merged).toContain("[agent-reminder]")
  })

  it("caps reminders at 3 per session", () => {
    const handler = createAgentUsageReminderHandler(conversations)["/postToolUse"]!
    const conv = getOrCreateConversation(CONV)
    conv.composerMode = "agent"

    for (let i = 0; i < 15; i++) handler(grep())

    expect(conv.dispatchCounts["agent-reminder"]).toBe(3)
  })

  it("does not fire when a Task dispatch is in the recent trail", () => {
    const handler = createAgentUsageReminderHandler(conversations)["/postToolUse"]!
    const conv = getOrCreateConversation(CONV)
    conv.composerMode = "agent"
    conv.recentToolTrail = [{ tool: "Task" }]

    for (let i = 0; i < 5; i++) handler(grep())

    expect(conv.dispatchCounts["agent-reminder"] ?? 0).toBe(0)
    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("does not fire outside of agent mode", () => {
    const handler = createAgentUsageReminderHandler(conversations)["/postToolUse"]!
    const conv = getOrCreateConversation(CONV)
    conv.composerMode = null

    for (let i = 0; i < 5; i++) handler(grep())

    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })
})
