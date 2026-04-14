import { describe, it, expect, beforeEach } from "bun:test"
import { createToolGuardHandlers } from "./tool-guard-handlers"
import type { BackgroundTracker } from "./background-tracker"
import { conversations } from "../shared"

type ActiveTask = { agentId: string; agentType: string; description: string; startTime: number; elapsedMs: number; conversationId: string }

function makeTracker(activesByConversation: Record<string, ActiveTask[]>): BackgroundTracker {
  return {
    getActiveTasksForConversation: (convId: string) => activesByConversation[convId] ?? [],
    getActiveTasks: () => [],
    track: () => {},
    complete: () => {},
    cleanup: () => {},
    completeOldestByType: () => false,
  } as unknown as BackgroundTracker
}

function makeExploreTasks(count: number, convId: string): ActiveTask[] {
  return Array.from({ length: count }, (_, i) => ({
    agentId: `explore-${i}`,
    agentType: "explore",
    description: "Search",
    startTime: Date.now(),
    elapsedMs: 0,
    conversationId: convId,
  }))
}

const CONV = "tool-guard-test-conv"

describe("createToolGuardHandlers dispatch count inflation fix", () => {
  beforeEach(() => {
    conversations.delete(CONV)
  })

  describe("#when the explore dispatch limit is reached", () => {
    it("denies the dispatch and does NOT increment dispatchCounts", () => {
      // Default explore limit is 6; fill it completely
      const tracker = makeTracker({ [CONV]: makeExploreTasks(6, CONV) })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "explore", description: "Search codebase" },
      })

      expect(result.permission).toBe("deny")
      expect((result.agentMessage as string)).toMatch(/dispatch-limit/)

      const conversation = conversations.get(CONV)!
      expect(conversation.dispatchCounts["subagent:explore"]).toBeUndefined()
    })
  })

  describe("#when the explore dispatch limit is not reached", () => {
    it("allows the dispatch and increments dispatchCounts", () => {
      const tracker = makeTracker({ [CONV]: makeExploreTasks(0, CONV) })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "explore", description: "Search codebase" },
      })

      const conversation = conversations.get(CONV)!
      expect(conversation.dispatchCounts["subagent:explore"]).toBe(1)
    })

    it("increments dispatchCounts on each successive allowed dispatch", () => {
      const tracker = makeTracker({ [CONV]: makeExploreTasks(0, CONV) })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Task", conversation_id: CONV, tool_input: { subagent_type: "explore", description: "First" } })
      handler({ tool_name: "Task", conversation_id: CONV, tool_input: { subagent_type: "explore", description: "Second" } })

      const conversation = conversations.get(CONV)!
      expect(conversation.dispatchCounts["subagent:explore"]).toBe(2)
    })
  })

  describe("#when the worker dispatch limit is reached", () => {
    it("denies the dispatch and does NOT increment dispatchCounts for the worker type", () => {
      // Default worker limit is 8; fill it completely with sisyphus workers
      const activeTasks: ActiveTask[] = Array.from({ length: 8 }, (_, i) => ({
        agentId: `worker-${i}`,
        agentType: "sisyphus",
        description: "Task",
        startTime: Date.now(),
        elapsedMs: 0,
        conversationId: CONV,
      }))
      const tracker = makeTracker({ [CONV]: activeTasks })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "sisyphus", description: "Do work" },
      })

      expect(result.permission).toBe("deny")

      const conversation = conversations.get(CONV)!
      expect(conversation.dispatchCounts["subagent:sisyphus"]).toBeUndefined()
    })
  })

  describe("#when a dispatch is denied by plan mode guard", () => {
    it("does NOT increment dispatchCounts for the denied dispatch", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      // Put the session in plan mode by pre-creating it and setting composerMode
      const conversation = conversations.get(CONV) ?? (() => {
        handler({ tool_name: "Read", conversation_id: CONV, tool_input: {} })
        return conversations.get(CONV)!
      })()

      // Force plan mode
      conversations.delete(CONV)
      const freshHandler = createToolGuardHandlers(conversations, tracker)["/preToolUse"]
      // Warm up session
      freshHandler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"

      const result = freshHandler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "sisyphus", description: "Forbidden in plan mode" },
      })

      expect(result.permission).toBe("deny")
      // sisyphus is not allowed in plan mode; count must not increment
      expect(conversations.get(CONV)!.dispatchCounts["subagent:sisyphus"]).toBeUndefined()
    })
  })

  describe("#when input.mode overrides stale plan composerMode", () => {
    it("allows dispatch when input.mode overrides stale plan composerMode", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        mode: "agent",
        tool_input: { subagent_type: "sisyphus", description: "Do work" },
      })

      expect(result.permission).not.toBe("deny")
      const conversation = conversations.get(CONV)!
      expect(conversation.dispatchCounts["subagent:sisyphus"]).toBe(1)
    })
  })

  describe("#when conversation composerMode is agent after plan phase", () => {
    it("allows dispatch when plan-phase todos are all completed", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "agent"

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "sisyphus", description: "Do work" },
      })

      expect(result.permission).not.toBe("deny")
    })
  })

  describe("#when per-turn dispatch counters are updated", () => {
    it("increments dispatchCountsThisTurn alongside dispatchCounts", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "explore", description: "Search codebase" },
      })

      const conversation = conversations.get(CONV)!
      expect(conversation.dispatchCounts["subagent:explore"]).toBe(1)
      expect(conversation.dispatchCountsThisTurn["subagent:explore"]).toBe(1)
      expect(conversation.dispatchCountsThisTurn["Task"]).toBe(1)
    })
  })
})
