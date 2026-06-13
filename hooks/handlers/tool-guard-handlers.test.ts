import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createToolGuardHandlers } from "./tool-guard-handlers"
import type { BackgroundTracker } from "./background-tracker"
import { resetConfigCache } from "../config"
import { conversations, PLAN_PHASE_IDS } from "../shared"
import { contextCollector } from "../context-collector"

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

  describe("#when an explore dispatch is allowed", () => {
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
      conversations.get(CONV)!.todoStates.set("plan-write", "in_progress")

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

  describe("#plan-complete override", () => {
    it("allows worker dispatch when all plan todos are completed", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      const conversation = conversations.get(CONV)!
      conversation.composerMode = "plan"
      for (const id of PLAN_PHASE_IDS) {
        conversation.todoStates.set(id, "completed")
      }

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "sisyphus", description: "Do work after plan" },
      })

      expect(result.permission).not.toBe("deny")
      const after = conversations.get(CONV)!
      expect(after.composerMode).toBe("agent")
      for (const id of PLAN_PHASE_IDS) {
        expect(after.todoStates.has(id)).toBe(false)
      }
    })

    it("blocks worker dispatch when plan todos are incomplete", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"
      conversations.get(CONV)!.todoStates.set("plan-write", "in_progress")

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "sisyphus", description: "Forbidden while plan incomplete" },
      })

      expect(result.permission).toBe("deny")
    })

    it("allows worker dispatch when no plan todos exist", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "sisyphus", description: "No plan todos in map" },
      })

      expect(result.permission).not.toBe("deny")
    })

    it("increments dispatch count after plan-complete override", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      const conversation = conversations.get(CONV)!
      conversation.composerMode = "plan"
      for (const id of PLAN_PHASE_IDS) {
        conversation.todoStates.set(id, "completed")
      }

      handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "sisyphus", description: "Counted dispatch" },
      })

      expect(conversations.get(CONV)!.dispatchCounts["subagent:sisyphus"]).toBe(1)
    })
  })

  describe("#momus iteration tracking", () => {
    it("resets momusIterations when plan-momus transitions to in_progress", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const handlers = createToolGuardHandlers(conversations, tracker)
      const preToolUse = handlers["/preToolUse"]
      const postToolUse = handlers["/postToolUse"]

      preToolUse({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.momusIterations = 3

      postToolUse({
        tool_name: "TodoWrite",
        conversation_id: CONV,
        tool_input: { todos: [{ id: "plan-momus", status: "in_progress", content: "Momus review" }] },
      })

      expect(conversations.get(CONV)!.momusIterations).toBe(0)
    })

    it("returns additional_context with interpolated cap when momus iterations at limit", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.momusIterations = 4

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "momus", description: "Review plan" },
      })

      expect(result.additional_context).toContain("[momus-loop]")
      expect(result.additional_context).toContain("(4)")
      expect(result.additional_context).not.toContain("(3)")
    })

    it("allows momus dispatch and increments counter when below cap", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)

      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.momusIterations = 0

      const result = handler({
        tool_name: "Task",
        conversation_id: CONV,
        tool_input: { subagent_type: "momus", description: "Review plan" },
      })

      expect(result.additional_context ?? "").not.toContain("[momus-loop]")
      expect(conversations.get(CONV)!.momusIterations).toBe(1)
    })
  })
})

describe("createToolGuardHandlers Plan-mode Write-path guard", () => {
  beforeEach(() => {
    conversations.delete(CONV)
  })

  describe("#when Write targets a path outside .cursor/plans and .cursor/drafts in plan mode", () => {
    it("denies the call with a redirect message naming Write and .cursor/plans/", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"

      const result = handler({
        tool_name: "Write",
        conversation_id: CONV,
        tool_input: { file_path: "/mnt/development/oh-my-openagent/src/foo.ts", contents: "x" },
      }) as { permission?: string; userMessage?: string; decision?: string; user_message?: string; agent_message?: string }

      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain(".cursor/plans/")
      expect(result.userMessage).toContain("Write")

      expect(result.decision).toBe("deny")
      expect(result.user_message).toContain(".cursor/plans/")
      expect(result.agent_message).toContain(".cursor/plans/")
    })

    it("does NOT register the denied write in pendingWriteArgs (denied before tracking)", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"

      handler({
        tool_name: "Write",
        conversation_id: CONV,
        tool_use_id: "test-tool-use-id",
        tool_input: { file_path: "/tmp/forbidden.md", contents: "x" },
      })

      expect(conversations.get(CONV)!.pendingWriteArgs.has("test-tool-use-id")).toBe(false)
    })
  })

  describe("#when Write targets .cursor/plans/<slug>.plan.md in plan mode", () => {
    it("allows the call (does not return deny)", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"

      const result = handler({
        tool_name: "Write",
        conversation_id: CONV,
        tool_input: { file_path: ".cursor/plans/foo.plan.md", contents: "x" },
      }) as { permission?: string }

      expect(result?.permission).not.toBe("deny")
    })

    it("also allows .cursor/drafts/", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      conversations.get(CONV)!.composerMode = "plan"

      const result = handler({
        tool_name: "Write",
        conversation_id: CONV,
        tool_input: { file_path: ".cursor/drafts/foo.md", contents: "x" },
      }) as { permission?: string }

      expect(result?.permission).not.toBe("deny")
    })
  })

  describe("#when Write happens in agent mode (not plan mode)", () => {
    it("does NOT apply the path guard (allows any path)", () => {
      const tracker = makeTracker({ [CONV]: [] })
      const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
      handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
      // composerMode left unset (agent default)

      const result = handler({
        tool_name: "Write",
        conversation_id: CONV,
        tool_input: { file_path: "/tmp/scratch.ts", contents: "x" },
      }) as { permission?: string }

      expect(result?.permission).not.toBe("deny")
    })
  })
})

describe("P0 guard advisory", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clearAll()
  })

  it("plan-mode Write guard registers advisory into collector and returns NO additional_context", () => {
    const tracker = makeTracker({ [CONV]: [] })
    const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
    handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
    conversations.get(CONV)!.composerMode = "plan"

    const result = handler({
      tool_name: "Write",
      conversation_id: CONV,
      tool_input: { file_path: "/tmp/forbidden.md", contents: "x" },
    }) as { permission?: string; additional_context?: string; decision?: string; user_message?: string }

    // Deny path stays EXACTLY as-is.
    expect(result.permission).toBe("deny")
    expect(result.decision).toBe("deny")
    expect(result.user_message).toContain(".cursor/plans/")

    // Advisory delivery is rerouted to the piggyback provider: NO additional_context in the response.
    expect(result).not.toHaveProperty("additional_context")

    // Advisory is still REGISTERED (not consumed) so the piggyback provider can deliver it later.
    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[mode-guard]")
  })

  it("ask-mode Task deny registers advisory into collector and returns NO additional_context", () => {
    const tracker = makeTracker({ [CONV]: [] })
    const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
    handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
    conversations.get(CONV)!.composerMode = "ask"

    const result = handler({
      tool_name: "Task",
      conversation_id: CONV,
      tool_input: { subagent_type: "sisyphus", description: "Forbidden in ask mode" },
    }) as { permission?: string; additional_context?: string; decision?: string; user_message?: string }

    expect(result.permission).toBe("deny")
    expect(result.decision).toBe("deny")
    expect(result.user_message).toContain("Ask mode")

    expect(result).not.toHaveProperty("additional_context")

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[mode-guard]")
  })

  it("plan-mode forbidden-agent deny registers advisory into collector and returns NO additional_context", () => {
    const tracker = makeTracker({ [CONV]: [] })
    const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
    handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
    conversations.get(CONV)!.composerMode = "plan"
    conversations.get(CONV)!.todoStates.set("plan-write", "in_progress")

    const result = handler({
      tool_name: "Task",
      conversation_id: CONV,
      tool_input: { subagent_type: "sisyphus", description: "Forbidden agent in plan mode" },
    }) as { permission?: string; additional_context?: string; decision?: string; user_message?: string }

    expect(result.permission).toBe("deny")
    expect(result.decision).toBe("deny")
    expect(result.user_message).toContain("Plan mode")

    expect(result).not.toHaveProperty("additional_context")

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[mode-guard]")
  })
})

describe("TodoWrite tracking via preToolUse", () => {
  let projectDir: string

  beforeEach(() => {
    conversations.delete(CONV)
    resetConfigCache()
    projectDir = mkdtempSync(join(tmpdir(), "tool-guard-todo-pretool-"))
    mkdirSync(join(projectDir, ".cursor"), { recursive: true })
  })

  afterEach(() => {
    resetConfigCache()
    rmSync(projectDir, { recursive: true, force: true })
  })

  function warmSession(handler: (input: Record<string, unknown>) => Record<string, unknown>) {
    handler({ tool_name: "Read", conversation_id: CONV, tool_input: { path: "/tmp/x" } })
    conversations.get(CONV)!.env.OH_MY_CURSOR_PROJECT_DIR = projectDir
  }

  it("tracks todo state in preToolUse when todo_tracking_via_pretool=true", () => {
    writeFileSync(
      join(projectDir, ".cursor", "oh-my-cursor.jsonc"),
      JSON.stringify({ context_collector: { todo_tracking_via_pretool: true } }),
      "utf-8",
    )
    resetConfigCache()

    const tracker = makeTracker({ [CONV]: [] })
    const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
    warmSession(handler)

    handler({
      tool_name: "TodoWrite",
      conversation_id: CONV,
      tool_input: {
        todos: [
          { id: "task-a", content: "First", status: "in_progress" },
          { id: "task-b", content: "Second", status: "pending" },
        ],
        merge: true,
      },
    })

    const conversation = conversations.get(CONV)!
    expect(conversation.todoStates.get("task-a")).toBe("in_progress")
    expect(conversation.todoStates.get("task-b")).toBe("pending")
    expect(conversation.lastTodoSnapshot).toContain("task-a")
  })

  it("does NOT track in preToolUse when todo_tracking_via_pretool=false (default)", () => {
    const tracker = makeTracker({ [CONV]: [] })
    const { "/preToolUse": handler } = createToolGuardHandlers(conversations, tracker)
    warmSession(handler)

    handler({
      tool_name: "TodoWrite",
      conversation_id: CONV,
      tool_input: {
        todos: [{ id: "task-a", content: "First", status: "in_progress" }],
        merge: true,
      },
    })

    const conversation = conversations.get(CONV)!
    expect(conversation.todoStates.size).toBe(0)
    expect(conversation.lastTodoSnapshot).toBe("")
  })
})
